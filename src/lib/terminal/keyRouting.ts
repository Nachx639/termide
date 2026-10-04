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
