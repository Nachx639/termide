import { test, expect, describe } from "bun:test";
import { TIMING, LAYOUT, LIMITS, ANIMATION, FILE_PATTERNS, SHORTCUTS, DEFAULTS } from "./config";

describe("config", () => {
  test("all timings are positive integers", () => {
    for (const [k, v] of Object.entries(TIMING)) {
      expect(Number.isInteger(v), k).toBe(true);
      expect(v, k).toBeGreaterThan(0);
    }
  });

  test("layout bounds are consistent", () => {
    expect(LAYOUT.MIN_TREE_WIDTH).toBeLessThanOrEqual(LAYOUT.DEFAULT_TREE_WIDTH);
    expect(LAYOUT.DEFAULT_TREE_WIDTH).toBeLessThanOrEqual(LAYOUT.MAX_TREE_WIDTH);
    expect(LAYOUT.MIN_TERMINAL_HEIGHT).toBeLessThanOrEqual(LAYOUT.DEFAULT_TERMINAL_HEIGHT);
    expect(LAYOUT.SMALL_SCREEN_COLS).toBeLessThan(LAYOUT.MEDIUM_SCREEN_COLS);
  });

  test("limits are positive", () => {
    for (const [k, v] of Object.entries(LIMITS)) expect(v, k).toBeGreaterThan(0);
    expect(LIMITS.MAX_FILE_SIZE_PREVIEW).toBe(10 * 1024 * 1024);
  });

  test("animation frames are non-empty", () => {
    expect(ANIMATION.SPINNER_FRAMES.length).toBeGreaterThan(1);
    expect(ANIMATION.ANT_FRAMES.length).toBeGreaterThan(1);
    expect(ANIMATION.SPINNER_INTERVAL).toBeGreaterThan(0);
  });

  test("binary extensions are lower-case, dotted and unique", () => {
    for (const ext of FILE_PATTERNS.BINARY_EXTENSIONS) {
      expect(ext).toMatch(/^\.[a-z0-9]+$/);
    }
    expect(new Set(FILE_PATTERNS.BINARY_EXTENSIONS).size).toBe(FILE_PATTERNS.BINARY_EXTENSIONS.length);
    // text formats must stay previewable
    for (const textExt of [".svg", ".ts", ".json", ".md", ".txt"]) {
      expect(FILE_PATTERNS.BINARY_EXTENSIONS as readonly string[]).not.toContain(textExt);
    }
  });

  test("ignored patterns include the usual heavy directories and are unique", () => {
    expect(FILE_PATTERNS.IGNORED_PATTERNS).toContain("node_modules");
    expect(FILE_PATTERNS.IGNORED_PATTERNS).toContain(".git");
    expect(new Set(FILE_PATTERNS.IGNORED_PATTERNS).size).toBe(FILE_PATTERNS.IGNORED_PATTERNS.length);
  });

  test("shortcuts are unique", () => {
    const values = Object.values(SHORTCUTS);
    expect(new Set(values).size).toBe(values.length);
  });

  test("defaults", () => {
    expect(DEFAULTS.TAB_SIZE).toBeGreaterThan(0);
    expect(typeof DEFAULTS.SHELL).toBe("string");
    expect(DEFAULTS.SHELL.length).toBeGreaterThan(0);
    expect(DEFAULTS.TERM).toBe("xterm-256color");
  });
});
