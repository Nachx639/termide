import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testRender } from "@opentui/react/test-utils";
import { FileViewer } from "./FileViewer";

type Setup = Awaited<ReturnType<typeof testRender>>;

/** Hex colour of the span containing `needle`. */
function colorOf(setup: Setup, needle: string): string | null {
  for (const line of setup.captureSpans().lines) {
    for (const span of line.spans) {
      if (span.text.includes(needle)) {
        const [r, g, b] = span.fg.toInts();
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      }
    }
  }
  return null;
}

async function render(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-hl-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  const setup = await testRender(
    <box style={{ width: 80, height: 12 }}>
      <FileViewer filePath={file} focused={false} rootPath={dir} height={12} showMinimap={false} />
    </box>,
    { width: 80, height: 12 },
  );
  return { setup, dir };
}

async function waitColors(setup: Setup, check: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await setup.renderOnce();
    if (check()) return;
    await Bun.sleep(40);
  }
}

test("TypeScript is highlighted with tree-sitter", async () => {
  const { setup, dir } = await render("a.ts", 'const greeting = "hola";\n// comment here\nfunction f() { return 42 }\n');
  try {
    await waitColors(setup, () => colorOf(setup, "const") === "#c792ea");
    expect(colorOf(setup, "const")).toBe("#c792ea"); // keyword
    expect(colorOf(setup, '"hola"')).toBe("#c3e88d"); // string
    expect(colorOf(setup, "comment here")).toBe("#676e95"); // comment
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Python falls back to the regex tokenizer", async () => {
  const { setup, dir } = await render("a.py", 'def hello():\n    return "x"  # note\n');
  try {
    await waitColors(setup, () => colorOf(setup, "def") === "#c792ea");
    expect(colorOf(setup, "def")).toBe("#c792ea");
    expect(colorOf(setup, '"x"')).toBe("#c3e88d");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("light theme: editor background and text follow the theme", async () => {
  const { THEMES } = await import("../lib/ThemeSystem");
  const { parseColor } = await import("@opentui/core");
  const light = THEMES.find((t) => t.id === "light")!;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-hl-"));
  const file = path.join(dir, "a.ts");
  fs.writeFileSync(file, "const zebra = 1;\n");
  const setup = await testRender(
    <box style={{ width: 80, height: 12 }}>
      <FileViewer filePath={file} focused={false} rootPath={dir} height={12} showMinimap={false} syntaxTheme={light} />
    </box>,
    { width: 80, height: 12 },
  );
  try {
    await waitColors(setup, () => colorOf(setup, "zebra") !== null);
    let bg: number[] = [];
    for (const line of setup.captureSpans().lines) for (const sp of line.spans) if (sp.text.includes("zebra")) bg = sp.bg.toInts().slice(0, 3);
    expect(bg).toEqual(parseColor(light.background).toInts().slice(0, 3));
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
