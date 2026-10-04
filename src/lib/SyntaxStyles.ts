import { RGBA, SyntaxStyle, parseColor } from "@opentui/core";
import type { Theme } from "./ThemeSystem";

// Termide syntax theme (material-leaning). Used for the default "Dark" theme; the
// other themes in ThemeSystem supply their own token colours.
const themeStyles = {
  keyword: { fg: RGBA.fromHex("#C792EA"), bold: true },
  type: { fg: RGBA.fromHex("#82AAFF") },
  class: { fg: RGBA.fromHex("#FFCB6B") },
  function: { fg: RGBA.fromHex("#82AAFF") },
  builtin: { fg: RGBA.fromHex("#89DDFF") },
  string: { fg: RGBA.fromHex("#C3E88D") },
  regex: { fg: RGBA.fromHex("#F07178") },
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
};

// Editor decorations (used by addHighlight from FileViewer for bracket matching,
// search matches, word-highlight, etc.). Shared by every theme.
const decorationStyles = {
  bracketMatch: { fg: RGBA.fromHex("#000000"), bg: RGBA.fromHex("#FFCB6B"), bold: true },
  searchMatch: { fg: RGBA.fromHex("#000000"), bg: RGBA.fromHex("#FFFF00") },
  // Active search match (the one Enter jumps to) — orange so it stands out
  // from the yellow used for all matches and the bracketMatch yellow.
  activeSearchMatch: { fg: RGBA.fromHex("#000000"), bg: RGBA.fromHex("#FF8C42"), bold: true },
  selectionMatch: { fg: RGBA.fromHex("#FFFFFF"), bg: RGBA.fromHex("#3a3a3a") },
};

function stylesForTheme(theme: Theme) {
  const c = (color: string) => parseColor(color);
  const s = theme.syntax;
  return {
    keyword: { fg: c(s.keyword), bold: true },
    type: { fg: c(s.type) },
    class: { fg: c(s.class) },
    function: { fg: c(s.function) },
    builtin: { fg: c(s.builtin) },
    string: { fg: c(s.string) },
    regex: { fg: c(s.regex) },
    number: { fg: c(s.number) },
    comment: { fg: c(s.comment), italic: true },
    operator: { fg: c(s.operator) },
    variable: { fg: c(s.variable) },
    property: { fg: c(s.property) },
    constant: { fg: c(s.constant) },
    punctuation: { fg: c(s.punctuation) },
    tag: { fg: c(s.tag) },
    attribute: { fg: c(s.attribute) },
    link: { fg: c(s.function), underline: true },
    heading: { fg: c(s.function), bold: true },
    emphasis: { fg: c(s.keyword), italic: true },
    strong: { fg: c(s.class), bold: true },
    default: { fg: c(s.default) },
  };
}

const cache = new Map<string, SyntaxStyle>();

/** Syntax style for a theme (default: Termide's own dark palette). Cached per theme. */
export function getTermideSyntaxStyle(theme?: Theme | null): SyntaxStyle {
  const id = !theme || theme.id === "dark" ? "dark" : theme.id;
  let style = cache.get(id);
  if (!style) {
    const base = id === "dark" ? themeStyles : stylesForTheme(theme!);
    style = SyntaxStyle.fromStyles({ ...base, ...decorationStyles });
    cache.set(id, style);
  }
  return style;
}
