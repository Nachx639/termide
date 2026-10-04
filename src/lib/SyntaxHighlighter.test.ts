import { test, expect, describe } from "bun:test";
import { detectLanguage, tokenizeLine, getTokenColor, DARK_THEME, type Token, type TokenType } from "./SyntaxHighlighter";

const types = (tokens: Token[]) => tokens.map((t) => [t.text, t.type]);
const typeOf = (tokens: Token[], text: string): TokenType | undefined => tokens.find((t) => t.text === text)?.type;
const join = (tokens: Token[]) => tokens.map((t) => t.text).join("");

describe("detectLanguage", () => {
  test("maps extensions case-insensitively", () => {
    expect(detectLanguage("a.ts")).toBe("typescript");
    expect(detectLanguage("A.TSX")).toBe("typescript");
    expect(detectLanguage("/path with space/x.mjs")).toBe("javascript");
    expect(detectLanguage("script.py")).toBe("python");
    expect(detectLanguage("lib.rs")).toBe("rust");
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("x.jsonc")).toBe("json");
    expect(detectLanguage("icon.svg")).toBe("html");
    expect(detectLanguage("run.zsh")).toBe("shell");
    expect(detectLanguage("archive.tar.gz")).toBeNull();
  });

  test("files without an extension are not detected", () => {
    expect(detectLanguage("Makefile")).toBeNull();
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("/some.dir/README")).toBeNull();
    expect(detectLanguage("weird.")).toBeNull();
  });
});

describe("tokenizeLine", () => {
  const LINES: [string, string][] = [
    ["typescript", 'export const x: number = foo(1, "a\\"b") ?? 0x1F; // done'],
    ["typescript", "const re = /\"/g; `tpl ${x}`"],
    ["javascript", "a?.b === c && d !== e => f"],
    ["python", 'def f(x): return """doc""" # c'],
    ["rust", "fn main() { let v: Vec<i32> = vec![1, 2]; }"],
    ["go", "func main() { fmt.Println(`raw`) }"],
    ["shell", 'echo "$HOME" # comment'],
    ["css", ".a { color: red !important; } /* c */"],
    ["html", "<div class=\"x\"><!-- c --></div>"],
    ["json", '{"a": [1, 2.5, true, null]}'],
    ["markdown", "# Title *em*"],
    ["typescript", "const ñandú = '🐜' + 'ü';"],
    ["typescript", "line with CR at end\r"],
    ["typescript", ""],
  ];

  test("token texts always concatenate back to the original line", () => {
    for (const [lang, line] of LINES) {
      expect(join(tokenizeLine(line, lang)), `${lang}: ${line}`).toBe(line);
    }
  });

  test("unknown or null language returns a single default token", () => {
    expect(tokenizeLine("x = 1", null)).toEqual([{ text: "x = 1", type: "default" }]);
    expect(tokenizeLine("x = 1", "cobol")).toEqual([{ text: "x = 1", type: "default" }]);
    // yaml/toml are detected but have no definition yet
    expect(tokenizeLine("a: 1", "yaml")).toEqual([{ text: "a: 1", type: "default" }]);
  });

  test("empty line produces no tokens", () => {
    expect(tokenizeLine("", "typescript")).toEqual([]);
  });

  test("keywords, builtins, types, constants, functions and classes", () => {
    const t = tokenizeLine("const x: string = console.log(Foo, true, bar(1))", "typescript");
    expect(typeOf(t, "const")).toBe("keyword");
    expect(typeOf(t, "string")).toBe("type");
    expect(typeOf(t, "console")).toBe("builtin");
    expect(typeOf(t, "log")).toBe("function");
    expect(typeOf(t, "Foo")).toBe("class");
    expect(typeOf(t, "true")).toBe("constant");
    expect(typeOf(t, "bar")).toBe("function");
    expect(typeOf(t, "x")).toBe("default");
  });

  test("strings with escapes and unterminated strings", () => {
    expect(types(tokenizeLine('"a\\"b" + c', "javascript"))[0]).toEqual(['"a\\"b"', "string"]);
    expect(types(tokenizeLine("x = 'open", "javascript")).at(-1)).toEqual(["'open", "string"]);
    expect(types(tokenizeLine("'it\\'s'", "javascript"))).toEqual([["'it\\'s'", "string"]]);
  });

  test("comment markers inside strings are not comments", () => {
    const t = tokenizeLine('const url = "http://x.y"; // real', "typescript");
    expect(typeOf(t, '"http://x.y"')).toBe("string");
    expect(t.at(-1)).toEqual({ text: "// real", type: "comment" });
  });

  test("block comments on one line and unterminated block comments", () => {
    const t = tokenizeLine("a /* b */ c", "javascript");
    expect(typeOf(t, "/* b */")).toBe("comment");
    expect(typeOf(t, "c")).toBe("default");
    expect(tokenizeLine("x /* open", "javascript").at(-1)).toEqual({ text: "/* open", type: "comment" });
  });

  test("numbers in various bases, not inside identifiers", () => {
    const t = tokenizeLine("f(0xFF, 0b101, 0o17, 3.14, 1e10, 42)", "javascript");
    for (const n of ["0xFF", "0b101", "0o17", "3.14", "1e10", "42"]) expect(typeOf(t, n)).toBe("number");
    expect(types(tokenizeLine("abc123", "javascript"))).toEqual([["abc123", "default"]]);
  });

  test("multi-char operators are matched greedily", () => {
    const t = tokenizeLine("a === b !== c => d ?? e?.f", "typescript");
    for (const op of ["===", "!==", "=>", "??", "?."]) expect(typeOf(t, op)).toBe("operator");
  });

  test("python comments and triple-quoted strings", () => {
    const t = tokenizeLine('x = """a"b"""  # note', "python");
    expect(typeOf(t, '"""a"b"""')).toBe("string");
    expect(t.at(-1)).toEqual({ text: "# note", type: "comment" });
    expect(typeOf(tokenizeLine("y = '''q'''", "python"), "'''q'''")).toBe("string");
    expect(typeOf(tokenizeLine("if x is None: pass", "python"), "None")).toBe("constant");
  });

  test("shell: # only starts a comment at a word boundary", () => {
    expect(tokenizeLine("# full line", "shell")).toEqual([{ text: "# full line", type: "comment" }]);
    expect(tokenizeLine("echo hi # trailing", "shell").at(-1)).toEqual({ text: "# trailing", type: "comment" });
    const t = tokenizeLine('echo ${#arr[@]} $# foo#bar', "shell");
    expect(t.some((x) => x.type === "comment")).toBe(false);
    expect(join(t)).toBe('echo ${#arr[@]} $# foo#bar');
  });

  test("json: keys are strings, literals are constants", () => {
    const t = tokenizeLine('{"k": null, "n": -1}', "json");
    expect(typeOf(t, '"k"')).toBe("string");
    expect(typeOf(t, "null")).toBe("constant");
    expect(typeOf(t, "1")).toBe("number");
  });

  test("handles very long lines", () => {
    const line = "const a = [" + Array.from({ length: 5000 }, (_, i) => `"s${i}", ${i}`).join(", ") + "];";
    const start = performance.now();
    const t = tokenizeLine(line, "typescript");
    expect(join(t)).toBe(line);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("getTokenColor", () => {
  test("uses the theme, defaulting to DARK_THEME", () => {
    expect(getTokenColor("keyword")).toBe(DARK_THEME.keyword);
    expect(getTokenColor("comment", { ...DARK_THEME, comment: "#123456" })).toBe("#123456");
    expect(getTokenColor("bogus" as TokenType)).toBe(DARK_THEME.default);
  });
});
