import { test, expect, describe } from "bun:test";
import { findMatchingBracket, isBracket, getBracketAtPosition } from "./BracketMatcher";

describe("findMatchingBracket", () => {
  test("matches simple pairs on one line in both directions", () => {
    const lines = ["foo(bar)"];
    expect(findMatchingBracket(lines, 0, 3)).toEqual({
      openLine: 0, openColumn: 3, closeLine: 0, closeColumn: 7, bracket: "(",
    });
    expect(findMatchingBracket(lines, 0, 7)).toEqual({
      openLine: 0, openColumn: 3, closeLine: 0, closeColumn: 7, bracket: "(",
    });
  });

  test("handles nesting of the same bracket type", () => {
    const lines = ["((a)(b))"];
    expect(findMatchingBracket(lines, 0, 0)?.closeColumn).toBe(7);
    expect(findMatchingBracket(lines, 0, 1)?.closeColumn).toBe(3);
    expect(findMatchingBracket(lines, 0, 4)?.closeColumn).toBe(6);
    expect(findMatchingBracket(lines, 0, 7)?.openColumn).toBe(0);
  });

  test("ignores other bracket types while matching", () => {
    const lines = ["{ [ ( ] ) }"];
    expect(findMatchingBracket(lines, 0, 0)?.closeColumn).toBe(10);
    expect(findMatchingBracket(lines, 0, 2)?.closeColumn).toBe(6);
  });

  test("matches across lines, including empty lines in between", () => {
    const lines = ["function f() {", "", "  return [", "    1,", "  ];", "}"];
    expect(findMatchingBracket(lines, 0, 13)).toMatchObject({ closeLine: 5, closeColumn: 0 });
    expect(findMatchingBracket(lines, 5, 0)).toMatchObject({ openLine: 0, openColumn: 13 });
    expect(findMatchingBracket(lines, 2, 9)).toMatchObject({ closeLine: 4, closeColumn: 2 });
  });

  test("returns null for unbalanced brackets", () => {
    expect(findMatchingBracket(["(()"], 0, 0)).toBeNull();
    expect(findMatchingBracket(["())"], 0, 2)).toBeNull();
    expect(findMatchingBracket(["{", "  x"], 0, 0)).toBeNull();
  });

  test("returns null for non-brackets and out-of-range positions", () => {
    expect(findMatchingBracket(["abc"], 0, 1)).toBeNull();
    expect(findMatchingBracket(["abc"], 0, 99)).toBeNull();
    expect(findMatchingBracket(["abc"], 5, 0)).toBeNull();
    expect(findMatchingBracket(["abc"], -1, 0)).toBeNull();
    expect(findMatchingBracket([], 0, 0)).toBeNull();
    expect(findMatchingBracket([""], 0, 0)).toBeNull();
  });

  test("skips brackets inside string literals", () => {
    const lines = ['log("(", x)'];
    // cursor on the call's "(" must match the final ")"
    expect(findMatchingBracket(lines, 0, 3)?.closeColumn).toBe(10);
    expect(findMatchingBracket(lines, 0, 10)?.openColumn).toBe(3);
  });

  test("skips brackets inside single-quoted, template and escaped strings", () => {
    expect(findMatchingBracket(["f(')', `}`, \"\\\")\")"], 0, 1)?.closeColumn).toBe(17);
  });

  test("skips brackets inside line and block comments", () => {
    const lines = ["if (x) { // }", "  y(); /* } */", "}"];
    expect(findMatchingBracket(lines, 0, 7)).toMatchObject({ closeLine: 2, closeColumn: 0 });
    expect(findMatchingBracket(lines, 2, 0)).toMatchObject({ openLine: 0, openColumn: 7 });
  });

  test("brackets inside a string still match within that string", () => {
    const lines = ['const s = "(a)";'];
    expect(findMatchingBracket(lines, 0, 11)?.closeColumn).toBe(13);
  });

  test("angle brackets match for generics but not for arrows/comparisons", () => {
    expect(findMatchingBracket(["Array<Map<K, V>>"], 0, 5)?.closeColumn).toBe(15);
    expect(findMatchingBracket(["const f = () => 1"], 0, 14)).toBeNull();
    expect(findMatchingBracket(["if (a < b && c > d) {}"], 0, 6)).toBeNull();
    expect(findMatchingBracket(["x >= 1"], 0, 2)).toBeNull();
    // The arrow's ">" must not be counted as closing a generic
    expect(findMatchingBracket(["f<T>(x => x)"], 0, 1)?.closeColumn).toBe(3);
    expect(findMatchingBracket(["<T,>(x) => <div>{x}</div>"], 0, 0)?.closeColumn).toBe(3);
  });

  test("works with unicode content and CRLF line remnants", () => {
    const lines = ["(ñandú 🐜\r", "  {é})\r"];
    expect(findMatchingBracket(lines, 0, 0)).toMatchObject({ closeLine: 1, closeColumn: 5 });
  });

  test("is fast on large inputs", () => {
    const lines = ["{"];
    for (let i = 0; i < 50_000; i++) lines.push(`  const a${i} = [${i}, "(", (x) => x];`);
    lines.push("}");
    const start = performance.now();
    const m = findMatchingBracket(lines, 0, 0);
    expect(m).toMatchObject({ closeLine: lines.length - 1, closeColumn: 0 });
    expect(findMatchingBracket(lines, lines.length - 1, 0)).toMatchObject({ openLine: 0 });
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("isBracket", () => {
  test("recognises all bracket characters", () => {
    for (const c of "()[]{}<>") expect(isBracket(c)).toBe(true);
    for (const c of ["a", "", " ", "«", "\"", "(("]) expect(isBracket(c)).toBe(false);
  });
});

describe("getBracketAtPosition", () => {
  test("prefers the bracket under the cursor, then the one before it", () => {
    expect(getBracketAtPosition(["a(b)"], 0, 1)).toEqual({ line: 0, column: 1, bracket: "(" });
    expect(getBracketAtPosition(["a(b)"], 0, 4)).toEqual({ line: 0, column: 3, bracket: ")" });
    expect(getBracketAtPosition(["a(b)"], 0, 2)).toEqual({ line: 0, column: 1, bracket: "(" });
  });

  test("returns null when no bracket is adjacent", () => {
    expect(getBracketAtPosition(["abc"], 0, 1)).toBeNull();
    expect(getBracketAtPosition(["abc"], 0, 0)).toBeNull();
    expect(getBracketAtPosition([""], 0, 0)).toBeNull();
    expect(getBracketAtPosition([], 3, 0)).toBeNull();
  });
});
