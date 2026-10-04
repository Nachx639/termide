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

test("mouse drag selects terminal text for copy, joining soft-wrapped lines", async () => {
  const setup = await testRender(
    <box style={{ width: 30, height: 10 }}>
      <Terminal
        cwd={process.cwd()}
        focused={false}
        onFocusRequest={() => {}}
        command={["/bin/sh", "-c", "printf 'first line\\nsecond line\\n'; printf 'abcdefghijklmnopqrstuvwxyz0123456789'; sleep 5"]}
      />
    </box>,
    { width: 40, height: 12 },
  );
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("0123"));
    // Box border (1) + padding (1) → terminal origin at column 2, row 1.
    const lines = frame.split("\n");
    const y0 = lines.findIndex((l) => l.includes("first line"));
    const x0 = lines[y0]!.indexOf("first line");
    await setup.mockMouse.drag(x0 + 6, y0, x0 + 6, y0 + 1);
    await setup.renderOnce();
    expect(setup.renderer.getSelection()?.getSelectedText()).toBe("line\nsecond");

    // From the start of the wrapped line to its continuation: no newline inserted.
    await setup.mockMouse.drag(x0, y0 + 2, x0 + 10, y0 + 3);
    await setup.renderOnce();
    expect(setup.renderer.getSelection()?.getSelectedText()).toBe("abcdefghijklmnopqrstuvwxyz0123456789".slice(0, 26 + 10));
  } finally {
    setup.renderer.destroy();
  }
});

test("double-click on a file reference in the output opens it at that line", async () => {
  const fsx = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const dir = fsx.mkdtempSync(path.join(os.tmpdir(), "termide-term-links-"));
  fsx.mkdirSync(path.join(dir, "data"));
  fsx.writeFileSync(path.join(dir, "data", "hello.txt"), "a\nb\nc\n");
  let opened: [string, number | undefined] | null = null;
  const setup = await testRender(
    <box style={{ width: 60, height: 10 }}>
      <Terminal
        cwd={dir}
        focused={true}
        onFocusRequest={() => {}}
        onOpenFile={(f, l) => (opened = [f, l])}
        command={["/bin/sh", "-c", "echo 'error at data/hello.txt:3 here'; sleep 5"]}
      />
    </box>,
    { width: 60, height: 12 },
  );
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("hello.txt:3"));
    const lines = frame.split("\n");
    const y = lines.findIndex((l) => l.includes("hello.txt"));
    const x = lines[y]!.indexOf("hello.txt");
    await setup.mockMouse.click(x, y);
    await setup.mockMouse.click(x, y);
    for (let i = 0; i < 50 && !opened; i++) await Bun.sleep(20);
    expect(opened).toEqual([fsx.realpathSync(path.join(dir, "data", "hello.txt")), 3] as any);
  } finally {
    setup.renderer.destroy();
    fsx.rmSync(dir, { recursive: true, force: true });
  }
});

test("Ctrl+X / search finds text in the scrollback and jumps between matches", async () => {
  let openSearch: (() => void) | null = null;
  const setup = await testRender(
    <box style={{ width: 60, height: 12 }}>
      <Terminal
        cwd={process.cwd()}
        focused={true}
        onFocusRequest={() => {}}
        onSearchReady={(open) => (openSearch = open)}
        command={["/bin/sh", "-c", "i=0; while [ $i -lt 300 ]; do if [ $i = 20 ] || [ $i = 150 ] || [ $i = 280 ]; then echo \"line $i needle\"; else echo \"line $i\"; fi; i=$((i+1)); done; sleep 5"]}
      />
    </box>,
    { width: 60, height: 14 },
  );
  try {
    await waitForFrame(setup, (f) => f.includes("line 299"));
    openSearch!();
    await waitForFrame(setup, (f) => f.includes("Esc:close"));
    await setup.mockInput.typeText("needle");
    let frame = await waitForFrame(setup, (f) => f.includes("3/3"));
    expect(frame).toContain("line 280 needle");
    setup.mockInput.pressEnter(); // older
    frame = await waitForFrame(setup, (f) => f.includes("2/3"));
    expect(frame).toContain("line 150 needle");
    setup.mockInput.pressEnter();
    frame = await waitForFrame(setup, (f) => f.includes("1/3"));
    expect(frame).toContain("line 20 needle");
    setup.mockInput.pressEscape();
    frame = await waitForFrame(setup, (f) => !f.includes("Esc:close"));
    expect(frame).toContain("line 299");
  } finally {
    setup.renderer.destroy();
  }
});
