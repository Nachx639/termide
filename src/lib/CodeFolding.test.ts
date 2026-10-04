import { test, expect, describe } from "bun:test";
import {
  detectFoldableRegions,
  getVisibleLines,
  toggleFold,
  foldAll,
  unfoldAll,
  getFoldMarker,
  type FoldableRegion,
} from "./CodeFolding";

const src = (s: string) => s.split("\n");

function regionAt(regions: FoldableRegion[], start: number, type?: FoldableRegion["type"]) {
  return regions.find((r) => r.startLine === start && (!type || r.type === type));
}

describe("detectFoldableRegions", () => {
  test("empty input and single lines produce no regions", () => {
    expect(detectFoldableRegions([], null)).toEqual([]);
    expect(detectFoldableRegions([""], null)).toEqual([]);
    expect(detectFoldableRegions(["const x = { a: 1 };"], "typescript")).toEqual([]);
  });

  test("two-line blocks are not foldable, three-line blocks are", () => {
    expect(detectFoldableRegions(src("if (x) {\n}"), null)).toEqual([]);
    const r = detectFoldableRegions(src("if (x) {\n  y();\n}"), null);
    expect(r).toEqual([{ startLine: 0, endLine: 2, indent: 0, type: "block", collapsed: false }]);
  });

  test("classifies functions, classes, objects and arrays", () => {
    const lines = src(
      [
        "export async function load(a, b) {", // 0
        "  return 1;",
        "}",
        "export class Foo {", // 3
        "  x = 1;",
        "}",
        "const cfg = {", // 6
        "  a: 1,",
        "};",
        "const list = [", // 9
        "  1,",
        "];",
      ].join("\n")
    );
    const regions = detectFoldableRegions(lines, "typescript");
    expect(regionAt(regions, 0)?.type).toBe("function");
    expect(regionAt(regions, 0)?.endLine).toBe(2);
    expect(regionAt(regions, 3)?.type).toBe("class");
    expect(regionAt(regions, 6)?.type).toBe("object");
    expect(regionAt(regions, 9)?.type).toBe("array");
  });

  test("nested regions carry their indent level and are sorted by start", () => {
    const lines = src("function a() {\n  if (x) {\n    y();\n    z();\n  }\n}");
    const regions = detectFoldableRegions(lines, null);
    expect(regions.map((r) => [r.startLine, r.endLine, r.indent])).toEqual([
      [0, 5, 0],
      [1, 4, 1],
    ]);
  });

  test("tabs count as indentation", () => {
    const lines = src("{\n\tif (x) {\n\t\ty();\n\t}\n}");
    expect(regionAt(detectFoldableRegions(lines, null), 1)?.indent).toBe(1);
  });

  test("brackets inside strings and comments do not break block detection", () => {
    const lines = src(
      [
        "function f() {", // 0
        '  const s = "}";',
        "  // closing } in a comment",
        "  /* and { here */",
        "  return s;",
        "}", // 5
      ].join("\n")
    );
    const regions = detectFoldableRegions(lines, "typescript");
    expect(regionAt(regions, 0)).toMatchObject({ endLine: 5, type: "function" });
    expect(regions.filter((r) => r.type !== "comment")).toHaveLength(1);
  });

  test("brackets inside multi-line block comments are ignored", () => {
    const lines = src("/*\n * example: {\n */\nfunction f() {\n  x();\n}");
    const regions = detectFoldableRegions(lines, null);
    expect(regionAt(regions, 0, "comment")).toMatchObject({ endLine: 2 });
    expect(regionAt(regions, 3)).toMatchObject({ endLine: 5, type: "function" });
  });

  test("unbalanced brackets do not throw and still fold what they can", () => {
    const lines = src("function f() {\n  if (x) {\n    y();\n  }\n");
    const regions = detectFoldableRegions(lines, null);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ startLine: 1, endLine: 3 });
    expect(() => detectFoldableRegions(src("}}}\n)))\n]]]"), null)).not.toThrow();
  });

  test("multi-line comments of 3+ lines are foldable", () => {
    const lines = src("/**\n * Docs\n * more\n */\nconst x = 1;");
    expect(regionAt(detectFoldableRegions(lines, null), 0, "comment")).toMatchObject({ endLine: 3 });
    // two-line comment: not foldable
    expect(detectFoldableRegions(src("/*\n*/"), null)).toEqual([]);
  });

  test("import block region spans the leading imports", () => {
    const lines = src('import a from "a";\nimport b from "b";\n\nimport c from "c";\n\nconst x = 1;');
    expect(regionAt(detectFoldableRegions(lines, null), 0, "import")).toMatchObject({ endLine: 3 });
  });

  test("import block after a header comment starts at the first import", () => {
    const lines = src('// License header\n\nimport a from "a";\nimport b from "b";\nconst x = 1;');
    const imp = detectFoldableRegions(lines, null).find((r) => r.type === "import");
    expect(imp).toMatchObject({ startLine: 2, endLine: 3 });
  });

  test("a file made only of imports still gets an import region", () => {
    const lines = src('import a from "a";\nimport b from "b";');
    expect(detectFoldableRegions(lines, null).find((r) => r.type === "import")).toMatchObject({
      startLine: 0,
      endLine: 1,
    });
  });

  test("imports after code are not treated as the import block", () => {
    const lines = src('const x = 1;\nimport a from "a";\nimport b from "b";\nfoo();');
    expect(detectFoldableRegions(lines, null).find((r) => r.type === "import")).toBeUndefined();
  });

  test("python-style from-imports are recognised", () => {
    const lines = src("from os import path\nimport sys\n\ndef f():\n  pass");
    expect(detectFoldableRegions(lines, "python").find((r) => r.type === "import")).toMatchObject({
      startLine: 0,
      endLine: 1,
    });
  });

  test("handles CRLF lines", () => {
    const lines = "function f() {\r\n  x();\r\n}\r\n".split("\n");
    expect(regionAt(detectFoldableRegions(lines, null), 0)).toMatchObject({ endLine: 2, type: "function" });
  });

  test("large inputs are processed quickly", () => {
    const lines: string[] = [];
    for (let i = 0; i < 20_000; i++) lines.push(`function f${i}(a) {`, `  return "{" + a;`, "}");
    const start = performance.now();
    const regions = detectFoldableRegions(lines, "javascript");
    expect(regions).toHaveLength(20_000);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("getVisibleLines", () => {
  const lines = src(
    [
      "function f(a, b) {", // 0
      "  const x = (a);",
      "  return x;",
      "}", // 3
      "after();",
    ].join("\n")
  );

  test("nothing folded returns every line with its original index", () => {
    const visible = getVisibleLines(lines, new Set());
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(visible.every((v) => v.foldedCount === undefined)).toBe(true);
  });

  test("folding a function with parameters hides its body", () => {
    const visible = getVisibleLines(lines, new Set([0]));
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 4]);
    expect(visible[0]!.foldedCount).toBe(3);
  });

  test("uses the supplied regions when given", () => {
    const regions = detectFoldableRegions(lines, null);
    const visible = getVisibleLines(lines, new Set([0]), regions);
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 4]);
  });

  test("folding a comment region works", () => {
    const l = src("/**\n * a\n * b\n */\nx();");
    const visible = getVisibleLines(l, new Set([0]));
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 4]);
  });

  test("folding a `} else {` line folds the else branch", () => {
    const l = src("if (a) {\n  x();\n} else {\n  y();\n  z();\n}\ndone();");
    const visible = getVisibleLines(l, new Set([2]));
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 1, 2, 6]);
    expect(visible[2]!.foldedCount).toBe(3);
  });

  test("a fold marker on a non-foldable line is ignored", () => {
    expect(getVisibleLines(lines, new Set([4])).map((v) => v.originalIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(getVisibleLines(lines, new Set([99])).length).toBe(5);
  });

  test("empty input", () => {
    expect(getVisibleLines([], new Set([0]))).toEqual([]);
  });

  test("nested folds: outer fold wins", () => {
    const l = src("function a() {\n  if (x) {\n    y();\n  }\n}\nz();");
    expect(getVisibleLines(l, new Set([0, 1])).map((v) => v.originalIndex)).toEqual([0, 5]);
    expect(getVisibleLines(l, new Set([1])).map((v) => v.originalIndex)).toEqual([0, 1, 4, 5]);
  });
});

