/**
 * Theme System for Termide
 * Provides customizable color themes for the entire application
 */

export interface Theme {
  name: string;
  id: string;

  // UI Colors
  background: string;
  foreground: string;
  border: string;
  borderFocused: string;

  // Panel colors
  panelBackground: string;
  panelHeader: string;

  // Selection
  selectionBackground: string;
  selectionForeground: string;
  cursorLine: string;

  // Status bar
  statusBarBackground: string;
  statusBarForeground: string;

  // Accent colors
  accent: string;
  accentSecondary: string;

  // Git colors
  gitAdded: string;
  gitModified: string;
  gitDeleted: string;
  gitUntracked: string;
  gitBranch: string;

  // Syntax highlighting
  syntax: {
    keyword: string;
    string: string;
    comment: string;
    number: string;
    operator: string;
    function: string;
    class: string;
    type: string;
    variable: string;
    property: string;
    punctuation: string;
    builtin: string;
    constant: string;
    tag: string;
    attribute: string;
    regex: string;
    default: string;
  };
}

// Default Dark Theme (Dracula-inspired)
export const DARK_THEME: Theme = {
  name: "Dark",
  id: "dark",

  background: "black",
  foreground: "white",
  border: "gray",
  borderFocused: "cyan",

  panelBackground: "black",
  panelHeader: "cyan",

  selectionBackground: "cyan",
  selectionForeground: "black",
  cursorLine: "gray",

  statusBarBackground: "black",
  statusBarForeground: "white",

  accent: "cyan",
  accentSecondary: "#d4a800",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "#d4a800",
    string: "green",
    comment: "gray",
    number: "#d4a800",
    operator: "cyan",
    function: "blue",
    class: "#d4a800",
    type: "cyan",
    variable: "white",
    property: "cyan",
    punctuation: "white",
    builtin: "cyan",
    constant: "#d4a800",
    tag: "red",
    attribute: "#d4a800",
    regex: "red",
    default: "white",
  },
};

// Light Theme
export const LIGHT_THEME: Theme = {
  name: "Light",
  id: "light",

  background: "white",
  foreground: "black",
  border: "gray",
  borderFocused: "blue",

  panelBackground: "white",
  panelHeader: "blue",

  selectionBackground: "blue",
  selectionForeground: "white",
  cursorLine: "gray",

  statusBarBackground: "gray",
  statusBarForeground: "black",

  accent: "blue",
  accentSecondary: "#d4a800",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "#d4a800",
    string: "green",
    comment: "gray",
    number: "blue",
    operator: "red",
    function: "blue",
    class: "#d4a800",
    type: "cyan",
    variable: "black",
    property: "blue",
    punctuation: "black",
    builtin: "cyan",
    constant: "blue",
    tag: "red",
    attribute: "#d4a800",
    regex: "red",
    default: "black",
  },
};

// Monokai Theme
export const MONOKAI_THEME: Theme = {
  name: "Monokai",
  id: "monokai",

  background: "black",
  foreground: "white",
  border: "gray",
  borderFocused: "#d4a800",

  panelBackground: "black",
  panelHeader: "#d4a800",

  selectionBackground: "#d4a800",
  selectionForeground: "black",
  cursorLine: "gray",

  statusBarBackground: "black",
  statusBarForeground: "white",

  accent: "#d4a800",
  accentSecondary: "#d4a800",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "red",
    string: "#d4a800",
    comment: "gray",
    number: "#d4a800",
    operator: "red",
    function: "green",
    class: "green",
    type: "cyan",
    variable: "white",
    property: "white",
    punctuation: "white",
    builtin: "cyan",
    constant: "#d4a800",
    tag: "red",
    attribute: "green",
    regex: "#d4a800",
    default: "white",
  },
};

// Nord Theme
export const NORD_THEME: Theme = {
  name: "Nord",
  id: "nord",

  background: "black",
  foreground: "white",
  border: "gray",
  borderFocused: "cyan",

  panelBackground: "black",
  panelHeader: "cyan",

  selectionBackground: "cyan",
  selectionForeground: "black",
  cursorLine: "gray",

  statusBarBackground: "black",
  statusBarForeground: "white",

  accent: "cyan",
  accentSecondary: "blue",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "cyan",
    string: "green",
    comment: "gray",
    number: "#d4a800",
    operator: "cyan",
    function: "blue",
    class: "#d4a800",
    type: "cyan",
    variable: "white",
    property: "cyan",
    punctuation: "white",
    builtin: "blue",
    constant: "#d4a800",
    tag: "cyan",
    attribute: "#d4a800",
    regex: "#d4a800",
    default: "white",
  },
};

// Solarized Dark Theme
export const SOLARIZED_DARK_THEME: Theme = {
  name: "Solarized Dark",
  id: "solarized-dark",

  background: "black",
  foreground: "white",
  border: "gray",
  borderFocused: "blue",

  panelBackground: "black",
  panelHeader: "blue",

  selectionBackground: "blue",
  selectionForeground: "white",
  cursorLine: "gray",

  statusBarBackground: "black",
  statusBarForeground: "white",

  accent: "blue",
  accentSecondary: "cyan",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "green",
    string: "cyan",
    comment: "gray",
    number: "#d4a800",
    operator: "green",
    function: "blue",
    class: "#d4a800",
    type: "#d4a800",
    variable: "blue",
    property: "blue",
    punctuation: "white",
    builtin: "red",
    constant: "#d4a800",
    tag: "blue",
    attribute: "#d4a800",
    regex: "red",
    default: "white",
  },
};

// Gruvbox Theme
export const GRUVBOX_THEME: Theme = {
  name: "Gruvbox",
  id: "gruvbox",

  background: "black",
  foreground: "white",
  border: "gray",
  borderFocused: "#d4a800",

  panelBackground: "black",
  panelHeader: "#d4a800",

  selectionBackground: "#d4a800",
  selectionForeground: "black",
  cursorLine: "gray",

  statusBarBackground: "black",
  statusBarForeground: "white",

  accent: "#d4a800",
  accentSecondary: "red",

  gitAdded: "green",
  gitModified: "#d4a800",
  gitDeleted: "red",
  gitUntracked: "gray",
  gitBranch: "#d4a800",

  syntax: {
    keyword: "red",
    string: "green",
    comment: "gray",
    number: "#d4a800",
    operator: "cyan",
    function: "green",
    class: "#d4a800",
    type: "#d4a800",
    variable: "blue",
    property: "cyan",
    punctuation: "white",
    builtin: "#d4a800",
    constant: "#d4a800",
    tag: "red",
    attribute: "#d4a800",
    regex: "cyan",
    default: "white",
  },
};

// All available themes
export const THEMES: Theme[] = [
  DARK_THEME,
  LIGHT_THEME,
  MONOKAI_THEME,
  NORD_THEME,
  SOLARIZED_DARK_THEME,
  GRUVBOX_THEME,
];

// Get theme by ID
export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) || DARK_THEME;
}

// Note: ThemeProvider and useTheme hooks are available in ThemeContext.tsx if needed
