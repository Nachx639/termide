/**
 * File Icons Module
 * Maps file extensions and names to Unicode icons and colors
 */

export interface FileIcon {
  icon: string;
  color: string;
}

// Default icons
const DEFAULT_FILE: FileIcon = { icon: "📄", color: "white" };
const DEFAULT_FOLDER: FileIcon = { icon: "📁", color: "#d4a800" };
const DEFAULT_FOLDER_OPEN: FileIcon = { icon: "📂", color: "#d4a800" };

// Special folder names
const FOLDER_ICONS: Record<string, FileIcon> = {
  ".git": { icon: "", color: "red" },
  "node_modules": { icon: "📦", color: "green" },
  "src": { icon: "📁", color: "blue" },
  "lib": { icon: "📚", color: "blue" },
  "test": { icon: "🧪", color: "#d4a800" },
  "tests": { icon: "🧪", color: "#d4a800" },
  "__tests__": { icon: "🧪", color: "#d4a800" },
  "dist": { icon: "📦", color: "gray" },
  "build": { icon: "🔨", color: "gray" },
  "public": { icon: "🌐", color: "cyan" },
  "assets": { icon: "🎨", color: "#d4a800" },
  "images": { icon: "🖼️", color: "#d4a800" },
  "docs": { icon: "📖", color: "cyan" },
  "components": { icon: "🧩", color: "blue" },
  "hooks": { icon: "🪝", color: "cyan" },
  "utils": { icon: "🔧", color: "#d4a800" },
  "helpers": { icon: "🔧", color: "#d4a800" },
  "config": { icon: "⚙️", color: "gray" },
  "scripts": { icon: "📜", color: "green" },
  "styles": { icon: "🎨", color: "#d4a800" },
  "types": { icon: "📝", color: "cyan" },
  "api": { icon: "🔌", color: "green" },
  "pages": { icon: "📄", color: "blue" },
  "routes": { icon: "🛤️", color: "blue" },
  "middleware": { icon: "⚡", color: "#d4a800" },
  "models": { icon: "💾", color: "blue" },
  "services": { icon: "⚙️", color: "green" },
  "controllers": { icon: "🎮", color: "blue" },
  "views": { icon: "👁️", color: "#d4a800" },
  "templates": { icon: "📋", color: "cyan" },
};

// File extension icons
const EXTENSION_ICONS: Record<string, FileIcon> = {
  // JavaScript/TypeScript
  ".js": { icon: "󰌞", color: "#d4a800" },
  ".jsx": { icon: "⚛️", color: "cyan" },
  ".ts": { icon: "󰛦", color: "blue" },
  ".tsx": { icon: "⚛️", color: "blue" },
  ".mjs": { icon: "󰌞", color: "#d4a800" },
  ".cjs": { icon: "󰌞", color: "#d4a800" },
  ".mts": { icon: "󰛦", color: "blue" },
  ".cts": { icon: "󰛦", color: "blue" },

  // Web
  ".html": { icon: "🌐", color: "red" },
  ".htm": { icon: "🌐", color: "red" },
  ".css": { icon: "🎨", color: "blue" },
  ".scss": { icon: "🎨", color: "#d4a800" },
  ".sass": { icon: "🎨", color: "#d4a800" },
  ".less": { icon: "🎨", color: "blue" },
  ".svg": { icon: "🖼️", color: "#d4a800" },

  // Data/Config
  ".json": { icon: "📋", color: "#d4a800" },
  ".jsonc": { icon: "📋", color: "#d4a800" },
  ".yaml": { icon: "📋", color: "cyan" },
  ".yml": { icon: "📋", color: "cyan" },
  ".toml": { icon: "📋", color: "gray" },
  ".xml": { icon: "📋", color: "red" },
  ".ini": { icon: "⚙️", color: "gray" },
  ".env": { icon: "🔒", color: "#d4a800" },

  // Programming Languages
  ".py": { icon: "🐍", color: "blue" },
  ".rs": { icon: "🦀", color: "red" },
  ".go": { icon: "🔵", color: "cyan" },
  ".rb": { icon: "💎", color: "red" },
  ".php": { icon: "🐘", color: "#d4a800" },
  ".java": { icon: "☕", color: "red" },
  ".kt": { icon: "🅺", color: "#d4a800" },
  ".swift": { icon: "🐦", color: "red" },
  ".c": { icon: "🔷", color: "blue" },
  ".cpp": { icon: "🔷", color: "blue" },
  ".h": { icon: "📎", color: "#d4a800" },
  ".hpp": { icon: "📎", color: "#d4a800" },
  ".cs": { icon: "🟪", color: "#d4a800" },
  ".lua": { icon: "🌙", color: "blue" },
  ".zig": { icon: "⚡", color: "#d4a800" },

  // Shell/Scripts
  ".sh": { icon: "📜", color: "green" },
  ".bash": { icon: "📜", color: "green" },
  ".zsh": { icon: "📜", color: "green" },
  ".fish": { icon: "🐟", color: "green" },
  ".ps1": { icon: "📜", color: "blue" },
  ".bat": { icon: "📜", color: "gray" },
  ".cmd": { icon: "📜", color: "gray" },

  // Documents
  ".md": { icon: "📝", color: "white" },
  ".markdown": { icon: "📝", color: "white" },
  ".txt": { icon: "📄", color: "white" },
  ".pdf": { icon: "📕", color: "red" },
  ".doc": { icon: "📘", color: "blue" },
  ".docx": { icon: "📘", color: "blue" },

  // Images
  ".png": { icon: "🖼️", color: "#d4a800" },
  ".jpg": { icon: "🖼️", color: "#d4a800" },
  ".jpeg": { icon: "🖼️", color: "#d4a800" },
  ".gif": { icon: "🖼️", color: "#d4a800" },
  ".webp": { icon: "🖼️", color: "#d4a800" },
  ".ico": { icon: "🖼️", color: "#d4a800" },
  ".bmp": { icon: "🖼️", color: "#d4a800" },

  // Audio/Video
  ".mp3": { icon: "🎵", color: "#d4a800" },
  ".wav": { icon: "🎵", color: "#d4a800" },
  ".mp4": { icon: "🎬", color: "#d4a800" },
  ".webm": { icon: "🎬", color: "#d4a800" },
  ".avi": { icon: "🎬", color: "#d4a800" },

  // Archives
  ".zip": { icon: "📦", color: "#d4a800" },
  ".tar": { icon: "📦", color: "#d4a800" },
  ".gz": { icon: "📦", color: "#d4a800" },
  ".rar": { icon: "📦", color: "#d4a800" },
  ".7z": { icon: "📦", color: "#d4a800" },

  // Database
  ".sql": { icon: "💾", color: "cyan" },
  ".db": { icon: "💾", color: "cyan" },
  ".sqlite": { icon: "💾", color: "cyan" },

  // Lock files
  ".lock": { icon: "🔒", color: "gray" },

  // Misc
  ".log": { icon: "📋", color: "gray" },
  ".bak": { icon: "💾", color: "gray" },
  ".tmp": { icon: "⏳", color: "gray" },
  ".wasm": { icon: "⚡", color: "#d4a800" },
};

