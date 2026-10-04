// Bracket matching utility for code editors

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
};

const CLOSING_BRACKETS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  ">": "<",
};

/**
 * Classify each column of a line as code (true) or string/comment (false).
 * Single-line only: handles '...', "...", `...`, // comments and /* ... *\/
 * that open and close on the same line. A line comment or unterminated
 * string runs to the end of the line.
 *
 * 2026-10-04: brackets inside strings/comments (e.g. `log("(")`) used to be
 * counted, so the matcher paired the wrong brackets.
 */
function codeMask(lineText: string): boolean[] {
  const mask = new Array<boolean>(lineText.length).fill(true);
  let i = 0;
  while (i < lineText.length) {
    const ch = lineText[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const start = i;
      i++;
      while (i < lineText.length && lineText[i] !== ch) {
        if (lineText[i] === "\\") i++;
        i++;
      }
      const end = Math.min(i, lineText.length - 1);
      for (let k = start; k <= end; k++) mask[k] = false;
      i = end + 1;
      continue;
    }
    if (ch === "/" && lineText[i + 1] === "/") {
      for (let k = i; k < lineText.length; k++) mask[k] = false;
      break;
    }
    if (ch === "/" && lineText[i + 1] === "*") {
      const close = lineText.indexOf("*/", i + 2);
      const end = close === -1 ? lineText.length - 1 : close + 1;
      for (let k = i; k <= end; k++) mask[k] = false;
      i = end + 1;
      continue;
    }
    i++;
  }
  return mask;
}

/**
 * `<` / `>` are only brackets in generics/tags. Arrows (`=>`, `->`), shifts
 * and comparisons (`<=`, `>=`, `a < b`) are operators.
 */
function isAngleOperator(lineText: string, column: number): boolean {
  const ch = lineText[column];
  if (ch !== "<" && ch !== ">") return false;
  const prev = lineText[column - 1];
  const next = lineText[column + 1];
  if (ch === ">" && (prev === "=" || prev === "-")) return true;
  if (next === "=") return true;
  // `<<` is a shift; `>>` is left alone since it usually closes nested generics
  if (ch === "<" && (next === "<" || prev === "<")) return true;
  // Spaced on both sides: comparison, not a generic/tag
  if ((prev === " " || prev === "\t") && (next === " " || next === "\t")) return true;
  return false;
}

class LineClassifier {
  private cache = new Map<number, boolean[]>();
  constructor(private lines: string[]) {}
  isCode(line: number, column: number): boolean {
    let mask = this.cache.get(line);
    if (!mask) {
      mask = codeMask(this.lines[line] || "");
      this.cache.set(line, mask);
    }
    return mask[column] ?? true;
  }
}

export interface BracketMatch {
  openLine: number;
  openColumn: number;
  closeLine: number;
  closeColumn: number;
  bracket: string;
}

/**
 * Find the matching bracket position for a bracket at the given position
 */
export function findMatchingBracket(
  lines: string[],
  line: number,
  column: number
): BracketMatch | null {
  const lineText = lines[line];
  if (!lineText) return null;

  const char = lineText[column];
  if (!char) return null;
  if (isAngleOperator(lineText, column)) return null;

  // Check if cursor is on an opening bracket
  if (BRACKET_PAIRS[char]) {
    return findClosingBracket(lines, line, column, char, BRACKET_PAIRS[char]!);
  }

  // Check if cursor is on a closing bracket
  if (CLOSING_BRACKETS[char]) {
    return findOpeningBracket(lines, line, column, char, CLOSING_BRACKETS[char]!);
  }

  return null;
}

/**
 * Find the closing bracket that matches an opening bracket
 */
function findClosingBracket(
  lines: string[],
  startLine: number,
  startColumn: number,
  openBracket: string,
  closeBracket: string
): BracketMatch | null {
  let depth = 1;
  let line = startLine;
  let column = startColumn + 1;
  const classifier = new LineClassifier(lines);
  const startIsCode = classifier.isCode(startLine, startColumn);

  while (line < lines.length) {
    const lineText = lines[line] || "";

    while (column < lineText.length) {
      const char = lineText[column];

      if (
        (char !== openBracket && char !== closeBracket) ||
        classifier.isCode(line, column) !== startIsCode ||
        isAngleOperator(lineText, column)
      ) {
        column++;
        continue;
      }

      if (char === openBracket) {
        depth++;
      } else if (char === closeBracket) {
        depth--;
        if (depth === 0) {
          return {
            openLine: startLine,
            openColumn: startColumn,
            closeLine: line,
            closeColumn: column,
            bracket: openBracket,
          };
        }
      }
      column++;
    }

    line++;
    column = 0;
  }

  return null;
}

/**
 * Find the opening bracket that matches a closing bracket
 */
function findOpeningBracket(
  lines: string[],
  startLine: number,
  startColumn: number,
  closeBracket: string,
  openBracket: string
): BracketMatch | null {
  let depth = 1;
  let line = startLine;
  let column = startColumn - 1;
  const classifier = new LineClassifier(lines);
  const startIsCode = classifier.isCode(startLine, startColumn);

  while (line >= 0) {
    const lineText = lines[line] || "";

    while (column >= 0) {
      const char = lineText[column];

      if (
        (char !== openBracket && char !== closeBracket) ||
        classifier.isCode(line, column) !== startIsCode ||
        isAngleOperator(lineText, column)
      ) {
        column--;
        continue;
      }

      if (char === closeBracket) {
        depth++;
      } else if (char === openBracket) {
        depth--;
        if (depth === 0) {
          return {
            openLine: line,
            openColumn: column,
            closeLine: startLine,
            closeColumn: startColumn,
            bracket: openBracket,
          };
        }
      }
      column--;
    }

    line--;
    if (line >= 0) {
      column = (lines[line]?.length || 0) - 1;
    }
  }

  return null;
}

/**
 * Check if a character is any type of bracket
 */
export function isBracket(char: string): boolean {
  return BRACKET_PAIRS[char] !== undefined || CLOSING_BRACKETS[char] !== undefined;
}

/**
 * Get the bracket at a given position, or adjacent bracket if cursor is next to one
 */
export function getBracketAtPosition(
  lines: string[],
  line: number,
  column: number
): { line: number; column: number; bracket: string } | null {
  const lineText = lines[line];
  if (!lineText) return null;

  // Check current position
  const char = lineText[column];
  if (char && isBracket(char)) {
    return { line, column, bracket: char };
  }

  // Check position before cursor
  if (column > 0) {
    const prevChar = lineText[column - 1];
    if (prevChar && isBracket(prevChar)) {
      return { line, column: column - 1, bracket: prevChar };
    }
  }

  return null;
}
