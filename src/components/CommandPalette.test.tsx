import { test, expect } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { CommandPalette, type Command } from "./CommandPalette";

test("mouse wheel moves the selection; Enter runs the selected command", async () => {
  let ran = "";
  const commands: Command[] = Array.from({ length: 30 }, (_, i) => ({
    id: `c${i}`,
    label: `Command ${String(i).padStart(2, "0")}`,
    category: "Test",
    action: () => (ran = `c${i}`),
  }));
  const setup = await testRender(<CommandPalette isOpen onClose={() => {}} commands={commands} />, { width: 80, height: 30 });
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    const y = frame.split("\n").findIndex((l) => l.includes("Command 01"));
    const x = frame.split("\n")[y]!.indexOf("Command 01");
    for (let i = 0; i < 3; i++) await setup.mockMouse.scroll(x, y, "down");
    for (let i = 0; i < 50 && !setup.captureCharFrame().includes("▸ Command 03"); i++) {
      await setup.renderOnce();
      await Bun.sleep(10);
    }
    expect(setup.captureCharFrame()).toContain("▸ Command 03");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(ran).toBe("c3");
  } finally {
    setup.renderer.destroy();
  }
});

test("results are ranked by relevance", async () => {
  const { scoreCommand } = await import("./CommandPalette");
  const cmds = ["Close Tab", "Focus Terminal", "Quick Settings", "Split Terminal", "Search Terminal Output"].map((label, i) => ({ id: `c${i}`, label, action: () => {} }));
  const rank = (q: string) => cmds.map((c, i) => ({ c, i, s: scoreCommand(q, c) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c.label);
  expect(rank("sett")[0]).toBe("Quick Settings");
  expect(rank("split")[0]).toBe("Split Terminal");
  expect(rank("term").slice(0, 3)).toEqual(["Focus Terminal", "Split Terminal", "Search Terminal Output"]);
  expect(rank("zzz")).toEqual([]);
});
