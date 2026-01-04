// Responsive Layout System for Termide
// Supports various screen sizes from iPhone (tiny) to desktop (wide)

export type ScreenSize = "tiny" | "compact" | "normal" | "wide";

export interface LayoutConfig {
  screenSize: ScreenSize;
  showSidebar: boolean;
  showTabs: boolean;
  showHeader: boolean;
  showStatusBar: boolean;
  sidebarWidth: number;
  viewerHeightRatio: number;
  headerHeight: number;
  isMiniMode: boolean;
  panelsVisible: {
    explorer: boolean;
    sourceControl: boolean;
    gitGraph: boolean;
    viewer: boolean;
    terminal: boolean;
  };
}

// Screen size breakpoints (in columns)
export const BREAKPOINTS = {
  tiny: 50,     // iPhone portrait with keyboard (~45-55 cols)
  compact: 80,  // iPad portrait / small terminal
  normal: 120,  // Standard terminal
  wide: 160,    // Large screen / ultrawide
};

// Height breakpoints (in rows)
export const HEIGHT_BREAKPOINTS = {
  tiny: 15,     // iPhone with keyboard (~12-15 rows)
  compact: 24,  // Standard min terminal
  normal: 35,   // Normal terminal
  tall: 50,     // Large screen
};

export function getScreenSize(width: number, height: number): ScreenSize {
  // For very small heights (mobile with keyboard), force mini mode
  if (height < HEIGHT_BREAKPOINTS.tiny || width < BREAKPOINTS.tiny) {
    return "tiny";
  }
  if (width < BREAKPOINTS.compact || height < HEIGHT_BREAKPOINTS.compact) {
    return "compact";
  }
  if (width < BREAKPOINTS.normal) {
    return "normal";
  }
  return "wide";
}

export function getLayoutConfig(width: number, height: number): LayoutConfig {
  const screenSize = getScreenSize(width, height);

  switch (screenSize) {
    case "tiny":
      // Mini mode: Single panel, no chrome
      return {
        screenSize,
        showSidebar: false,
        showTabs: false,
        showHeader: false,
        showStatusBar: true, // Keep minimal status
        sidebarWidth: 0,
        viewerHeightRatio: 0,
        headerHeight: 0,
        isMiniMode: true,
        panelsVisible: {
          explorer: false,
          sourceControl: false,
          gitGraph: false,
          viewer: false,
          terminal: true, // Only terminal in mini mode
        },
      };

    case "compact":
      // Compact mode: Collapsible sidebar, minimal header
      return {
        screenSize,
        showSidebar: true,
        showTabs: true,
        showHeader: true,
        showStatusBar: true,
        sidebarWidth: Math.min(25, Math.floor(width * 0.3)),
        viewerHeightRatio: 0.4,
        headerHeight: 2, // Reduced header
        isMiniMode: false,
        panelsVisible: {
          explorer: true,
          sourceControl: false, // Hidden in compact
          gitGraph: false,      // Hidden in compact
          viewer: true,
          terminal: true,
        },
      };

    case "normal":
      // Normal mode: Full layout
      return {
        screenSize,
        showSidebar: true,
        showTabs: true,
        showHeader: true,
        showStatusBar: true,
        sidebarWidth: 30,
        viewerHeightRatio: 0.35,
        headerHeight: 5,
        isMiniMode: false,
        panelsVisible: {
          explorer: true,
          sourceControl: true,
          gitGraph: true,
          viewer: true,
          terminal: true,
        },
      };

    case "wide":
      // Wide mode: Extended sidebar, more space
      return {
        screenSize,
        showSidebar: true,
        showTabs: true,
        showHeader: true,
        showStatusBar: true,
        sidebarWidth: 35,
        viewerHeightRatio: 0.4,
        headerHeight: 5,
        isMiniMode: false,
        panelsVisible: {
          explorer: true,
          sourceControl: true,
          gitGraph: true,
          viewer: true,
          terminal: true,
        },
      };
  }
}

// Helper to get a friendly screen size label
export function getScreenSizeLabel(size: ScreenSize): string {
  switch (size) {
    case "tiny": return "📱 Mini";
    case "compact": return "📱 Compact";
    case "normal": return "💻 Normal";
    case "wide": return "🖥️ Wide";
  }
}

// Panel switching for mini mode
export type MiniModePanel = "explorer" | "viewer" | "terminal" | "agent";

export function getMiniModePanelIcon(panel: MiniModePanel): string {
  switch (panel) {
    case "explorer": return "📁";
    case "viewer": return "📄";
    case "terminal": return "⌨️";
    case "agent": return "🤖";
  }
}
