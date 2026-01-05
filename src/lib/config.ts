/**
 * Centralized configuration for Termide
 * All magic numbers and configurable values should be defined here.
 */

// ============================================================================
// TIMING CONFIGURATION (in milliseconds)
// ============================================================================

export const TIMING = {
  // Git polling intervals
  GIT_STATUS_POLL_INTERVAL: 5000,      // How often to refresh git status
  GIT_GRAPH_POLL_INTERVAL: 10000,      // How often to refresh git graph
  GIT_LINE_DIFF_POLL_INTERVAL: 5000,   // How often to refresh inline diffs
  SOURCE_CONTROL_POLL_INTERVAL: 3000,  // How often to refresh source control panel

  // Cache TTLs
  GIT_CACHE_TTL: 2000,                 // Git status cache duration
  GIT_LINE_DIFF_CACHE_TTL: 3000,       // Line diff cache duration

  // UI feedback durations
  NOTIFICATION_DEFAULT_DURATION: 3000, // Default toast notification duration
  NOTIFICATION_SHORT_DURATION: 1500,   // Short notification (mascot toggle, etc.)
  NOTIFICATION_MEDIUM_DURATION: 2000,  // Medium notification (copy/paste feedback)
  STATUS_MESSAGE_DURATION: 2000,       // Source control status message duration
  DEFINITION_HIGHLIGHT_DURATION: 1500, // How long to highlight jump-to-definition

  // Connection/retry delays
  ACP_CONNECTION_DELAY: 1500,          // Delay before ACP connection attempt

  // Debounce/throttle
  SEARCH_DEBOUNCE: 300,                // Debounce for search input
  SESSION_SAVE_DEBOUNCE: 1000,         // Debounce for session auto-save
  CLOCK_UPDATE_INTERVAL: 1000,         // Clock update interval
} as const;

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

export const LAYOUT = {
  // Default panel sizes (percentage or absolute)
  DEFAULT_TREE_WIDTH: 30,              // File tree width in columns
  DEFAULT_TERMINAL_HEIGHT: 15,         // Terminal height in rows
  MIN_TREE_WIDTH: 20,                  // Minimum file tree width
  MAX_TREE_WIDTH: 60,                  // Maximum file tree width
  MIN_TERMINAL_HEIGHT: 5,              // Minimum terminal height

  // Responsive breakpoints
  SMALL_SCREEN_COLS: 80,               // Below this is "small" screen
  MEDIUM_SCREEN_COLS: 120,             // Below this is "medium" screen

  // Tab bar
  MAX_TAB_WIDTH: 25,                   // Maximum characters for tab name
  TAB_PADDING: 2,                      // Padding around tab text
} as const;

// ============================================================================
// LIMITS & CONSTRAINTS
// ============================================================================

export const LIMITS = {
  // Terminal
  TERMINAL_MAX_HISTORY: 10000,         // Maximum scrollback lines
  TERMINAL_MAX_COLS: 500,              // Maximum terminal columns

  // File handling
  MAX_FILE_SIZE_PREVIEW: 10 * 1024 * 1024,  // 10MB - max file size for preview
  MAX_SEARCH_RESULTS: 1000,            // Maximum search results to display
  MAX_RECENT_FILES: 50,                // Maximum recent files to remember

  // Git
  MAX_GIT_LOG_ENTRIES: 100,            // Maximum git log entries to fetch
  MAX_BLAME_LINES: 5000,               // Maximum lines to fetch blame for

  // UI
  MAX_NOTIFICATIONS: 5,                // Maximum concurrent notifications
  MAX_TABS: 20,                        // Maximum open tabs
} as const;

// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

export const ANIMATION = {
  // Ant mascot animation frames
  ANT_FRAME_INTERVAL: 200,             // Ms between ant animation frames
  ANT_FRAMES: ["🐜", "🐜 ", " 🐜", "🐜"],

  // Loading indicators
  SPINNER_FRAMES: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  SPINNER_INTERVAL: 80,
} as const;

// ============================================================================
// FILE TYPES & PATTERNS
// ============================================================================

export const FILE_PATTERNS = {
  // Files to ignore in file tree
  IGNORED_PATTERNS: [
    "node_modules",
    ".git",
    ".DS_Store",
    "dist",
    "build",
    ".cache",
    ".turbo",
  ],

  // Binary file extensions (don't try to preview)
  BINARY_EXTENSIONS: [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ],
} as const;

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

export const SHORTCUTS = {
  // File operations
  OPEN_FILE: "ctrl+p",
  SAVE_FILE: "ctrl+s",
  CLOSE_TAB: "ctrl+w",

  // Navigation
  FOCUS_TREE: "ctrl+1",
  FOCUS_EDITOR: "ctrl+2",
  FOCUS_TERMINAL: "ctrl+3",

  // Panels
  TOGGLE_TERMINAL: "ctrl+`",
  TOGGLE_SIDEBAR: "ctrl+b",

  // Search
  GLOBAL_SEARCH: "ctrl+shift+f",
  FIND_IN_FILE: "ctrl+f",

  // Commands
  COMMAND_PALETTE: "ctrl+shift+p",
  HELP: "?",
} as const;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULTS = {
  // Editor settings
  TAB_SIZE: 2,
  FONT_SIZE: "normal" as const,
  WORD_WRAP: false,
  LINE_NUMBERS: true,
  INDENT_GUIDES: true,
  MINIMAP: true,
  AUTO_SAVE: false,

  // Terminal settings
  SHELL: process.env.SHELL || "/bin/bash",
  TERM: "xterm-256color",
} as const;

// Type exports for use in components
export type TimingConfig = typeof TIMING;
export type LayoutConfig = typeof LAYOUT;
export type LimitsConfig = typeof LIMITS;
