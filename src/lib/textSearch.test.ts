import { test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { searchInFiles, listProjectFiles, __test } from "./textSearch";

let root: string;
const opts = { maxResults: 100, maxPerFile: 10 };

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "termide-search-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "node_modules", "dep"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.ts"), "const x = 1;\n    // TODO: Needle here\nconst ñandú = 'needle';\n");
  fs.writeFileSync(path.join(root, "dir with space.txt"), "another NEEDLE\n");
  fs.writeFileSync(path.join(root, "node_modules", "dep", "x.js"), "needle in deps\n");
  fs.writeFileSync(path.join(root, "bin.dat"), Buffer.from([0, 1, 2, 110, 101, 101, 100, 108, 101]));
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  execFileSync("git", ["init", "-q"], { cwd: root, env });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const summary = (r: { relativePath: string; lineNumber: number; lineContent: string; matchStart: number; matchEnd: number }[]) =>
  r.map((m) => `${m.relativePath}:${m.lineNumber}:${m.lineContent.slice(m.matchStart, m.matchEnd)}`).sort();

const expected = ["dir with space.txt:1:NEEDLE", "src/a.ts:2:Needle", "src/a.ts:3:needle"];

test.each(["viaRipgrep", "viaGitGrep", "viaWalk"] as const)("%s: case-insensitive, offsets right, skips deps and binaries", async (name) => {
  const r = await __test[name](root, "needle", opts);
  if (r === null) return; // tool not installed here
  expect(summary(r)).toEqual(expected);
});

test("unicode offsets survive ripgrep's byte offsets", async () => {
  const r = await searchInFiles(root, "ñandú");
  expect(r.map((m) => m.lineContent.slice(m.matchStart, m.matchEnd))).toEqual(["ñandú"]);
});

test("respects maxResults", async () => {
  expect((await searchInFiles(root, "needle", { maxResults: 2 })).length).toBe(2);
});

test("listProjectFiles honours .gitignore", async () => {
  const files = (await listProjectFiles(root)).map((f) => path.relative(root, f)).sort();
  expect(files).toContain("src/a.ts");
  expect(files).toContain("dir with space.txt");
  expect(files.some((f) => f.startsWith("node_modules"))).toBe(false);
});
