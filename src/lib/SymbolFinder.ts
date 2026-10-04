import * as path from "path";
import * as fs from "fs";

export interface SymbolLocation {
  filePath: string;
  line: number;
  column: number;
  symbolName: string;
  kind: "function" | "variable" | "class" | "interface" | "type" | "import" | "export" | "property";
}

export interface WordAtPosition {
  word: string;
  startColumn: number;
  endColumn: number;
}

/**
 * Get word at cursor position
 */
export function getWordAtPosition(line: string, column: number): WordAtPosition | null {
  // Match word characters (alphanumeric + underscore + $)
  const wordRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;

  while ((match = wordRegex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (column >= start && column <= end) {
      return {
        word: match[0],
        startColumn: start,
        endColumn: end,
      };
    }
  }

  return null;
}

/**
 * Escape a string for literal use inside a RegExp.
 * 2026-10-04: symbol names were interpolated raw, so `$store` (where `$` is
 * an end-of-input anchor) or any name with regex metacharacters never matched.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Column of capture group 1 within the line (falls back to indexOf).
 * 2026-10-04: `line.indexOf(symbolName)` found the first substring hit, e.g.
 * the "e" inside "let" for `let e = 1`.
 */
function captureColumn(match: RegExpExecArray, line: string, symbolName: string): number {
  const idx = match.indices?.[1]?.[0];
  if (idx !== undefined) return idx;
  const column = line.indexOf(symbolName);
  return column >= 0 ? column : 0;
}

/**
 * Find definition of a symbol in a file
 */
export function findDefinitionInFile(content: string, symbolName: string, filePath: string): SymbolLocation | null {
  if (!symbolName) return null;
  const lines = content.split("\n");
  const name = escapeRegExp(symbolName);
  // Identifier end boundary that also works for names containing `$`
  const E = "(?![\\w$])";

  // Patterns for different definition types. Ordered from most to least
  // reliable; `weak` patterns also match ordinary usages (calls, object
  // literals, arguments) so they are only consulted when no strong
  // definition exists anywhere in the file.
  // 2026-10-04: patterns were tried line by line, so `run(helper)` on line 1
  // beat `function helper()` on line 10.
  const patterns: { regex: RegExp; kind: SymbolLocation["kind"]; weak?: boolean }[] = [
    // Function declarations: function name() or async function name()
    { regex: new RegExp(`(?:async\\s+)?\\bfunction\\s*\\*?\\s*(${name})\\s*[(<]`, "d"), kind: "function" },
    // Arrow functions: const name = () => or const name = async () =>
    { regex: new RegExp(`\\b(?:const|let|var)\\s+(${name})${E}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[\\w$]+)\\s*(?::[^=]+)?=>`, "d"), kind: "function" },
    // Variable declarations: const/let/var name =
    { regex: new RegExp(`\\b(?:const|let|var)\\s+(${name})${E}\\s*[=:;]`, "d"), kind: "variable" },
    // Class declarations: class Name
    { regex: new RegExp(`\\bclass\\s+(${name})(?:\\s+extends|\\s+implements|\\s*\\{|<)`, "d"), kind: "class" },
    // Interface declarations: interface Name
    { regex: new RegExp(`\\binterface\\s+(${name})(?:\\s+extends|\\s*\\{|<)`, "d"), kind: "interface" },
    // Type declarations: type Name =
    { regex: new RegExp(`\\btype\\s+(${name})\\s*[=<]`, "d"), kind: "type" },
    // Export default function/class
    { regex: new RegExp(`export\\s+default\\s+(?:async\\s+)?(?:function|class)\\s+(${name})${E}`, "d"), kind: "export" },
    // Export named: export { name } or export const name
    { regex: new RegExp(`export\\s+(?:const|let|var|function|class|type|interface|enum)\\s+(${name})${E}`, "d"), kind: "export" },
    // Method definition in class: name() { or name = () =>
    { regex: new RegExp(`^\\s+(?:async\\s+)?(?:static\\s+)?(?:private\\s+|protected\\s+|public\\s+)?(${name})\\s*[(<]`, "d"), kind: "function", weak: true },
    // Property definition in object/class
    { regex: new RegExp(`^\\s+(${name})${E}\\s*[=:]`, "d"), kind: "property", weak: true },
    // Parameter destructuring
    { regex: new RegExp(`[({,]\\s*(${name})\\s*[,})]`, "d"), kind: "variable", weak: true },
  ];

  for (const weakPass of [false, true]) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      // An import is not a definition: `import { helper } from "./x"` used to
      // satisfy the weak `{ helper }` pattern, so go-to-definition stopped at
      // the import line instead of following it (2026-10-04).
      if (/^\s*import\s/.test(line) || /^\s*export\s.*\sfrom\s+["']/.test(line)) continue;

      for (const { regex, kind, weak } of patterns) {
        if (!!weak !== weakPass) continue;
        const match = regex.exec(line);
        if (match && match[1] === symbolName) {
          return {
            filePath,
            line: lineIndex,
            column: captureColumn(match, line, symbolName),
            symbolName,
            kind,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extract import info from a line
 */
interface ImportInfo {
  modulePath: string;
  importedNames: string[];
  defaultImport: string | null;
  namespaceImport: string | null;
}

function parseImportLine(line: string): ImportInfo | null {
  // 2026-10-04: `import type { X }` / `import { type X }` (required by
  // verbatimModuleSyntax) were not recognised; strip the `type` modifiers.
  line = line.replace(/^(\s*import\s+)type\s+(?=[{*\w])/, "$1");

  // import X from "path"
  const defaultMatch = line.match(/import\s+([\w$]+)\s+from\s+["']([^"']+)["']/);
  if (defaultMatch) {
    return {
      modulePath: defaultMatch[2]!,
      importedNames: [],
      defaultImport: defaultMatch[1]!,
      namespaceImport: null,
    };
  }

  // import * as X from "path"
  const namespaceMatch = line.match(/import\s+\*\s+as\s+([\w$]+)\s+from\s+["']([^"']+)["']/);
  if (namespaceMatch) {
    return {
      modulePath: namespaceMatch[2]!,
      importedNames: [],
      defaultImport: null,
      namespaceImport: namespaceMatch[1]!,
    };
  }

  // import { X, Y } from "path" or import X, { Y, Z } from "path"
  const namedMatch = line.match(/import\s+(?:([\w$]+)\s*,\s*)?\{([^}]+)\}\s*from\s+["']([^"']+)["']/);
  if (namedMatch) {
    const names = namedMatch[2]!.split(",").map((s) => {
      const trimmed = s.trim().replace(/^type\s+/, "");
      // Handle "X as Y" - return the local name (Y)
      const asMatch = trimmed.match(/([\w$]+)\s+as\s+([\w$]+)/);
      return asMatch ? asMatch[2]! : trimmed;
    }).filter(Boolean);
    return {
      modulePath: namedMatch[3]!,
      importedNames: names,
      defaultImport: namedMatch[1] || null,
      namespaceImport: null,
    };
  }

  return null;
}

/**
 * Find where a symbol is imported from
 */
export function findImportSource(content: string, symbolName: string, currentFilePath: string): string | null {
  // Collect whole import statements so multi-line `import {\n a,\n b\n} from "x"`
  // works (2026-10-04: parsing was line-by-line, so those were never found).
  const statements = content.match(/^\s*import\s[^;'"]*?\sfrom\s*["'][^"']+["']/gm) ?? [];

  for (const statement of statements) {
    const importInfo = parseImportLine(statement.replace(/\s+/g, " "));
    if (!importInfo) continue;

    const isImported =
      importInfo.defaultImport === symbolName ||
      importInfo.namespaceImport === symbolName ||
      importInfo.importedNames.includes(symbolName);

    if (isImported) {
      return resolveModulePath(importInfo.modulePath, currentFilePath);
    }
  }

  return null;
}

/**
 * Resolve a module path relative to current file
 */
function resolveModulePath(modulePath: string, currentFilePath: string): string | null {
  // Skip node_modules imports
  if (!modulePath.startsWith(".") && !modulePath.startsWith("/")) {
    return null;
  }

  const dir = path.dirname(currentFilePath);
  const resolved = path.resolve(dir, modulePath);

  // Try different extensions
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

  for (const ext of extensions) {
    const fullPath = resolved + ext;
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Find definition of a symbol
 */
export function findDefinition(
  currentContent: string,
  currentFilePath: string,
  symbolName: string
): SymbolLocation | null {
  // First, check if it's defined in the current file
  const localDefinition = findDefinitionInFile(currentContent, symbolName, currentFilePath);
  if (localDefinition) {
    return localDefinition;
  }

  // Check if it's imported
  const importSource = findImportSource(currentContent, symbolName, currentFilePath);
  if (importSource) {
    try {
      const importedContent = fs.readFileSync(importSource, "utf-8");
      const importedDefinition = findDefinitionInFile(importedContent, symbolName, importSource);
      if (importedDefinition) {
        return importedDefinition;
      }
      // If not found directly, might be a re-export or default export
      // Return the file location at least
      return {
        filePath: importSource,
        line: 0,
        column: 0,
        symbolName,
        kind: "import",
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get all symbols (functions, classes, interfaces, etc.) in a file
 */
export function getAllSymbols(content: string, filePath: string): SymbolLocation[] {
  const lines = content.split("\n");
  const symbols: SymbolLocation[] = [];

  // Patterns for different symbol types
  const patterns = [
    // Function declarations
    { regex: /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[(<]/d, kind: "function" as const },
    // Arrow functions assigned to const/let/var
    { regex: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/d, kind: "function" as const },
    // Class declarations
    { regex: /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s+extends|\s+implements|\s*\{|<)/d, kind: "class" as const },
    // Interface declarations
    { regex: /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s+extends|\s*\{|<)/d, kind: "interface" as const },
    // Type declarations
    { regex: /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=<]/d, kind: "type" as const },
    // Exported const/let/var (top-level)
    { regex: /^export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/d, kind: "variable" as const },
    // Method definitions in class (with common modifiers)
    { regex: /^\s+(?:async\s+)?(?:static\s+)?(?:private\s+|protected\s+|public\s+)?(?:readonly\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/d, kind: "function" as const },
    // React components (const Component = ...)
    { regex: /(?:const|let|var)\s+([A-Z][a-zA-Z0-9_$]*)\s*[=:]/d, kind: "function" as const },
    // Export default function/class
    { regex: /export\s+default\s+(?:async\s+)?(?:function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/d, kind: "export" as const },
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;

    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    for (const { regex, kind } of patterns) {
      const match = regex.exec(line);
      if (match && match[1]) {
        const symbolName = match[1];
        // Skip common non-symbol matches
        if (["if", "else", "for", "while", "switch", "return", "new", "typeof", "instanceof", "catch", "with", "function"].includes(symbolName)) {
          continue;
        }

        const column = captureColumn(match, line, symbolName);

        // Check if we already have this symbol (avoid duplicates)
        const exists = symbols.some(s => s.symbolName === symbolName && s.line === lineIndex);
        if (!exists) {
          symbols.push({
            filePath,
            line: lineIndex,
            column,
            symbolName,
            kind,
          });
        }
      }
    }
  }

  // Sort by line number
  return symbols.sort((a, b) => a.line - b.line);
}

/**
 * Get icon for symbol kind
 */
export function getSymbolIcon(kind: SymbolLocation["kind"]): string {
  switch (kind) {
    case "function": return "ƒ";
    case "class": return "C";
    case "interface": return "I";
    case "type": return "T";
    case "variable": return "V";
    case "property": return "P";
    case "import": return "→";
    case "export": return "←";
    default: return "•";
  }
}

/**
 * Get color for symbol kind
 */
export function getSymbolColor(kind: SymbolLocation["kind"]): string {
  switch (kind) {
    case "function": return "#dcdcaa"; // Yellow
    case "class": return "#4ec9b0"; // Green
    case "interface": return "#4ec9b0"; // Green
    case "type": return "#4ec9b0"; // Green
    case "variable": return "#9cdcfe"; // Light blue
    case "property": return "#9cdcfe"; // Light blue
    case "import": return "#c586c0"; // Purple
    case "export": return "#c586c0"; // Purple
    default: return "white";
  }
}

/**
 * Find all references to a symbol in a file
 */
export function findReferencesInFile(content: string, symbolName: string, filePath: string): SymbolLocation[] {
  const lines = content.split("\n");
  const references: SymbolLocation[] = [];
  if (!symbolName) return references;
  const wordRegex = new RegExp(`(?<![\\w$])${escapeRegExp(symbolName)}(?![\\w$])`, "g");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    let match;

    while ((match = wordRegex.exec(line)) !== null) {
      references.push({
        filePath,
        line: lineIndex,
        column: match.index,
        symbolName,
        kind: "variable", // Generic kind for references
      });
    }
    wordRegex.lastIndex = 0; // Reset for next line
  }

  return references;
}
