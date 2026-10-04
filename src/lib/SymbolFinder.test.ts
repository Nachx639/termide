import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getWordAtPosition,
  findDefinitionInFile,
  findImportSource,
  findDefinition,
  getAllSymbols,
  getSymbolIcon,
  getSymbolColor,
  findReferencesInFile,
  type SymbolLocation,
} from "./SymbolFinder";

describe("getWordAtPosition", () => {
  test("finds the word under, at the start of, and right after the cursor", () => {
    const line = "const fooBar = baz_1 + $q;";
    expect(getWordAtPosition(line, 8)).toEqual({ word: "fooBar", startColumn: 6, endColumn: 12 });
    expect(getWordAtPosition(line, 6)?.word).toBe("fooBar");
    expect(getWordAtPosition(line, 12)?.word).toBe("fooBar"); // cursor just after the word
    expect(getWordAtPosition(line, 16)?.word).toBe("baz_1");
    expect(getWordAtPosition(line, 23)?.word).toBe("$q");
  });

  test("returns null on whitespace/punctuation away from words and on empty lines", () => {
    expect(getWordAtPosition("a  +  b", 3)).toBeNull();
    expect(getWordAtPosition("", 0)).toBeNull();
    expect(getWordAtPosition("   ", 1)).toBeNull();
  });

  test("does not start words with digits", () => {
    expect(getWordAtPosition("123abc", 1)).toBeNull();
  });
});

describe("findDefinitionInFile", () => {
  const find = (content: string, name: string) => findDefinitionInFile(content, name, "/x.ts");

  test("finds the various declaration kinds", () => {
    const cases: [string, string, SymbolLocation["kind"]][] = [
      ["function greet(name) {}", "greet", "function"],
      ["async function load() {}", "load", "function"],
      ["const add = (a, b) => a + b;", "add", "function"],
      ["const run = async () => {};", "run", "function"],
      ["let count = 0;", "count", "variable"],
      ["class Foo extends Bar {}", "Foo", "class"],
      ["interface Props {", "Props", "interface"],
      ["type Id = string;", "Id", "type"],
      ["type Box<T> = { v: T };", "Box", "type"],
    ];
    for (const [content, name, kind] of cases) {
      const def = find(content, name);
      expect(def, `${name} in ${content}`).not.toBeNull();
      expect(def!.kind).toBe(kind);
      expect(def!.line).toBe(0);
    }
  });

  test("reports the column of the symbol itself, not an earlier substring", () => {
    expect(find("let e = 1;", "e")).toMatchObject({ line: 0, column: 4 });
    expect(find("const on = 1;", "on")).toMatchObject({ column: 6 });
    expect(find("\n\nfunction t() {}", "t")).toMatchObject({ line: 2, column: 9 });
  });

  test("handles symbol names containing $ and regex metacharacters safely", () => {
    expect(find("const $store = createStore();", "$store")).toMatchObject({ column: 6, kind: "variable" });
    expect(find("function $() {}", "$")).toMatchObject({ kind: "function" });
    expect(() => find("const a = 1;", "a(")).not.toThrow();
    expect(find("const a = 1;", "a(")).toBeNull();
    expect(find("const a = 1;", ".")).toBeNull();
  });

  test("does not match a longer identifier that starts with the name", () => {
    expect(find("const fooBar = 1;", "foo")).toBeNull();
  });

  test("prefers a real declaration over an earlier usage", () => {
    const content = ["run(helper);", "", "function helper() {", "  return 1;", "}"].join("\n");
    expect(find(content, "helper")).toMatchObject({ line: 2, kind: "function" });
  });

  test("falls back to weak matches (methods/properties/params) when nothing else exists", () => {
    const content = ["class A {", "  render() {", "    return 1;", "  }", "}"].join("\n");
    expect(find(content, "render")).toMatchObject({ line: 1, column: 2, kind: "function" });
    expect(find("const o = {\n  key: 1,\n};", "key")).toMatchObject({ line: 1, kind: "property" });
  });

  test("returns null when not found and for empty input", () => {
    expect(find("const a = 1;", "zzz")).toBeNull();
    expect(find("", "a")).toBeNull();
    expect(find("const a = 1;", "")).toBeNull();
  });

  test("works with CRLF content", () => {
    expect(find("// hi\r\nfunction f() {\r\n}\r\n", "f")).toMatchObject({ line: 1, column: 9 });
  });
});

