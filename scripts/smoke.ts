#!/usr/bin/env bun
/**
 * Headless end-to-end smoke test: runs termide inside a PTY emulated by xterm,
 * optionally sends keys, and prints the resulting screen.
 *
 *   bun scripts/smoke.ts [--cols 160] [--rows 45] [--wait 2500] [--keys 'ls\r'] [--after 1500]
 *
 * --keys accepts JS escapes (\r, \t, \x18...). Exit code 1 if the screen shows an error.
 */
import { TerminalSession } from "../src/lib/terminal/TerminalSession";
import { parseArgs } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { values } = parseArgs({
  options: {
    cols: { type: "string", default: "160" },
    rows: { type: "string", default: "45" },
    wait: { type: "string", default: "2500" },
    keys: { type: "string", multiple: true },
    after: { type: "string", default: "1500" },
    dir: { type: "string", default: process.cwd() },
  },
});

const unescape = (s: string) =>
  s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[rnte\\])/g, (_, e: string) =>
    e[0] === "x" || e[0] === "u" ? String.fromCharCode(parseInt(e.slice(1), 16))
    : ({ r: "\r", n: "\n", t: "\t", e: "\x1b", "\\": "\\" } as Record<string, string>)[e]!);
const root = `${import.meta.dir}/../`;
const s = new TerminalSession({
  cwd: values.dir!,
  cols: Number(values.cols),
  rows: Number(values.rows),
  command: ["bun", `${root}src/index.tsx`, values.dir!],
  // Never read or write the user's real sessions in ~/.termide.
  env: { TERMIDE_SESSION_DIR: mkdtempSync(join(tmpdir(), "termide-smoke-")) },
});

await Bun.sleep(Number(values.wait));
for (const k of values.keys ?? []) {
  s.write(unescape(k));
  await Bun.sleep(Number(values.after));
}
const screen = s.getVisibleText();
console.log(screen);
s.dispose();
process.exit(/Error|TypeError|ReferenceError|Unhandled/.test(screen) ? 1 : 0);
