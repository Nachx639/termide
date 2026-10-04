/**
 * Code folding utilities - detect foldable regions in code
 */

export interface FoldableRegion {
  startLine: number;
  endLine: number;
  indent: number;
  type: "function" | "class" | "object" | "array" | "block" | "import" | "comment";
  collapsed: boolean;
}

/**
 * Detect foldable regions in code
 */
export function detectFoldableRegions(lines: string[], language: string | null): FoldableRegion[] {
  const regions: FoldableRegion[] = [];

  // Track bracket depth to find matching braces
  const bracketStack: { char: string; line: number; indent: number }[] = [];

  // Detect import blocks (consecutive imports at the start, after any
  // leading comments/blank lines).
  // 2026-10-04: the region always started at line 0 (even after a license
  // header), a file made only of imports got no region, and a stray `import`
  // deep in the file could create a bogus 0..N region.
  let importStart = -1;
  let importEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("import ") || line.startsWith("from ")) {
      if (importStart < 0) importStart = i;
      importEnd = i;
    } else if (line === "" || (importStart < 0 && isCommentLine(line))) {
      continue;
    } else {
      break;
    }
  }
  if (importStart >= 0 && importEnd > importStart) {
    regions.push({
      startLine: importStart,
      endLine: importEnd,
      indent: 0,
      type: "import",
      collapsed: false,
    });
  }

  // Detect multi-line comments
  let commentStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("/*") && !line.endsWith("*/")) {
      commentStart = i;
    } else if (commentStart >= 0 && line.endsWith("*/")) {
      if (i - commentStart > 1) {
        regions.push({
          startLine: commentStart,
          endLine: i,
          indent: getIndentLevel(lines[commentStart]!),
          type: "comment",
          collapsed: false,
        });
      }
      commentStart = -1;
    }
  }

  // Detect bracket-based regions (functions, classes, objects, arrays).
  // 2026-10-04: brackets inside strings and comments are ignored; before, a
  // `}` in a string or comment closed the wrong block.
  const scanState = { inBlockComment: false };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = getIndentLevel(line);
    const mask = codeMask(line, scanState);

    for (let j = 0; j < line.length; j++) {
      const char = line[j]!;
      if (!mask[j]) continue;

      if (char === "{" || char === "[" || char === "(") {
        bracketStack.push({ char, line: i, indent });
      } else if (char === "}" || char === "]" || char === ")") {
        const openBracket = char === "}" ? "{" : char === "]" ? "[" : "(";
        const matchIdx = findLastOpenBracket(bracketStack, openBracket);

        if (matchIdx >= 0) {
          const start = bracketStack[matchIdx]!;
          bracketStack.splice(matchIdx, 1);

          // Only create foldable region if it spans multiple lines
          if (i - start.line >= 2) {
            const lineText = lines[start.line]!.trim();
            let type: FoldableRegion["type"] = "block";

            if (lineText.match(/^(export\s+)?(async\s+)?function\s/)) {
              type = "function";
            } else if (lineText.match(/^(export\s+)?class\s/)) {
              type = "class";
            } else if (lineText.match(/^(export\s+)?(interface|type)\s/)) {
              type = "block";
            } else if (openBracket === "[") {
              type = "array";
            } else if (openBracket === "{" && lineText.match(/[=:]\s*\{$/)) {
              type = "object";
            }

            regions.push({
              startLine: start.line,
              endLine: i,
              indent: start.indent,
              type,
              collapsed: false,
            });
          }
        }
      }
    }
  }

  // Sort by start line
  regions.sort((a, b) => a.startLine - b.startLine);

  return regions;
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("#")
  );
}

/**
 * Mark which columns of a line are code (true) vs string/comment (false).
 * Tracks block comments across lines through `state`.
 */
