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
 * Find definition of a symbol in a file
 */
export function findDefinitionInFile(content: string, symbolName: string, filePath: string): SymbolLocation | null {
  const lines = content.split("\n");

  // Patterns for different definition types
  const patterns = [
    // Function declarations: function name() or async function name()
    { regex: new RegExp(`(?:async\\s+)?function\\s+(${symbolName})\\s*[(<]`), kind: "function" as const },
    // Arrow functions: const name = () => or const name = async () =>
    { regex: new RegExp(`(?:const|let|var)\\s+(${symbolName})\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|\\w+)\\s*=>`), kind: "function" as const },
    // Variable declarations: const/let/var name =
    { regex: new RegExp(`(?:const|let|var)\\s+(${symbolName})\\s*[=:]`), kind: "variable" as const },
    // Class declarations: class Name
    { regex: new RegExp(`class\\s+(${symbolName})(?:\\s+extends|\\s+implements|\\s*\\{|<)`), kind: "class" as const },
    // Interface declarations: interface Name
    { regex: new RegExp(`interface\\s+(${symbolName})(?:\\s+extends|\\s*\\{|<)`), kind: "interface" as const },
    // Type declarations: type Name =
    { regex: new RegExp(`type\\s+(${symbolName})\\s*[=<]`), kind: "type" as const },
    // Export default function/class
    { regex: new RegExp(`export\\s+default\\s+(?:async\\s+)?(?:function|class)\\s+(${symbolName})`), kind: "export" as const },
    // Export named: export { name } or export const name
    { regex: new RegExp(`export\\s+(?:const|let|var|function|class|type|interface)\\s+(${symbolName})`), kind: "export" as const },
    // Method definition in class: name() { or name = () =>
    { regex: new RegExp(`^\\s+(?:async\\s+)?(?:static\\s+)?(?:private\\s+|protected\\s+|public\\s+)?(${symbolName})\\s*[(<]`), kind: "function" as const },
    // Property definition in object/class
    { regex: new RegExp(`^\\s+(${symbolName})\\s*[=:]`), kind: "property" as const },
    // Parameter destructuring
    { regex: new RegExp(`[({,]\\s*(${symbolName})\\s*[,})]`), kind: "variable" as const },
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;

    for (const { regex, kind } of patterns) {
      const match = regex.exec(line);
      if (match && match[1] === symbolName) {
        const column = line.indexOf(symbolName);
        return {
          filePath,
          line: lineIndex,
          column: column >= 0 ? column : 0,
          symbolName,
          kind,
        };
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
  // import X from "path"
  const defaultMatch = line.match(/import\s+(\w+)\s+from\s+["']([^"']+)["']/);
  if (defaultMatch) {
    return {
      modulePath: defaultMatch[2]!,
      importedNames: [],
      defaultImport: defaultMatch[1]!,
      namespaceImport: null,
    };
  }

  // import * as X from "path"
  const namespaceMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/);
  if (namespaceMatch) {
    return {
      modulePath: namespaceMatch[2]!,
      importedNames: [],
      defaultImport: null,
      namespaceImport: namespaceMatch[1]!,
    };
  }

  // import { X, Y } from "path" or import X, { Y, Z } from "path"
  const namedMatch = line.match(/import\s+(?:(\w+)\s*,\s*)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/);
  if (namedMatch) {
    const names = namedMatch[2]!.split(",").map((s) => {
      const trimmed = s.trim();
      // Handle "X as Y" - return the local name (Y)
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      return asMatch ? asMatch[2]! : trimmed;
    });
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
  const lines = content.split("\n");

  for (const line of lines) {
    const importInfo = parseImportLine(line);
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
 * Find all references to a symbol in a file
 */
export function findReferencesInFile(content: string, symbolName: string, filePath: string): SymbolLocation[] {
  const lines = content.split("\n");
  const references: SymbolLocation[] = [];
  const wordRegex = new RegExp(`\\b${symbolName}\\b`, "g");

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
