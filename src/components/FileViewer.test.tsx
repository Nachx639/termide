import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { useSyncExternalStore } from "react";
import { testRender } from "@opentui/react/test-utils";
import { FileViewer } from "./FileViewer";

type Setup = Awaited<ReturnType<typeof testRender>>;

async function waitForFrame(setup: Setup, cond: (f: string) => boolean, ms = 5000) {
  const end = Date.now() + ms;
  let frame = "";
  while (Date.now() < end) {
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    if (cond(frame)) return frame;
    await Bun.sleep(40);
  }
  throw new Error(`frame never matched:\n${frame}`);
}

// Different size so the mtime/size check sees the change even within one mtime tick.
const writeExternal = (file: string, text: string) => fs.writeFileSync(file, text);

async function mount(content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-viewer-"));
  const file = path.join(dir, "notes.txt");
  fs.writeFileSync(file, content);
  const setup = await testRender(
    <box style={{ width: 80, height: 16 }}>
      <FileViewer filePath={file} focused={true} rootPath={dir} height={16} />
    </box>,
    { width: 80, height: 16 },
  );
  await waitForFrame(setup, (f) => f.includes(content.split("\n")[0]!));
  return { dir, file, setup };
}

test("reloads when another program changes the open file", async () => {
  const { dir, file, setup } = await mount("original line");
  try {
    writeExternal(file, "changed by the agent\nsecond line");
    await waitForFrame(setup, (f) => f.includes("changed by the agent") && f.includes("Reloaded"));
    // Our view must not write anything back.
    await Bun.sleep(700);
    expect(fs.readFileSync(file, "utf8")).toBe("changed by the agent\nsecond line");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unsaved edits + external change → conflict, nothing is overwritten; Ctrl+R loads disk", async () => {
  const { dir, file, setup } = await mount("base");
  try {
    await setup.mockInput.typeText("MINE ");
    // External change lands before our 500 ms autosave fires.
    writeExternal(file, "theirs, written by an agent");
    await waitForFrame(setup, (f) => f.includes("Changed on disk"));
    await Bun.sleep(800);
    expect(fs.readFileSync(file, "utf8")).toBe("theirs, written by an agent");

    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(setup, (f) => f.includes("theirs, written by an agent") && !f.includes("Changed on disk"));
    expect(frame).not.toContain("MINE");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Ctrl+S during a conflict keeps my version", async () => {
  const { dir, file, setup } = await mount("base");
  try {
    await setup.mockInput.typeText("MINE ");
    writeExternal(file, "theirs, written by an agent");
    await waitForFrame(setup, (f) => f.includes("Changed on disk"));
    setup.mockInput.pressKey("s", { ctrl: true });
    await waitForFrame(setup, (f) => !f.includes("Changed on disk"));
    expect(fs.readFileSync(file, "utf8")).toContain("MINE");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("edits pending when the viewer unmounts are saved, not dropped", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-viewer-"));
  const file = path.join(dir, "notes.txt");
  fs.writeFileSync(file, "base");
  // Zen mode / maximize unmount the viewer: emulate with a visibility flag.
  let shown = true;
  const subs = new Set<() => void>();
  const setShown = (v: boolean) => { shown = v; subs.forEach((l) => l()); };
  function Host() {
    const visible = useSyncExternalStore((l) => (subs.add(l), () => subs.delete(l)), () => shown);
    return <box style={{ width: 80, height: 16 }}>{visible ? <FileViewer filePath={file} focused={true} rootPath={dir} height={16} /> : <text>hidden</text>}</box>;
  }
  const setup = await testRender(<Host />, { width: 80, height: 16 });
  try {
    await waitForFrame(setup, (f) => f.includes("base"));
    await setup.mockInput.typeText("KEEP ");
    await setup.renderOnce();
    setShown(false); // unmount before the 500 ms autosave
    await waitForFrame(setup, (f) => f.includes("hidden"));
    expect(fs.readFileSync(file, "utf8")).toContain("KEEP");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("opening a file does not rewrite it", async () => {
  const { dir, file, setup } = await mount("untouched");
  try {
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
    const before = fs.statSync(file).mtimeMs;
    await Bun.sleep(900);
    await setup.renderOnce();
    expect(fs.statSync(file).mtimeMs).toBe(before);
    expect(setup.captureCharFrame()).not.toContain("●");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("F12 jumps to the definition in the imported file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-gotodef-"));
  fs.writeFileSync(path.join(dir, "b.ts"), "// util\n\nexport function helper() {\n  return 1;\n}\n");
  fs.writeFileSync(path.join(dir, "a.ts"), 'import { helper } from "./b";\nhelper();\n');
  let jumped: [string, number | undefined] | null = null;
  const setup = await testRender(
    <box style={{ width: 80, height: 16 }}>
      <FileViewer filePath={path.join(dir, "a.ts")} focused={true} rootPath={dir} height={16} onJumpToFile={(f, l) => (jumped = [f, l])} />
    </box>,
    { width: 80, height: 16 },
  );
  try {
    await waitForFrame(setup, (f) => f.includes("helper();"));
    setup.mockInput.pressArrow("down");
    await waitForFrame(setup, (f) => f.includes("Ln 2:1"));
    setup.mockInput.pressKey("\x1b[24~" as any); // F12
    for (let i = 0; i < 50 && !jumped; i++) {
      await setup.renderOnce();
      await Bun.sleep(20);
    }
    expect(jumped).toEqual([path.join(dir, "b.ts"), 3] as any);
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
