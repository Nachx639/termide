import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findPathRefs, pathRefAt, resolvePathRef } from "./pathLinks";

test("finds compiler/test/grep style references with line and column", () => {
  const refs = findPathRefs("src/app.ts:42:7 - error TS2322: bad. See ./lib/util.py(12) and /tmp/x.rs:3");
  expect(refs.map((r) => [r.file, r.line, r.column])).toEqual([
    ["src/app.ts", 42, 7],
    ["./lib/util.py", 12, undefined],
    ["/tmp/x.rs", 3, undefined],
  ]);
});

test("ignores URLs and version numbers", () => {
  expect(findPathRefs("see https://example.com/docs/index.html and v1.2.3 or 3.14").map((r) => r.file)).toEqual([]);
});

test("pathRefAt picks the reference under the column", () => {
  const line = "  at foo (src/a.ts:10:2) and README.md";
  expect(pathRefAt(line, line.indexOf("a.ts"))?.file).toBe("src/a.ts");
  expect(pathRefAt(line, line.indexOf("README"))?.file).toBe("README.md");
  expect(pathRefAt(line, 2)).toBeNull();
});

test("resolves against the first base where the file exists", () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "termide-links-a-"));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "termide-links-b-"));
  fs.mkdirSync(path.join(b, "src"));
  fs.writeFileSync(path.join(b, "src", "x.ts"), "");
  const ref = findPathRefs("src/x.ts:1")[0]!;
  expect(resolvePathRef(ref, [a, b])).toBe(path.join(b, "src", "x.ts"));
  expect(resolvePathRef(findPathRefs("nope/y.ts")[0]!, [a, b])).toBeNull();
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});
