import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testRender } from "@opentui/react/test-utils";
import { AgentPanel } from "./AgentPanel";

type Setup = Awaited<ReturnType<typeof testRender>>;

async function waitForFrame(setup: Setup, cond: (f: string) => boolean, ms = 5000) {
  const end = Date.now() + ms;
  let frame = "";
  while (Date.now() < end) {
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    if (cond(frame)) return frame;
    await Bun.sleep(30);
  }
  throw new Error(`frame never matched:\n${frame}`);
}

test("custom agent: connect, prompt, approve a write, see the tool result", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-agentpanel-"));
  // Command lines are split on whitespace, so use a path without spaces.
  const mock = path.join(dir, "mock-agent.ts");
  fs.copyFileSync(path.join(import.meta.dir, "../lib/acp/fixtures/mock-agent.ts"), mock);
  const setup = await testRender(<AgentPanel rootPath={dir} focused={true} onFocus={() => {}} isolated />, { width: 90, height: 24 });
  try {
    await waitForFrame(setup, (f) => f.includes("Select an AI Agent"));
    for (let i = 0; i < 3; i++) setup.mockInput.pressArrow("down"); // → Custom...
    await waitForFrame(setup, (f) => f.includes("▸ 🔧 Custom"));
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("Command:"));
    await setup.mockInput.typeText(`bun ${mock}`);
    await waitForFrame(setup, (f) => f.includes("mock-agent.ts"));
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("Connected to Mock Agent"));

    // "/" lists the agent's commands; Tab completes the first match.
    await setup.mockInput.typeText("/re");
    const sugg = await waitForFrame(setup, (f) => f.includes("/review"));
    expect(sugg).toContain("Review the changes");
    expect(sugg).not.toContain("/compact");
    setup.mockInput.pressTab();
    await waitForFrame(setup, (f) => f.includes("> /review") && !f.includes("Tab: complete"));
    for (let i = 0; i < 8; i++) setup.mockInput.pressBackspace();
    await waitForFrame(setup, (f) => f.includes("Ask the agent"));

    await setup.mockInput.typeText("write Notes.md Hola Mundo");
    await waitForFrame(setup, (f) => f.includes("Hola Mundo"));
    setup.mockInput.pressEnter();
    const ask = await waitForFrame(setup, (f) => f.includes("Allow Write Notes.md?"));
    expect(ask).toContain("1. Allow");
    expect(ask).toContain("2. Reject");
    setup.mockInput.pressKey("1");
    const done = await waitForFrame(setup, (f) => f.includes("written"));
    expect(done).toContain("✓ Write Notes.md");
    expect(done).toContain("Notes.md +1 -0");
    // Upper case and spaces typed in the input reach the agent intact.
    expect(fs.readFileSync(path.join(dir, "Notes.md"), "utf8")).toBe("Hola Mundo");
  } finally {
    setup.renderer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
