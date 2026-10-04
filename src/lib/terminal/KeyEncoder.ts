/**
 * KeyEncoder - turns OpenTUI key events into the bytes a PTY program expects
 * (legacy xterm encoding, which is what TERM=xterm-256color advertises).
 *
 * OpenTUI enables the kitty keyboard protocol by default, so on Ghostty/kitty/
 * WezTerm/iTerm2 the host sends CSI-u sequences that shells and most CLIs do not
 * understand. We therefore rebuild the legacy sequence from the parsed key instead
 * of forwarding `raw`. For legacy (`source: "raw"`) events the host bytes are
 * already correct and are forwarded untouched, except cursor keys, which must follow
 * the inner program's DECCKM (application cursor) mode.
 */

export interface KeyLike {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option?: boolean;
  super?: boolean;
  source?: "raw" | "kitty";
  eventType?: "press" | "repeat" | "release";
}

export interface EncodeOptions {
  /** DECCKM: inner program asked for application cursor keys (vim, less, htop...). */
  applicationCursor?: boolean;
}

const CURSOR_FINALS: Record<string, string> = {
  up: "A",
  down: "B",
  right: "C",
  left: "D",
  home: "H",
  end: "F",
};

const TILDE_CODES: Record<string, number> = {
  insert: 2,
  delete: 3,
  pageup: 5,
  pagedown: 6,
  f5: 15,
  f6: 17,
  f7: 18,
  f8: 19,
  f9: 20,
  f10: 21,
  f11: 23,
  f12: 24,
};

const SS3_FKEYS: Record<string, string> = { f1: "P", f2: "Q", f3: "R", f4: "S" };

/** Kitty reports keypad keys by name (kp0, kpenter...); send what the key types. */
const KEYPAD: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`kp${i}`, String(i)])),
  kpdecimal: ".",
  kpdivide: "/",
  kpmultiply: "*",
  kpminus: "-",
  kpplus: "+",
  kpequal: "=",
  kpenter: "\r",
};

const isPrintable =(s: string) => s.length > 0 && !/[\x00-\x1f\x7f]/.test(s);

/** xterm modifier parameter: 1 + shift + 2*alt + 4*ctrl */
function modifierParam(k: KeyLike, alt: boolean): number {
  return 1 + (k.shift ? 1 : 0) + (alt ? 2 : 0) + (k.ctrl ? 4 : 0);
}

/** Control character for Ctrl+<char>, or null when the combination has none. */
function ctrlChar(ch: string): string | null {
  if (ch.length !== 1) return null;
  const c = ch.toLowerCase();
  if (c >= "a" && c <= "z") return String.fromCharCode(c.charCodeAt(0) - 96);
  switch (c) {
    case "@": case "2": case " ": return "\x00";
    case "[": case "3": return "\x1b";
    case "\\": case "4": return "\x1c";
    case "]": case "5": return "\x1d";
    case "^": case "6": return "\x1e";
    case "_": case "-": case "7": return "\x1f";
    case "?": case "8": return "\x7f";
  }
  return null;
}

export function encodeKey(k: KeyLike, opts: EncodeOptions = {}): string | null {
  if (k.eventType === "release") return null;
  // Cmd/Super combos belong to the host (copy, paste, IDE shortcuts).
  if (k.super) return null;

  const alt = k.meta || !!k.option;
  const mod = modifierParam(k, alt);
  const name = k.name;

  const cursorFinal = CURSOR_FINALS[name];
  if (cursorFinal) {
    if (mod > 1) return `\x1b[1;${mod}${cursorFinal}`;
    return opts.applicationCursor ? `\x1bO${cursorFinal}` : `\x1b[${cursorFinal}`;
  }

  // Legacy input is already in the encoding the PTY expects.
  if (k.source !== "kitty" && k.sequence) return k.sequence;

  const tilde = TILDE_CODES[name];
  if (tilde !== undefined) return mod > 1 ? `\x1b[${tilde};${mod}~` : `\x1b[${tilde}~`;

  const ss3 = SS3_FKEYS[name];
  if (ss3) return mod > 1 ? `\x1b[1;${mod}${ss3}` : `\x1bO${ss3}`;

  const esc = alt ? "\x1b" : "";
  switch (name) {
    case "return":
    case "enter":
      // Shift+Enter → ESC CR, the "newline without submit" Claude Code and others expect.
      return k.shift ? "\x1b\r" : esc + "\r";
    case "linefeed":
      return esc + "\n";
    case "tab":
      return k.shift ? "\x1b[Z" : esc + "\t";
    case "backspace":
      return esc + (k.ctrl ? "\x08" : "\x7f");
    case "escape":
      return "\x1b";
    case "space":
      return esc + (k.ctrl ? "\x00" : " ");
  }

  const keypad = KEYPAD[name];
  if (keypad !== undefined) return esc + keypad;

  // Printable text (letters, symbols, any unicode).
  let text = isPrintable(k.sequence) ? k.sequence : name.length === 1 ? name : "";
  if (!text) return null;
  if (k.ctrl) {
    const c = ctrlChar(name.length === 1 ? name : text);
    if (c === null) return null;
    return esc + c;
  }
  if (k.shift && text.length === 1 && text >= "a" && text <= "z") text = text.toUpperCase();
  return esc + text;
}
