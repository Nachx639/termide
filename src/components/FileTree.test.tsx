import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testRender } from "@opentui/react/test-utils";
import { FileTree } from "./FileTree";

type Setup = Awaited<ReturnType<typeof testRender>>;

async function waitForFrame(setup: Setup, cond: (f: string) => boolean, ms = 4000) {
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

test("files created outside termide appear; expanded folders stay expanded", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-tree-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "");
  const setup = await testRender(
    <box style={{ width: 40, height: 16 }}>
      <FileTree rootPath={dir} onFileSelect={() => {}} focused={true} />
    </box>,
    { width: 40, height: 16 },
  );
  try {
    await waitForFrame(setup, (f) => f.includes("src"));
    setup.mockInput.pressEnter(); // expand src
    await waitForFrame(setup, (f) => f.includes("main.ts"));

    // An agent writes new files.
    fs.writeFileSync(path.join(dir, "src", "agent-made.ts"), "");
    fs.writeFileSync(path.join(dir, "NOTES.md"), "");
    const frame = await waitForFrame(setup, (f) => f.includes("agent-made.ts") && f.includes("NOTES.md"));
    expect(frame).toContain("main.ts"); // src still expanded

    fs.rmSync(path.join(dir, "NOTES.md"));
    await waitForFrame(setup, (f) => !f.includes("NOTES.md"));
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("keyboard selection scrolls long lists (more than 20 entries)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-tree-"));
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(dir, `file-${String(i).padStart(2, "0")}.txt`), "");
  const setup = await testRender(
    <box style={{ width: 40, height: 12 }}>
      <FileTree rootPath={dir} onFileSelect={() => {}} focused={true} />
    </box>,
    { width: 40, height: 12 },
  );
  try {
    await waitForFrame(setup, (f) => f.includes("file-00"));
    for (let i = 0; i < 45; i++) setup.mockInput.pressArrow("down");
    await waitForFrame(setup, (f) => f.includes("file-45"));
    setup.mockInput.pressKey("G", { shift: true });
    await waitForFrame(setup, (f) => f.includes("file-59"));
    setup.mockInput.pressKey("g");
    await waitForFrame(setup, (f) => f.includes("file-00"));
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
