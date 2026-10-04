import { test, expect } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { PanelErrorBoundary } from "./ErrorBoundary";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("boom in render");
  return <text>recovered</text>;
}

test("a crashing panel shows an error instead of taking down the app, and reloads on click", async () => {
  const origError = console.error;
  console.error = () => {};
  const setup = await testRender(
    <box style={{ flexDirection: "row", width: 60, height: 8 }}>
      <box style={{ width: 30 }}>
        <PanelErrorBoundary panelName="Viewer">
          <Flaky />
        </PanelErrorBoundary>
      </box>
      <text>sibling ok</text>
    </box>,
    { width: 60, height: 8 },
  );
  try {
    await setup.renderOnce();
    let frame = setup.captureCharFrame();
    expect(frame).toContain("Viewer crashed");
    expect(frame).toContain("boom in render");
    expect(frame).toContain("sibling ok");
    shouldThrow = false;
    await setup.mockMouse.click(5, 3);
    await setup.renderOnce();
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    expect(frame).toContain("recovered");
  } finally {
    console.error = origError;
    setup.renderer.destroy();
  }
});
