import { test, expect, afterEach } from "bun:test";
import { TerminalSession } from "./TerminalSession";

const sessions: TerminalSession[] = [];
afterEach(() => {
  while (sessions.length) sessions.pop()!.dispose();
});

function run(script: string, cols = 40, rows = 10) {
  const s = new TerminalSession({ cwd: process.cwd(), cols, rows, command: ["/bin/sh", "-c", script] });
  sessions.push(s);
  return s;
}

async function waitFor(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await Bun.sleep(20);
  }
  throw new Error("timeout waiting for condition");
}

test("renders program output with colours and wide characters", async () => {
  const s = run(`printf 'hola \\033[31mrojo\\033[0m 🙂中x'; sleep 5`);
  await waitFor(() => s.getVisibleText().includes("x"));
  expect(s.getVisibleText()).toBe("hola rojo 🙂中x");
  const line = s.xterm.buffer.active.getLine(0)!;
  expect(line.getCell(5)!.isFgPalette()).toBeTruthy();
  expect(line.getCell(5)!.getFgColor()).toBe(1);
  expect(line.getCell(10)!.getWidth()).toBe(2); // 🙂
  expect(line.getCell(12)!.getWidth()).toBe(2); // 中
});

test("answers cursor position queries (CLIs block on these)", async () => {
  const s = run(`stty raw -echo; printf 'ab\\033[6n'; r=$(dd bs=1 count=6 2>/dev/null); stty sane; printf '\\nGOT:%s' "$r" | cat -v; sleep 5`);
  await waitFor(() => s.getVisibleText().includes("GOT:"));
  await waitFor(() => s.getVisibleText().includes("R"));
  expect(s.getVisibleText()).toContain("GOT:^[[1;3R");
});

test("keys reach the program and echo back", async () => {
  const s = run(`stty -icanon; cat`);
  await Bun.sleep(150);
  for (const ch of "Hi!") s.sendKey({ name: ch.toLowerCase(), sequence: ch, ctrl: false, meta: false, shift: ch !== ch.toLowerCase(), source: "raw" });
  await waitFor(() => s.getVisibleText().includes("Hi!"));
});

test("bracketed paste is honoured when the program enables it", async () => {
  const s = run(`printf '\\033[?2004h'; sleep 5`);
  await waitFor(() => s.bracketedPaste);
  const sent: string[] = [];
  (s as any).writeToPty = (d: string) => sent.push(d);
  s.paste("line1\nline2\x1b[201~evil");
  expect(sent).toEqual(["\x1b[200~line1\rline2evil\x1b[201~"]);
});

test("resize reaches the program", async () => {
  const s = run(`sleep 0.3; stty size; sleep 5`, 40, 10);
  s.resize(60, 15);
  await waitFor(() => s.getVisibleText().includes("15 60"));
});

test("scrollback offset is clamped and resets on input", async () => {
  const s = run(`i=0; while [ $i -lt 50 ]; do echo line$i; i=$((i+1)); done; sleep 5`, 20, 5);
  await waitFor(() => s.getVisibleText().includes("line49"));
  s.scrollBy(1000);
  expect(s.scrollOffset).toBe(s.xterm.buffer.active.baseY);
  expect(s.getVisibleText().split("\n")[0]).toBe("line0");
  s.write("x");
  expect(s.scrollOffset).toBe(0);
});

test("reports exit and restarts on Enter", async () => {
  const s = run(`echo bye`);
  await waitFor(() => s.exited);
  expect(s.exitCode).toBe(0);
  expect(s.sendKey({ name: "return", sequence: "\r", ctrl: false, meta: false, shift: false })).toBe(true);
  // The restarted `echo bye` may exit again before a poll sees it running, so only
  // wait for its output.
  await waitFor(() => s.getAllText().split("bye").length === 3);
});
