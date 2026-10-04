import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testRender } from "@opentui/react/test-utils";
import { FileOperationsModal } from "./FileOperationsModal";

test("new file names keep upper case and spaces", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-fileops-"));
  let created: string | undefined;
  const setup = await testRender(
    <FileOperationsModal isOpen operation="create-file" targetPath={dir} onClose={() => {}} onSuccess={(p) => (created = p)} onError={() => {}} />,
    { width: 80, height: 20 },
  );
  try {
    await setup.renderOnce();
    await setup.mockInput.typeText("My Notes.MD");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("My Notes.MD");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(created).toBe(path.join(dir, "My Notes.MD"));
    expect(fs.existsSync(path.join(dir, "My Notes.MD"))).toBe(true);
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rename starts from the current name; delete asks for confirmation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-fileops-"));
  const file = path.join(dir, "Old Name.txt");
  fs.writeFileSync(file, "x");
  let renamed: string | undefined;
  const setup = await testRender(
    <FileOperationsModal isOpen operation="rename" targetPath={file} onClose={() => {}} onSuccess={(p) => (renamed = p)} onError={() => {}} />,
    { width: 80, height: 20 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Old Name.txt");
    expect(frame).toContain("Enter: confirm | Esc: cancel");
    for (let i = 0; i < 4; i++) setup.mockInput.pressBackspace();
    await setup.mockInput.typeText(".md");
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(fs.existsSync(path.join(dir, "Old Name.md"))).toBe(true);
  } finally {
    setup.renderer.destroy();
  }

  let deleted = false;
  const del = await testRender(
    <FileOperationsModal isOpen operation="delete" targetPath={path.join(dir, "Old Name.md")} onClose={() => {}} onSuccess={() => (deleted = true)} onError={() => {}} />,
    { width: 80, height: 20 },
  );
  try {
    await del.renderOnce();
    expect(del.captureCharFrame()).toContain("cannot be undone");
    del.mockInput.pressEnter();
    await del.renderOnce();
    expect(deleted).toBe(true);
    expect(fs.existsSync(path.join(dir, "Old Name.md"))).toBe(false);
  } finally {
    del.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("case-only rename works; nested new file paths create folders", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-fileops-"));
  const file = path.join(dir, "data.json");
  fs.writeFileSync(file, "{}");
  let errorMsg = "";
  const setup = await testRender(
    <FileOperationsModal isOpen operation="rename" targetPath={file} onClose={() => {}} onSuccess={() => {}} onError={(m) => (errorMsg = m)} />,
    { width: 80, height: 20 },
  );
  try {
    await setup.renderOnce();
    for (let i = 0; i < 9; i++) setup.mockInput.pressBackspace();
    await setup.mockInput.typeText("Data.json");
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(errorMsg).toBe("");
    expect(fs.readdirSync(dir)).toEqual(["Data.json"]);
  } finally {
    setup.renderer.destroy();
  }
  let created = "";
  const c = await testRender(
    <FileOperationsModal isOpen operation="create-file" targetPath={dir} onClose={() => {}} onSuccess={(p) => (created = p ?? "")} onError={(m) => (errorMsg = m)} />,
    { width: 80, height: 20 },
  );
  try {
    await c.renderOnce();
    await c.mockInput.typeText("new/deep/file.ts");
    await c.renderOnce();
    c.mockInput.pressEnter();
    await c.renderOnce();
    expect(errorMsg).toBe("");
    expect(fs.existsSync(path.join(dir, "new", "deep", "file.ts"))).toBe(true);
  } finally {
    c.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
