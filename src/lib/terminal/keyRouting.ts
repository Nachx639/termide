/**
 * Which keys the IDE keeps while the embedded terminal has focus. Everything else
 * goes to the shell: Tab completion, Ctrl+K/P/W/B/F, "?" and friends belong to
 * the program running inside, not to IDE shortcuts.
 */
import type { KeyLike } from "./KeyEncoder";

export function isTerminalHostKey(k: KeyLike): boolean {
  if (k.eventType === "release") return false;
  // Ctrl+X: leader key, the way out of the terminal (Ctrl+X Tab, Ctrl+X Q, ...).
  if (k.ctrl && !k.shift && k.name === "x") return true;
  // F1: help.
  if (k.name === "f1") return true;
  // Ctrl+Space: toggle the agent panel.
  if (k.ctrl && (k.name === "space" || k.name === " ")) return true;
  // Ctrl+Shift+C / Ctrl+Shift+V copy & paste (only distinguishable from Ctrl+C/V with
  // the kitty keyboard protocol, so legacy Ctrl+C still interrupts the program).
  if (k.ctrl && k.shift && (k.name === "c" || k.name === "v")) return true;
  return false;
}

/**
 * Keys the focused file editor owns: anything that types text, plus its own
 * shortcuts (Ctrl+F search, Ctrl+D word highlight, Ctrl+G blame, Ctrl+S save,
 * Ctrl+R reload). Typing "?" in code used to open the help panel and Ctrl+F also
 * maximized the panel.
 */
export function isEditorOwnedKey(k: KeyLike): boolean {
  if (k.eventType === "release") return false;
  if (k.ctrl && !k.shift && ["f", "d", "g", "s", "r"].includes(k.name)) return true;
  return isTextKey(k);
}

/** A key that types text (no Ctrl/Alt/Cmd): never an IDE shortcut while typing. */
export function isTextKey(k: KeyLike): boolean {
  if (k.eventType === "release") return false;
  if (k.ctrl || k.meta || k.super) return false;
  if (k.name === "space") return true;
  return !!k.sequence && k.sequence.length >= 1 && !/[\x00-\x1f\x7f]/.test(k.sequence);
}
