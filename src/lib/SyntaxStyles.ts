import { RGBA, SyntaxStyle } from "@opentui/core";

// Termide syntax theme (monokai-leaning, matches the existing token colors
// used by the manual SyntaxHighlighter in lib/SyntaxHighlighter.ts so that
// native opentui rendering and the legacy FileViewer renderer look alike).
const themeStyles = {
  keyword: { fg: RGBA.fromHex("#C792EA"), bold: true },
  type: { fg: RGBA.fromHex("#82AAFF") },
  function: { fg: RGBA.fromHex("#82AAFF") },
  string: { fg: RGBA.fromHex("#C3E88D") },
  number: { fg: RGBA.fromHex("#F78C6C") },
  comment: { fg: RGBA.fromHex("#676E95"), italic: true },
  operator: { fg: RGBA.fromHex("#89DDFF") },
  variable: { fg: RGBA.fromHex("#EEFFFF") },
  property: { fg: RGBA.fromHex("#FFCB6B") },
  constant: { fg: RGBA.fromHex("#F78C6C") },
  punctuation: { fg: RGBA.fromHex("#A6ACCD") },
  tag: { fg: RGBA.fromHex("#F07178") },
  attribute: { fg: RGBA.fromHex("#FFCB6B") },
  link: { fg: RGBA.fromHex("#82AAFF"), underline: true },
  heading: { fg: RGBA.fromHex("#82AAFF"), bold: true },
  emphasis: { fg: RGBA.fromHex("#C792EA"), italic: true },
  strong: { fg: RGBA.fromHex("#FFCB6B"), bold: true },
  default: { fg: RGBA.fromHex("#EEFFFF") },
  // Editor decorations (used by addHighlight from FileViewer for bracket
  // matching, search matches, word-highlight, etc.)
  bracketMatch: { fg: RGBA.fromHex("#000000"), bg: RGBA.fromHex("#FFCB6B"), bold: true },
  searchMatch: { fg: RGBA.fromHex("#000000"), bg: RGBA.fromHex("#FFFF00") },
  selectionMatch: { fg: RGBA.fromHex("#FFFFFF"), bg: RGBA.fromHex("#3a3a3a") },
};

let cached: SyntaxStyle | null = null;

export function getTermideSyntaxStyle(): SyntaxStyle {
  if (!cached) {
    cached = SyntaxStyle.fromStyles(themeStyles);
  }
  return cached;
}
