import { test, expect } from "bun:test";
import { initialTermite, renderTermite, stepTermite, termiteSprite, TERMITE_WIDTH, type TermiteState } from "./termite";

const seeded = (seed = 1) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

test("stays inside the strip, turns at both edges, and does other things too", () => {
  const rand = seeded(7);
  let s = initialTermite();
  const width = 40;
  const seen = new Set<string>();
  let dirs = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    s = stepTermite(s, width, rand);
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThanOrEqual(width - TERMITE_WIDTH);
    seen.add(s.mode);
    dirs.add(s.dir);
    for (const row of renderTermite(s, width)) expect(row.length).toBe(width);
  }
  expect(dirs).toEqual(new Set([1, -1]));
  for (const mode of ["walk", "turn", "sniff", "munch"]) expect(seen.has(mode)).toBe(true);
});

test("left-facing sprite is the exact mirror of the right-facing one", () => {
  const right = termiteSprite({ ...initialTermite(), dir: 1 });
  const left = termiteSprite({ ...initialTermite(), dir: -1 });
  const flip: Record<string, string> = { "(": ")", ")": "(", ">": "<", "<": ">", "╱": "╲", "╲": "╱" };
  right.forEach((row, r) => {
    expect(row.length).toBe(TERMITE_WIDTH);
    const mirrored = row.slice().reverse().map((c) => flip[c.ch] ?? c.ch).join("");
    expect(left[r]!.map((c) => c.ch).join("")).toBe(mirrored);
  });
});

test("legs alternate while walking", () => {
  const legs = (tick: number) => termiteSprite({ ...initialTermite(), tick })[2]!.map((c) => c.ch).join("");
  expect(legs(0)).not.toBe(legs(1));
});

test("toggling off: poof frames, then gone (renders nothing)", () => {
  let s: TermiteState = { ...initialTermite(), mode: "poof", poof: 0 };
  for (let i = 0; i < 10; i++) s = stepTermite(s, 30);
  expect(s.mode).toBe("gone");
  expect(renderTermite(s, 30).every((row) => row.every((c) => c.ch === " "))).toBe(true);
});

test("too narrow: hidden instead of clipped", () => {
  expect(renderTermite(initialTermite(), TERMITE_WIDTH - 1).every((row) => row.every((c) => c.ch === " "))).toBe(true);
});