// Special file names
const SPECIAL_FILES: Record<string, FileIcon> = {
  "package.json": { icon: "📦", color: "green" },
  "package-lock.json": { icon: "🔒", color: "gray" },
  "bun.lockb": { icon: "🔒", color: "#d4a800" },
  "yarn.lock": { icon: "🔒", color: "blue" },
  "pnpm-lock.yaml": { icon: "🔒", color: "#d4a800" },
  "tsconfig.json": { icon: "⚙️", color: "blue" },
  "jsconfig.json": { icon: "⚙️", color: "#d4a800" },
  ".gitignore": { icon: "🙈", color: "gray" },
  ".gitattributes": { icon: "", color: "gray" },
  ".gitmodules": { icon: "", color: "gray" },
  ".npmrc": { icon: "📦", color: "red" },
  ".nvmrc": { icon: "📦", color: "green" },
  ".editorconfig": { icon: "⚙️", color: "gray" },
  ".prettierrc": { icon: "🎨", color: "cyan" },
  ".prettierrc.json": { icon: "🎨", color: "cyan" },
  ".prettierignore": { icon: "🎨", color: "gray" },
  ".eslintrc": { icon: "🔍", color: "#d4a800" },
  ".eslintrc.json": { icon: "🔍", color: "#d4a800" },
  ".eslintrc.js": { icon: "🔍", color: "#d4a800" },
  ".eslintignore": { icon: "🔍", color: "gray" },
  "README.md": { icon: "📖", color: "cyan" },
  "README": { icon: "📖", color: "cyan" },
  "LICENSE": { icon: "📜", color: "#d4a800" },
  "LICENSE.md": { icon: "📜", color: "#d4a800" },
  "CHANGELOG.md": { icon: "📋", color: "green" },
  "CONTRIBUTING.md": { icon: "🤝", color: "blue" },
  "Dockerfile": { icon: "🐳", color: "blue" },
  "docker-compose.yml": { icon: "🐳", color: "blue" },
  "docker-compose.yaml": { icon: "🐳", color: "blue" },
  ".dockerignore": { icon: "🐳", color: "gray" },
  "Makefile": { icon: "🔨", color: "gray" },
  "CMakeLists.txt": { icon: "🔨", color: "blue" },
  "Cargo.toml": { icon: "🦀", color: "red" },
  "Cargo.lock": { icon: "🔒", color: "gray" },
  "go.mod": { icon: "🔵", color: "cyan" },
  "go.sum": { icon: "🔒", color: "gray" },
  "requirements.txt": { icon: "🐍", color: "blue" },
  "Pipfile": { icon: "🐍", color: "blue" },
  "Pipfile.lock": { icon: "🔒", color: "gray" },
  "setup.py": { icon: "🐍", color: "blue" },
  "pyproject.toml": { icon: "🐍", color: "blue" },
  ".env": { icon: "🔒", color: "#d4a800" },
  ".env.local": { icon: "🔒", color: "#d4a800" },
  ".env.development": { icon: "🔒", color: "green" },
  ".env.production": { icon: "🔒", color: "red" },
  ".env.example": { icon: "📋", color: "gray" },
  "CLAUDE.md": { icon: "🤖", color: "cyan" },
  "vite.config.ts": { icon: "⚡", color: "#d4a800" },
  "vite.config.js": { icon: "⚡", color: "#d4a800" },
  "webpack.config.js": { icon: "📦", color: "blue" },
  "rollup.config.js": { icon: "📦", color: "red" },
  "babel.config.js": { icon: "🔧", color: "#d4a800" },
  ".babelrc": { icon: "🔧", color: "#d4a800" },
  "jest.config.js": { icon: "🧪", color: "red" },
  "jest.config.ts": { icon: "🧪", color: "red" },
  "vitest.config.ts": { icon: "🧪", color: "green" },
  "tailwind.config.js": { icon: "🎨", color: "cyan" },
  "tailwind.config.ts": { icon: "🎨", color: "cyan" },
  "postcss.config.js": { icon: "🎨", color: "red" },
};