function codeMask(line: string, state: { inBlockComment: boolean }): boolean[] {
  const mask = new Array<boolean>(line.length).fill(true);
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment) {
      const close = line.indexOf("*/", i);
      const end = close === -1 ? line.length : close + 2;
      for (let k = i; k < end; k++) mask[k] = false;
      if (close !== -1) state.inBlockComment = false;
      i = end;
      continue;
    }
    const ch = line[i]!;
    if (ch === "/" && line[i + 1] === "/") {
      for (let k = i; k < line.length; k++) mask[k] = false;
      break;
    }
    if (ch === "/" && line[i + 1] === "*") {
      state.inBlockComment = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let k = i + 1;
      while (k < line.length && line[k] !== ch) {
        if (line[k] === "\\") k++;
        k++;
      }
      const end = Math.min(k + 1, line.length);
      for (let m = i; m < end; m++) mask[m] = false;
      i = end;
      continue;
    }
    i++;
  }
  return mask;
}

/**
 * Find the last open bracket of a specific type
 */
function findLastOpenBracket(stack: { char: string; line: number; indent: number }[], char: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.char === char) {
      return i;
    }
  }
  return -1;
}

/**
 * Get indentation level of a line
 */
function getIndentLevel(line: string): number {
  let spaces = 0;
  for (const char of line) {
    if (char === " ") spaces++;
    else if (char === "\t") spaces += 2;
    else break;
  }
  return Math.floor(spaces / 2);
}

/**
 * Get lines to display considering folded regions
 */
export function getVisibleLines(
  lines: string[],
  foldedRegions: Set<number>, // Start lines of folded regions
  regions?: FoldableRegion[]
): { line: string; originalIndex: number; foldedCount?: number }[] {
  const result: { line: string; originalIndex: number; foldedCount?: number }[] = [];
  let i = 0;

  // 2026-10-04: the end of a folded region used to be re-derived by naive
  // bracket counting from the first bracket on the line, so
  // `function f(a) {` "ended" at its own `)` and folding hid nothing (and
  // comment/import regions could never fold). Use the detected regions.
  const endByStart = new Map<number, number>();
  if (foldedRegions.size > 0) {
    for (const r of regions ?? detectFoldableRegions(lines, null)) {
      if (r.endLine > (endByStart.get(r.startLine) ?? -1)) {
        endByStart.set(r.startLine, r.endLine);
      }
    }
  }

  while (i < lines.length) {
    // Check if this line starts a folded region
    const endLine = foldedRegions.has(i) ? endByStart.get(i) : undefined;
    const foldInfo = endLine !== undefined && endLine > i ? { endLine } : null;

    if (foldInfo) {
      // Show the first line with fold indicator
      result.push({
        line: lines[i]!,
        originalIndex: i,
        foldedCount: foldInfo.endLine - i,
      });
      i = foldInfo.endLine + 1;
    } else {
      result.push({
        line: lines[i]!,
        originalIndex: i,
      });
      i++;
    }
  }

  return result;
}

/**
 * Toggle fold at a line
 */
export function toggleFold(
  lineIndex: number,
  regions: FoldableRegion[],
  foldedRegions: Set<number>
): Set<number> {
  const newFolded = new Set(foldedRegions);

  // Find if this line starts a foldable region
  const region = regions.find((r) => r.startLine === lineIndex);
  if (region) {
    if (newFolded.has(lineIndex)) {
      newFolded.delete(lineIndex);
    } else {
      newFolded.add(lineIndex);
    }
  }

  return newFolded;
}

/**
 * Fold all regions
 */
export function foldAll(regions: FoldableRegion[]): Set<number> {
  return new Set(regions.map((r) => r.startLine));
}

/**
 * Unfold all regions
 */
export function unfoldAll(): Set<number> {
  return new Set();
}

/**
 * Get fold marker for a line
 */
export function getFoldMarker(
  lineIndex: number,
  regions: FoldableRegion[],
  foldedRegions: Set<number>
): "none" | "expanded" | "collapsed" | "end" {
  const region = regions.find((r) => r.startLine === lineIndex);
  if (region) {
    return foldedRegions.has(lineIndex) ? "collapsed" : "expanded";
  }

  const endRegion = regions.find((r) => r.endLine === lineIndex);
  if (endRegion && !foldedRegions.has(endRegion.startLine)) {
    return "end";
  }

  return "none";
}
