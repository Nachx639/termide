import { useState, useEffect } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { LAYOUT } from "../lib/config";

export type ScreenSize = "small" | "medium" | "large" | "xlarge";

interface ScreenDimensions {
  cols: number;
  rows: number;
}

interface UseScreenSizeReturn {
  /** Current screen size category */
  size: ScreenSize;
  /** Raw dimensions */
  dimensions: ScreenDimensions;
  /** Whether screen is small */
  isSmall: boolean;
  /** Whether screen is medium or smaller */
  isMediumOrSmaller: boolean;
  /** Whether screen is large or bigger */
  isLargeOrBigger: boolean;
  /** Whether in compact mode (small screen) */
  isCompact: boolean;
}

/**
 * Get screen size category from columns
 */
function getScreenSize(cols: number): ScreenSize {
  if (cols < LAYOUT.SMALL_SCREEN_COLS) return "small";
  if (cols < LAYOUT.MEDIUM_SCREEN_COLS) return "medium";
  if (cols < 160) return "large";
  return "xlarge";
}

/**
 * Hook for responsive screen size detection.
 * Uses centralized breakpoints from config.
 *
 * @example
 * ```tsx
 * const { size, isCompact, dimensions } = useScreenSize();
 *
 * if (isCompact) {
 *   return <CompactView />;
 * }
 * ```
 */
export function useScreenSize(): UseScreenSizeReturn {
  const { cols, rows } = useTerminalDimensions();

  const size = getScreenSize(cols);
  const isSmall = size === "small";
  const isMediumOrSmaller = size === "small" || size === "medium";
  const isLargeOrBigger = size === "large" || size === "xlarge";

  return {
    size,
    dimensions: { cols, rows },
    isSmall,
    isMediumOrSmaller,
    isLargeOrBigger,
    isCompact: isSmall,
  };
}

/**
 * Calculate optimal panel widths based on screen size
 */
export function useResponsiveLayout() {
  const { dimensions, size, isCompact } = useScreenSize();
  const { cols, rows } = dimensions;

  // Calculate tree width
  const treeWidth = isCompact
    ? 0 // Hide tree on small screens
    : Math.min(
        Math.max(LAYOUT.MIN_TREE_WIDTH, Math.floor(cols * 0.2)),
        LAYOUT.MAX_TREE_WIDTH
      );

  // Calculate terminal height
  const terminalHeight = isCompact
    ? Math.floor(rows * 0.4)
    : Math.max(LAYOUT.MIN_TERMINAL_HEIGHT, Math.floor(rows * 0.3));

  // Calculate viewer width (remaining space)
  const viewerWidth = cols - treeWidth - 2; // -2 for borders

  // Calculate viewer height
  const viewerHeight = rows - terminalHeight - 3; // -3 for header/status

  return {
    treeWidth,
    terminalHeight,
    viewerWidth,
    viewerHeight,
    size,
    isCompact,
    showTree: !isCompact,
    showStatusBar: !isCompact,
  };
}

/**
 * Hook to detect if a specific element would fit on screen
 */
export function useCanFit(requiredCols: number, requiredRows: number): boolean {
  const { dimensions } = useScreenSize();
  return dimensions.cols >= requiredCols && dimensions.rows >= requiredRows;
}
