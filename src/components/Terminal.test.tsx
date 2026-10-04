import { test, expect } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Terminal } from "./Terminal";

async function waitForFrame(setup: Awaited<ReturnType<typeof testRender>>, cond: (f: string) => boolean, ms = 4000) {
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

test("paints the PTY screen, wide chars included, sized to its box", async () => {
  const setup = await testRender(
    <box style={{ width: 50, height: 10 }}>
      <Terminal
        cwd={process.cwd()}
        focused={false}
        onFocusRequest={() => {}}
        command={["/bin/sh", "-c", "printf 'hello \\033[1;32mgreen\\033[0m 🙂中!'; stty size; sleep 5"]}
      />
    </box>,
    { width: 60, height: 12 },
  );
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("!") && /\d+ \d+/.test(f));
    expect(frame).toContain("hello green 🙂中!");
    // box 50x10 minus border (2) and horizontal padding (2) → 46 cols, 8 rows
    expect(frame).toContain("8 46");
  } finally {
    setup.renderer.destroy();
  }
});

test("typing goes to the shell when focused", async () => {
  const setup = await testRender(
    <box style={{ width: 50, height: 10 }}>
      <Terminal cwd={process.cwd()} focused={true} onFocusRequest={() => {}} command={["/bin/sh", "-c", "stty -icanon; cat"]} />
    </box>,
    { width: 60, height: 12 },
  );
  try {
    await Bun.sleep(150);
    await setup.mockInput.typeText("Tab?ok");
    await waitForFrame(setup, (f) => f.includes("Tab?ok"));
  } finally {
    setup.renderer.destroy();
  }
});
