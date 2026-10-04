import { test, expect, describe } from "bun:test";
import { parseKeypress } from "@opentui/core";
import { encodeKey } from "./KeyEncoder";
import { isTerminalHostKey, isEditorOwnedKey } from "./keyRouting";

const enc = (input: string, kitty: boolean, applicationCursor = false) => {
  const k = parseKeypress(input, { useKittyKeyboard: kitty });
  if (!k) throw new Error(`unparsed ${JSON.stringify(input)}`);
  return encodeKey(k as any, { applicationCursor });
};

describe("legacy input is forwarded byte-for-byte", () => {
  test.each([
    ["a"], ["A"], ["ñ"], ["!"], ["\x01"], ["\x1bx"], ["\r"], ["\x7f"], ["\x1b[Z"], ["\x1b\r"], ["\x00"],
  ])("%j", (s) => {
    expect(enc(s, false)).toBe(s);
  });
});

describe("kitty CSI-u input becomes legacy xterm bytes", () => {
  test.each([
    ["\x1b[97u", "a"],
    ["\x1b[97;2u", "A"],
    ["\x1b[97;5u", "\x01"],          // Ctrl+A
    ["\x1b[99;5u", "\x03"],          // Ctrl+C
    ["\x1b[97;3u", "\x1ba"],         // Alt+A
    ["\x1b[33;2u", "!"],
    ["\x1b[49:33;2u", "!"],          // Shift+1 with shifted key
    ["\x1b[241u", "ñ"],
    ["\x1b[13u", "\r"],
    ["\x1b[13;2u", "\x1b\r"],        // Shift+Enter → newline in Claude Code
    ["\x1b[127u", "\x7f"],
    ["\x1b[127;3u", "\x1b\x7f"],     // Alt+Backspace
    ["\x1b[9u", "\t"],
    ["\x1b[9;2u", "\x1b[Z"],         // Shift+Tab
    ["\x1b[27u", "\x1b"],
    ["\x1b[32;5u", "\x00"],          // Ctrl+Space
    ["\x1b[57399u", "0"],            // keypad 0
  ])("%j → %j", (input, out) => {
    expect(enc(input, true)).toBe(out);
  });

  test("key releases and Cmd combos are not sent", () => {
    expect(enc("\x1b[97;1:3u", true)).toBeNull();
    expect(enc("\x1b[99;9u", true)).toBeNull();
  });
});

describe("cursor keys follow DECCKM", () => {
  test("normal mode", () => {
    expect(enc("\x1b[A", false)).toBe("\x1b[A");
    expect(enc("\x1bOA", false)).toBe("\x1b[A");
  });
  test("application mode", () => {
    expect(enc("\x1b[A", false, true)).toBe("\x1bOA");
    expect(enc("\x1b[D", true, true)).toBe("\x1bOD");
  });
  test("modified arrows keep the modifier", () => {
    expect(enc("\x1b[1;5C", true, true)).toBe("\x1b[1;5C");
    expect(enc("\x1b[1;3D", false)).toBe("\x1b[1;3D");
  });
});

describe("terminal focus keeps only escape hatches for the IDE", () => {
  const host = (s: string, kitty = true) => isTerminalHostKey(parseKeypress(s, { useKittyKeyboard: kitty }) as any);
  test("shell keys stay in the terminal", () => {
    for (const s of ["\t", "\x0b", "\x10", "\x17", "\x02", "\x06", "?", "\x03", "\x1b[Z"]) expect(host(s, false)).toBe(false);
  });
  test("leader, help and agent toggle go to the IDE", () => {
    expect(host("\x18", false)).toBe(true);         // Ctrl+X
    expect(host("\x1bOP", false)).toBe(true);       // F1
    expect(host("\x00", false)).toBe(true);         // Ctrl+Space
    expect(host("\x1b[118;6u")).toBe(true);         // Ctrl+Shift+V (kitty)
  });
});

describe("editor focus owns typed text and its own shortcuts", () => {
  const owned = (s: string, kitty = false) => isEditorOwnedKey(parseKeypress(s, { useKittyKeyboard: kitty }) as any);
  test("typed characters never trigger IDE commands", () => {
    for (const s of ["?", "@", "a", "Z", "ñ", " ", "\x1b[33;2u"]) expect(owned(s, s.startsWith("\x1b"))).toBe(true);
  });
  test("editor shortcuts stay in the editor, IDE shortcuts do not", () => {
    for (const s of ["\x06", "\x04", "\x07", "\x13", "\x12"]) expect(owned(s)).toBe(true); // Ctrl+F D G S R
    for (const s of ["\x10", "\x0b", "\x17", "\x18", "\x1b", "\t"]) expect(owned(s)).toBe(false); // Ctrl+P K W X, Esc, Tab
  });
});
