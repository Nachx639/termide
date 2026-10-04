#!/usr/bin/env bun
/**
 * Quits termide in several ways inside a headless PTY and checks that the host
 * terminal is restored (normal screen, no mouse tracking, visible cursor, no
 * bracketed paste). Exit code 1 if any path leaves the terminal broken.
 */
import { TerminalSession } from "../src/lib/terminal/TerminalSession";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const root = `${import.meta.dir}/../`;
const paths: [string, string[] | "SIGTERM"][] = [
  ["Ctrl+X Q", ["\x18", "q"]],
  ["Ctrl+C outside the terminal", ["\x03"]],
  ["SIGTERM", "SIGTERM"],
];
let bad = 0;
for (const [label, how] of paths) {
  const s = new TerminalSession({
    cwd: root,
    cols: 100,
    rows: 30,
    command: ["bun", `${root}src/index.tsx`, root],
    env: { TERMIDE_SESSION_DIR: mkdtempSync(join(tmpdir(), "termide-exit-")) },
  });
  await Bun.sleep(3000);
  if (how === "SIGTERM") (s as any).proc.kill("SIGTERM");
  else for (const k of how) { s.write(k); await Bun.sleep(600); }
  for (let i = 0; i < 40 && !s.exited; i++) await Bun.sleep(50);
  await Bun.sleep(200);
  const state = {
    exited: s.exited,
    screen: s.xterm.buffer.active.type,
    mouse: s.xterm.modes.mouseTrackingMode,
    cursorHidden: (s.xterm as any)._core.coreService.isCursorHidden,
    bracketedPaste: s.xterm.modes.bracketedPasteMode,
  };
  const ok = state.exited && state.screen === "normal" && state.mouse === "none" && !state.cursorHidden && !state.bracketedPaste;
  if (!ok) bad++;
  console.log(ok ? "ok  " : "FAIL", label, JSON.stringify(state));
  s.dispose();
}
process.exit(bad ? 1 : 0);
