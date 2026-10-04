import { test, expect, describe } from "bun:test";
import {
  getScreenSize,
  getLayoutConfig,
  getScreenSizeLabel,
  getMiniModePanelIcon,
  BREAKPOINTS,
  HEIGHT_BREAKPOINTS,
  type ScreenSize,
} from "./ResponsiveLayout";

describe("getScreenSize", () => {
  test("width breakpoints (boundaries are exclusive upper bounds)", () => {
    expect(getScreenSize(BREAKPOINTS.tiny - 1, 40)).toBe("tiny");
    expect(getScreenSize(BREAKPOINTS.tiny, 40)).toBe("compact");
    expect(getScreenSize(BREAKPOINTS.compact - 1, 40)).toBe("compact");
    expect(getScreenSize(BREAKPOINTS.compact, 40)).toBe("normal");
    expect(getScreenSize(BREAKPOINTS.normal - 1, 40)).toBe("normal");
    expect(getScreenSize(BREAKPOINTS.normal, 40)).toBe("wide");
    expect(getScreenSize(400, 100)).toBe("wide");
  });

  test("short terminals force tiny/compact regardless of width", () => {
    expect(getScreenSize(300, HEIGHT_BREAKPOINTS.tiny - 1)).toBe("tiny");
    expect(getScreenSize(300, HEIGHT_BREAKPOINTS.tiny)).toBe("compact");
    expect(getScreenSize(300, HEIGHT_BREAKPOINTS.compact - 1)).toBe("compact");
    expect(getScreenSize(300, HEIGHT_BREAKPOINTS.compact)).toBe("wide");
  });

  test("degenerate sizes (0, negative, NaN) never throw and fall into tiny", () => {
    expect(getScreenSize(0, 0)).toBe("tiny");
    expect(getScreenSize(-5, 50)).toBe("tiny");
    expect(() => getScreenSize(NaN, NaN)).not.toThrow();
  });
});

describe("getLayoutConfig", () => {
  test("tiny: mini mode, terminal only", () => {
    const c = getLayoutConfig(40, 12);
    expect(c.screenSize).toBe("tiny");
    expect(c.isMiniMode).toBe(true);
    expect(c.showSidebar).toBe(false);
    expect(c.sidebarWidth).toBe(0);
    expect(c.panelsVisible).toEqual({ explorer: false, sourceControl: false, gitGraph: false, viewer: false, terminal: true });
  });

  test("compact: sidebar capped to 30% of width and at most 25 cols", () => {
    expect(getLayoutConfig(60, 30).sidebarWidth).toBe(18);
    expect(getLayoutConfig(79, 30).sidebarWidth).toBe(23);
    expect(getLayoutConfig(300, 20).sidebarWidth).toBe(25);
    const c = getLayoutConfig(60, 30);
    expect(c.panelsVisible.sourceControl).toBe(false);
    expect(c.panelsVisible.gitGraph).toBe(false);
    expect(c.headerHeight).toBe(2);
  });

  test("normal and wide show every panel", () => {
    for (const [w, size, sidebar] of [[100, "normal", 30], [200, "wide", 35]] as const) {
      const c = getLayoutConfig(w, 40);
      expect(c.screenSize).toBe(size);
      expect(c.sidebarWidth).toBe(sidebar);
      expect(c.isMiniMode).toBe(false);
      expect(Object.values(c.panelsVisible).every(Boolean)).toBe(true);
    }
  });

  test("sidebar never exceeds the screen and ratios are sane for all sizes", () => {
    for (let w = 0; w <= 300; w += 7) {
      for (let h = 0; h <= 80; h += 9) {
        const c = getLayoutConfig(w, h);
        expect(c.sidebarWidth).toBeLessThanOrEqual(Math.max(0, w));
        expect(c.viewerHeightRatio).toBeGreaterThanOrEqual(0);
        expect(c.viewerHeightRatio).toBeLessThan(1);
        expect(c.showSidebar).toBe(c.sidebarWidth > 0);
      }
    }
  });
});

describe("labels and icons", () => {
  test("every screen size has a label", () => {
    const sizes: ScreenSize[] = ["tiny", "compact", "normal", "wide"];
    const labels = sizes.map(getScreenSizeLabel);
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(4);
  });

  test("mini mode panel icons", () => {
    expect(getMiniModePanelIcon("explorer")).toBe("📁");
    expect(getMiniModePanelIcon("viewer")).toBe("📄");
    expect(getMiniModePanelIcon("terminal")).toBe("⌨️");
    expect(getMiniModePanelIcon("agent")).toBe("🤖");
  });
});
