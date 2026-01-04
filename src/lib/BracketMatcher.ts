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

  while (line < lines.length) {
    const lineText = lines[line] || "";

    while (column < lineText.length) {
      const char = lineText[column];

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

  while (line >= 0) {
    const lineText = lines[line] || "";

    while (column >= 0) {
      const char = lineText[column];

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
