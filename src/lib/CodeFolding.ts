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

  // Detect import blocks (consecutive imports at the start)
  let importEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("import ") || line.startsWith("from ") || line === "") {
      if (line.startsWith("import ") || line.startsWith("from ")) {
        importEnd = i;
      }
    } else if (importEnd > 0) {
      regions.push({
        startLine: 0,
        endLine: importEnd,
        indent: 0,
        type: "import",
        collapsed: false,
      });
      break;
    }
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

  // Detect bracket-based regions (functions, classes, objects, arrays)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = getIndentLevel(line);

    for (let j = 0; j < line.length; j++) {
      const char = line[j]!;

      if (char === "{" || char === "[" || char === "(") {
        // Check if this is the start of a multi-line block
        const lineText = line.trim();
        let type: FoldableRegion["type"] = "block";

        if (lineText.match(/^\s*(function|async\s+function|class|interface|type)\s/)) {
          type = lineText.startsWith("class") ? "class" : "function";
        } else if (lineText.match(/^\s*(const|let|var)\s+\w+\s*=\s*\{/)) {
          type = "object";
        } else if (lineText.match(/^\s*(const|let|var)\s+\w+\s*=\s*\[/)) {
          type = "array";
        } else if (char === "{") {
          type = "block";
        } else if (char === "[") {
          type = "array";
        }

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
  foldedRegions: Set<number> // Start lines of folded regions
): { line: string; originalIndex: number; foldedCount?: number }[] {
  const result: { line: string; originalIndex: number; foldedCount?: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    // Check if this line starts a folded region
    const foldInfo = findFoldedRegionAt(i, foldedRegions, lines);

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
 * Find if a line is the start of a folded region
 */
function findFoldedRegionAt(
  lineIndex: number,
  foldedRegions: Set<number>,
  lines: string[]
): { endLine: number } | null {
  if (!foldedRegions.has(lineIndex)) return null;

  // Find the matching end bracket
  const line = lines[lineIndex]!;
  let depth = 0;
  let foundOpen = false;

  for (let i = lineIndex; i < lines.length; i++) {
    const currentLine = lines[i]!;
    for (const char of currentLine) {
      if (char === "{" || char === "[" || char === "(") {
        depth++;
        foundOpen = true;
      } else if (char === "}" || char === "]" || char === ")") {
        depth--;
        if (foundOpen && depth === 0) {
          return { endLine: i };
        }
      }
    }
  }

  return null;
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
