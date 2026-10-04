import { test, expect } from "bun:test";
import { rangesFromTreeSitter, rangesFromTokenizer } from "./editorHighlight";

test("overlapping captures: most specific wins, then the latest", () => {
  const content = "const x = 1";
  const r = rangesFromTreeSitter(content, [
    [0, 5, "keyword"],
    [6, 7, "variable"],
    [6, 7, "type"],
    [6, 7, "variable.member"],
    [10, 11, "number"],
  ]);
  expect(r).toEqual([
    { line: 0, start: 0, end: 5, name: "keyword" },
    { line: 0, start: 6, end: 7, name: "variable.member" },
    { line: 0, start: 10, end: 11, name: "number" },
  ]);
});

test("multi-line captures are split per line, newlines excluded", () => {
  const content = "a /* one\ntwo\nthree */ b";
  const r = rangesFromTreeSitter(content, [[2, 21, "comment"]]);
  expect(r).toEqual([
    { line: 0, start: 2, end: 8, name: "comment" },
    { line: 1, start: 0, end: 3, name: "comment" },
    { line: 2, start: 0, end: 8, name: "comment" },
  ]);
});

test("nested capture inside a larger one splits it", () => {
  const content = "`a ${b} c`";
  const r = rangesFromTreeSitter(content, [
    [0, 10, "string"],
    [3, 7, "punctuation.special"],
  ]);
  expect(r.map((x) => [x.start, x.end, x.name])).toEqual([
    [0, 3, "string"],
    [3, 7, "punctuation.special"],
    [7, 10, "string"],
  ]);
});

test("tokenizer fallback gives columns per line", () => {
  const r = rangesFromTokenizer('x = "ñ"\ndef f():', "python");
  expect(r.find((x) => x.name === "string")).toEqual({ line: 0, start: 4, end: 7, name: "string" });
  expect(r.find((x) => x.name === "keyword")).toEqual({ line: 1, start: 0, end: 3, name: "keyword" });
});
