import { test, expect } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { MascotLine } from "./Mascot";

test("the termite is drawn in colour (orange head, cream body)", async () => {
  const setup = await testRender(
    <box style={{ width: 40, height: 3, flexDirection: "column" }}>
      <box style={{ height: 1 }}><MascotLine line={0} width={40} /></box>
      <box style={{ height: 1 }}><MascotLine line={1} width={40} /></box>
      <box style={{ height: 1 }}><MascotLine line={2} width={40} /></box>
    </box>,
    { width: 40, height: 3 },
  );
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("(◕)");
    const hex = (c: any) => "#" + c.toInts().slice(0, 3).map((v: number) => v.toString(16).padStart(2, "0")).join("");
    const colours = new Map<string, string>();
    for (const line of setup.captureSpans().lines) for (const sp of line.spans) for (const ch of sp.text) colours.set(ch, hex(sp.fg));
    expect(colours.get("(")).toBe("#c2551a");
    expect(colours.get("░")).toBe("#f3e3bd");
  } finally {
    setup.renderer.destroy();
  }
});