// Lower-cased index of SPECIAL_FILES for case-insensitive fallback lookups.
// 2026-10-04: the fallback looked up the lower-cased name in SPECIAL_FILES,
// whose keys are mixed-case, so "readme.md", "Readme.md", "dockerfile" or
// "makefile" never got their special icon.
const SPECIAL_FILES_LOWER: Record<string, FileIcon> = Object.fromEntries(
  Object.entries(SPECIAL_FILES).map(([name, icon]) => [name.toLowerCase(), icon])
);

export function getFileIcon(filename: string, isDirectory: boolean, isExpanded: boolean = false): FileIcon {
  const lowerName = filename.toLowerCase();

  // Check if it's a directory
  if (isDirectory) {
    // Check for special folder names
    if (FOLDER_ICONS[lowerName]) {
      const icon = FOLDER_ICONS[lowerName];
      // Folders that use the generic closed-folder glyph show it open when expanded
      return isExpanded && icon.icon === DEFAULT_FOLDER.icon ? { ...icon, icon: DEFAULT_FOLDER_OPEN.icon } : icon;
    }
    return isExpanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER;
  }

  // Check for special file names (exact match)
  if (SPECIAL_FILES[filename]) {
    return SPECIAL_FILES[filename];
  }
  if (SPECIAL_FILES_LOWER[lowerName]) {
    return SPECIAL_FILES_LOWER[lowerName];
  }

  // Check by extension
  const extMatch = filename.match(/\.[^.]+$/);
  if (extMatch) {
    const ext = extMatch[0].toLowerCase();
    if (EXTENSION_ICONS[ext]) {
      return EXTENSION_ICONS[ext];
    }
  }

  return DEFAULT_FILE;
}

// Compact version with simpler icons (better terminal compatibility)
export function getFileIconSimple(filename: string, isDirectory: boolean, isExpanded: boolean = false): { icon: string; color: string } {
  const lowerName = filename.toLowerCase();

  if (isDirectory) {
    return isExpanded
      ? { icon: "▼", color: "#d4a800" }
      : { icon: "▶", color: "#d4a800" };
  }

  // Get extension
  const extMatch = filename.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";

  // Categorize by type
  switch (ext) {
    // Code files
    case ".js":
    case ".jsx":
    case ".ts":
    case ".tsx":
    case ".mjs":
    case ".cjs":
      return { icon: "◆", color: "#d4a800" };

    // Web files
    case ".html":
    case ".htm":
    case ".css":
    case ".scss":
      return { icon: "◇", color: "blue" };

    // Data files
    case ".json":
    case ".yaml":
    case ".yml":
    case ".toml":
    case ".xml":
      return { icon: "◈", color: "cyan" };

    // Docs
    case ".md":
    case ".txt":
    case ".pdf":
      return { icon: "◎", color: "white" };

    // Config
    case ".env":
    case ".lock":
      return { icon: "◉", color: "gray" };

    // Scripts
    case ".sh":
    case ".bash":
    case ".zsh":
      return { icon: "▣", color: "green" };

    // Other languages
    case ".py":
      return { icon: "◆", color: "blue" };
    case ".rs":
      return { icon: "◆", color: "red" };
    case ".go":
      return { icon: "◆", color: "cyan" };

    default:
      return { icon: "○", color: "white" };
  }
}