describe("getAllSymbols", () => {
  const content = [
    "import x from './x';", // 0
    "// function commented() {}", // 1
    "export function main() {", // 2
    "  if (x) {", // 3
    "  }", // 4
    "}", // 5
    "export const VALUE = 1;", // 6
    "class Widget {", // 7
    "  render(): string {", // 8
    "    return '';", // 9
    "  }", // 10
    "  catch (e) {", // 11
    "}", // 12
    "interface Opts {}", // 13
    "type Fn = () => void;", // 14
    "const Comp = () => null;", // 15
  ].join("\n");

  test("lists declarations in line order with kinds and columns", () => {
    const symbols = getAllSymbols(content, "/f.ts");
    const names = symbols.map((s) => `${s.line}:${s.symbolName}:${s.kind}`);
    expect(names).toContain("2:main:function");
    expect(names).toContain("6:VALUE:variable");
    expect(names).toContain("7:Widget:class");
    expect(names).toContain("8:render:function");
    expect(names).toContain("13:Opts:interface");
    expect(names).toContain("14:Fn:type");
    expect(names).toContain("15:Comp:function");
    const lines = symbols.map((s) => s.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(symbols.find((s) => s.symbolName === "main")!.column).toBe(16);
  });

  test("skips comments, control-flow keywords and duplicate hits", () => {
    const symbols = getAllSymbols(content, "/f.ts");
    const names = symbols.map((s) => s.symbolName);
    expect(names).not.toContain("commented");
    expect(names).not.toContain("if");
    expect(names).not.toContain("catch");
    const keys = symbols.map((s) => `${s.line}:${s.symbolName}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("empty content", () => {
    expect(getAllSymbols("", "/f.ts")).toEqual([]);
  });
});

describe("findReferencesInFile", () => {
  test("finds whole-word references with columns", () => {
    const refs = findReferencesInFile("foo(foo);\nfoobar + foo\n_foo", "foo", "/a.ts");
    expect(refs.map((r) => [r.line, r.column])).toEqual([
      [0, 0],
      [0, 4],
      [1, 9],
    ]);
  });

  test("handles names with $ and does not throw on metacharacters", () => {
    const refs = findReferencesInFile("$x + $x2 + a$x + $x", "$x", "/a.ts");
    expect(refs.map((r) => r.column)).toEqual([0, 17]);
    expect(() => findReferencesInFile("a+b", "a+", "/a.ts")).not.toThrow();
  });

  test("empty inputs", () => {
    expect(findReferencesInFile("", "x", "/a.ts")).toEqual([]);
    expect(findReferencesInFile("abc", "", "/a.ts")).toEqual([]);
  });
});

describe("icons and colors", () => {
  test("every kind has a distinct-enough icon and a color", () => {
    const kinds: SymbolLocation["kind"][] = [
      "function", "variable", "class", "interface", "type", "import", "export", "property",
    ];
    for (const k of kinds) {
      expect(getSymbolIcon(k).length).toBeGreaterThan(0);
      expect(getSymbolColor(k).length).toBeGreaterThan(0);
    }
    expect(getSymbolIcon("function")).toBe("ƒ");
    expect(getSymbolIcon("unknown" as any)).toBe("•");
    expect(getSymbolColor("unknown" as any)).toBe("white");
  });
});

describe("imports across files", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide symbols "));
    fs.mkdirSync(path.join(dir, "lib dir"));
    fs.writeFileSync(path.join(dir, "lib dir", "util.ts"), "export function helper() {}\nexport const other = 1;\n");
    fs.mkdirSync(path.join(dir, "pkg"));
    fs.writeFileSync(path.join(dir, "pkg", "index.ts"), "export default class Pkg {}\n");
    fs.writeFileSync(path.join(dir, "types.ts"), "export interface Shape {}\nexport type Id = string;\n");
    fs.writeFileSync(path.join(dir, "reexport.ts"), "export * from './lib dir/util';\n");
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("resolves named, default, namespace and aliased imports with extensions/index", () => {
    const main = path.join(dir, "main.ts");
    const content = [
      'import { helper, other as o } from "./lib dir/util";',
      "import Pkg from './pkg';",
      'import * as U from "./lib dir/util";',
      'import React from "react";',
    ].join("\n");
    const util = path.join(dir, "lib dir", "util.ts");
    expect(findImportSource(content, "helper", main)).toBe(util);
    expect(findImportSource(content, "o", main)).toBe(util);
    expect(findImportSource(content, "other", main)).toBeNull(); // only the alias is in scope
    expect(findImportSource(content, "Pkg", main)).toBe(path.join(dir, "pkg", "index.ts"));
    expect(findImportSource(content, "U", main)).toBe(util);
    expect(findImportSource(content, "React", main)).toBeNull(); // bare package import
    expect(findImportSource(content, "missing", main)).toBeNull();
  });

  test("resolves type-only and multi-line imports", () => {
    const main = path.join(dir, "main.ts");
    const content = [
      'import type { Shape } from "./types";',
      'import { type Id } from "./types";',
      "import {",
      "  helper,",
      "  other,",
      '} from "./lib dir/util";',
    ].join("\n");
    expect(findImportSource(content, "Shape", main)).toBe(path.join(dir, "types.ts"));
    expect(findImportSource(content, "Id", main)).toBe(path.join(dir, "types.ts"));
    expect(findImportSource(content, "other", main)).toBe(path.join(dir, "lib dir", "util.ts"));
  });

  test("findDefinition prefers local definitions, then follows imports", () => {
    const main = path.join(dir, "main.ts");
    const content = 'import { helper } from "./lib dir/util";\nconst local = 1;\nhelper(local);';
    expect(findDefinition(content, main, "local")).toMatchObject({ filePath: main, line: 1 });
    expect(findDefinition(content, main, "helper")).toMatchObject({
      filePath: path.join(dir, "lib dir", "util.ts"),
      line: 0,
      column: 16,
      kind: "function",
    });
    expect(findDefinition(content, main, "nothing")).toBeNull();
  });

  test("findDefinition falls back to the module file for re-exports", () => {
    const main = path.join(dir, "main.ts");
    const content = 'import { helper } from "./reexport";\nhelper();';
    expect(findDefinition(content, main, "helper")).toEqual({
      filePath: path.join(dir, "reexport.ts"),
      line: 0,
      column: 0,
      symbolName: "helper",
      kind: "import",
    });
  });
});
