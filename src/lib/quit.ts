/**
 * The one way to leave termide. Calling process.exit() directly skipped
 * OpenTUI's teardown and left the user's terminal in the alternate screen with
 * mouse tracking on (clicks printed garbage), a hidden cursor and bracketed
 * paste / kitty keyboard modes enabled.
 */
const RESET =
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l" + // mouse tracking off
  "\x1b[?2004l" + // bracketed paste off
  "\x1b[<u" + // pop kitty keyboard flags
  "\x1b[?25h" + // show cursor
  "\x1b[?1049l"; // leave the alternate screen

let quitting = false;

/** Work that must finish before exiting (e.g. editors with a pending autosave). */
const beforeQuit = new Set<() => void>();
export function onBeforeQuit(fn: () => void): () => void {
  beforeQuit.add(fn);
  return () => {
    beforeQuit.delete(fn);
  };
}

export function quit(code = 0): void {
  if (quitting) return;
  quitting = true;
  // Quitting within the autosave delay used to lose the last edit.
  for (const fn of beforeQuit) {
    try {
      fn();
    } catch {}
  }
  try {
    (globalThis as any).__termideRenderer?.destroy();
  } catch {}
  // Belt and braces in case the renderer could not restore everything.
  try {
    process.stdout.write(RESET);
  } catch {}
  // Let the renderer's teardown flush before the process goes away.
  setTimeout(() => process.exit(code), 30);
}
