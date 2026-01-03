/**
 * Lightweight Syntax Highlighter for Terminal
 * Supports common languages with regex-based tokenization
 */

export interface Token {
  text: string;
  type: TokenType;
}

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "operator"
  | "function"
  | "class"
  | "type"
  | "variable"
  | "property"
  | "punctuation"
  | "builtin"
  | "constant"
  | "tag"
  | "attribute"
  | "regex"
  | "default";

export interface Theme {
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
}

// Default dark theme inspired by One Dark / Dracula
export const DARK_THEME: Theme = {
  keyword: "magenta",
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
};

// Language definitions with regex patterns
interface LanguageDefinition {
  keywords: string[];
  builtins?: string[];
  types?: string[];
  constants?: string[];
  stringDelimiters: string[];
  commentPatterns: {
    single?: string;
    multiStart?: string;
    multiEnd?: string;
  };
  operators?: string[];
}

const LANGUAGES: Record<string, LanguageDefinition> = {
  javascript: {
    keywords: [
      "async", "await", "break", "case", "catch", "class", "const", "continue",
      "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
      "for", "function", "if", "import", "in", "instanceof", "let", "new", "of",
      "return", "static", "super", "switch", "this", "throw", "try", "typeof",
      "var", "void", "while", "with", "yield", "from", "as", "get", "set"
    ],
    builtins: [
      "console", "window", "document", "navigator", "Array", "Object", "String",
      "Number", "Boolean", "Function", "Symbol", "Map", "Set", "WeakMap", "WeakSet",
      "Promise", "Proxy", "Reflect", "JSON", "Math", "Date", "RegExp", "Error",
      "setTimeout", "setInterval", "clearTimeout", "clearInterval", "fetch",
      "require", "module", "exports", "process", "Buffer", "__dirname", "__filename"
    ],
    constants: ["true", "false", "null", "undefined", "NaN", "Infinity"],
    stringDelimiters: ['"', "'", "`"],
    commentPatterns: { single: "//", multiStart: "/*", multiEnd: "*/" },
    operators: ["=>", "===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "?."],
  },
  typescript: {
    keywords: [
      "async", "await", "break", "case", "catch", "class", "const", "continue",
      "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
      "for", "function", "if", "import", "in", "instanceof", "let", "new", "of",
      "return", "static", "super", "switch", "this", "throw", "try", "typeof",
      "var", "void", "while", "with", "yield", "from", "as", "get", "set",
      "implements", "interface", "namespace", "private", "protected", "public",
      "abstract", "readonly", "declare", "enum", "type", "keyof", "infer", "is"
    ],
    builtins: [
      "console", "window", "document", "navigator", "Array", "Object", "String",
      "Number", "Boolean", "Function", "Symbol", "Map", "Set", "WeakMap", "WeakSet",
      "Promise", "Proxy", "Reflect", "JSON", "Math", "Date", "RegExp", "Error",
      "setTimeout", "setInterval", "clearTimeout", "clearInterval", "fetch",
      "require", "module", "exports", "process", "Buffer", "__dirname", "__filename",
      "Partial", "Required", "Readonly", "Record", "Pick", "Omit", "Exclude",
      "Extract", "NonNullable", "ReturnType", "InstanceType", "Parameters"
    ],
    types: ["string", "number", "boolean", "any", "unknown", "never", "void", "object"],
    constants: ["true", "false", "null", "undefined", "NaN", "Infinity"],
    stringDelimiters: ['"', "'", "`"],
    commentPatterns: { single: "//", multiStart: "/*", multiEnd: "*/" },
    operators: ["=>", "===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "?."],
  },
  python: {
    keywords: [
      "and", "as", "assert", "async", "await", "break", "class", "continue",
      "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
      "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
      "raise", "return", "try", "while", "with", "yield", "match", "case"
    ],
    builtins: [
      "print", "len", "range", "str", "int", "float", "bool", "list", "dict",
      "set", "tuple", "type", "isinstance", "hasattr", "getattr", "setattr",
      "open", "input", "map", "filter", "zip", "enumerate", "sorted", "reversed",
      "sum", "min", "max", "abs", "round", "pow", "all", "any", "iter", "next",
      "super", "property", "staticmethod", "classmethod", "self", "cls"
    ],
    constants: ["True", "False", "None"],
    stringDelimiters: ['"', "'", '"""', "'''"],
    commentPatterns: { single: "#" },
  },
  rust: {
    keywords: [
      "as", "async", "await", "break", "const", "continue", "crate", "dyn",
      "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in",
      "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
      "self", "Self", "static", "struct", "super", "trait", "true", "type",
      "unsafe", "use", "where", "while"
    ],
    builtins: [
      "Option", "Some", "None", "Result", "Ok", "Err", "Vec", "String",
      "Box", "Rc", "Arc", "Cell", "RefCell", "HashMap", "HashSet", "BTreeMap",
      "println", "print", "format", "panic", "assert", "debug_assert",
      "todo", "unimplemented", "unreachable"
    ],
    types: ["i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize", "f32", "f64", "bool", "char", "str"],
    stringDelimiters: ['"'],
    commentPatterns: { single: "//", multiStart: "/*", multiEnd: "*/" },
  },
  go: {
    keywords: [
      "break", "case", "chan", "const", "continue", "default", "defer", "else",
      "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
      "map", "package", "range", "return", "select", "struct", "switch", "type", "var"
    ],
    builtins: [
      "append", "cap", "close", "complex", "copy", "delete", "imag", "len",
      "make", "new", "panic", "print", "println", "real", "recover"
    ],
    types: ["bool", "byte", "complex64", "complex128", "error", "float32", "float64", "int", "int8", "int16", "int32", "int64", "rune", "string", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr"],
    constants: ["true", "false", "nil", "iota"],
    stringDelimiters: ['"', "'", "`"],
    commentPatterns: { single: "//", multiStart: "/*", multiEnd: "*/" },
  },
  json: {
    keywords: [],
    constants: ["true", "false", "null"],
    stringDelimiters: ['"'],
    commentPatterns: {},
  },
  html: {
    keywords: [],
    stringDelimiters: ['"', "'"],
    commentPatterns: { multiStart: "<!--", multiEnd: "-->" },
  },
  css: {
    keywords: [
      "important", "inherit", "initial", "unset", "revert", "auto", "none"
    ],
    stringDelimiters: ['"', "'"],
    commentPatterns: { multiStart: "/*", multiEnd: "*/" },
  },
  markdown: {
    keywords: [],
    stringDelimiters: [],
    commentPatterns: {},
  },
  shell: {
    keywords: [
      "if", "then", "else", "elif", "fi", "case", "esac", "for", "while",
      "do", "done", "in", "function", "return", "exit", "break", "continue",
      "local", "export", "readonly", "declare", "typeset", "unset"
    ],
    builtins: [
      "echo", "printf", "read", "cd", "pwd", "ls", "cat", "grep", "sed", "awk",
      "find", "xargs", "sort", "uniq", "wc", "head", "tail", "cut", "tr",
      "test", "source", "alias", "eval", "exec", "shift", "set"
    ],
    stringDelimiters: ['"', "'"],
    commentPatterns: { single: "#" },
  },
};

// File extension to language mapping
const EXT_TO_LANG: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "python",
  ".pyw": "python",
  ".rs": "rust",
  ".go": "go",
  ".json": "json",
  ".jsonc": "json",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".sass": "css",
  ".less": "css",
  ".md": "markdown",
  ".markdown": "markdown",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".xml": "html",
  ".svg": "html",
};

export function detectLanguage(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

export function tokenizeLine(line: string, lang: string | null): Token[] {
  if (!lang || !LANGUAGES[lang]) {
    return [{ text: line, type: "default" }];
  }

  const def = LANGUAGES[lang];
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Check for single-line comment
    if (def.commentPatterns.single && line.slice(i).startsWith(def.commentPatterns.single)) {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    // Check for multi-line comment start (simplified - single line only for now)
    if (def.commentPatterns.multiStart && line.slice(i).startsWith(def.commentPatterns.multiStart)) {
      const endIdx = line.indexOf(def.commentPatterns.multiEnd!, i + def.commentPatterns.multiStart.length);
      if (endIdx !== -1) {
        tokens.push({ text: line.slice(i, endIdx + def.commentPatterns.multiEnd!.length), type: "comment" });
        i = endIdx + def.commentPatterns.multiEnd!.length;
        continue;
      } else {
        tokens.push({ text: line.slice(i), type: "comment" });
        break;
      }
    }

    // Check for strings
    let stringMatch = false;
    for (const delim of def.stringDelimiters) {
      if (line.slice(i).startsWith(delim)) {
        const isTriple = delim.length === 3;
        let endIdx = i + delim.length;
        let escaped = false;

        while (endIdx < line.length) {
          if (escaped) {
            escaped = false;
            endIdx++;
            continue;
          }
          if (line[endIdx] === "\\") {
            escaped = true;
            endIdx++;
            continue;
          }
          if (line.slice(endIdx).startsWith(delim)) {
            endIdx += delim.length;
            break;
          }
          endIdx++;
        }

        tokens.push({ text: line.slice(i, endIdx), type: "string" });
        i = endIdx;
        stringMatch = true;
        break;
      }
    }
    if (stringMatch) continue;

    // Check for numbers
    const numMatch = line.slice(i).match(/^(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:e[+-]?\d+)?)/);
    if (numMatch && (i === 0 || /[\s\(\[\{,;:=<>!&|+\-*/%]/.test(line[i - 1]))) {
      tokens.push({ text: numMatch[0], type: "number" });
      i += numMatch[0].length;
      continue;
    }

    // Check for operators
    if (def.operators) {
      let opMatch = false;
      for (const op of def.operators.sort((a, b) => b.length - a.length)) {
        if (line.slice(i).startsWith(op)) {
          tokens.push({ text: op, type: "operator" });
          i += op.length;
          opMatch = true;
          break;
        }
      }
      if (opMatch) continue;
    }

    // Check for identifiers (keywords, builtins, etc.)
    const identMatch = line.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (identMatch) {
      const word = identMatch[0];
      let type: TokenType = "default";

      if (def.keywords.includes(word)) {
        type = "keyword";
      } else if (def.builtins?.includes(word)) {
        type = "builtin";
      } else if (def.types?.includes(word)) {
        type = "type";
      } else if (def.constants?.includes(word)) {
        type = "constant";
      } else if (line[i + word.length] === "(") {
        type = "function";
      } else if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        type = "class";
      }

      tokens.push({ text: word, type });
      i += word.length;
      continue;
    }

    // Single character operators
    const singleOp = /^[+\-*/%=<>!&|^~?:]/;
    if (singleOp.test(line[i])) {
      tokens.push({ text: line[i], type: "operator" });
      i++;
      continue;
    }

    // Punctuation
    const punct = /^[(){}\[\],;.@#]/;
    if (punct.test(line[i])) {
      tokens.push({ text: line[i], type: "punctuation" });
      i++;
      continue;
    }

    // Default: single character
    tokens.push({ text: line[i], type: "default" });
    i++;
  }

  return tokens;
}

export function getTokenColor(type: TokenType, theme: Theme = DARK_THEME): string {
  return theme[type] || theme.default;
}