describe("toggleFold / foldAll / unfoldAll / getFoldMarker", () => {
  const regions: FoldableRegion[] = [
    { startLine: 0, endLine: 5, indent: 0, type: "function", collapsed: false },
    { startLine: 1, endLine: 3, indent: 1, type: "block", collapsed: false },
  ];

  test("toggleFold adds and removes without mutating the input set", () => {
    const initial = new Set<number>();
    const folded = toggleFold(0, regions, initial);
    expect([...folded]).toEqual([0]);
    expect(initial.size).toBe(0);
    expect([...toggleFold(0, regions, folded)]).toEqual([]);
  });

  test("toggleFold on a non-region line is a no-op", () => {
    expect([...toggleFold(2, regions, new Set([0]))]).toEqual([0]);
  });

  test("foldAll and unfoldAll", () => {
    expect([...foldAll(regions)].sort()).toEqual([0, 1]);
    expect(foldAll([]).size).toBe(0);
    expect(unfoldAll().size).toBe(0);
  });

  test("getFoldMarker reports expanded/collapsed/end/none", () => {
    expect(getFoldMarker(0, regions, new Set())).toBe("expanded");
    expect(getFoldMarker(0, regions, new Set([0]))).toBe("collapsed");
    expect(getFoldMarker(3, regions, new Set())).toBe("end");
    expect(getFoldMarker(3, regions, new Set([1]))).toBe("none");
    expect(getFoldMarker(2, regions, new Set())).toBe("none");
  });
});
