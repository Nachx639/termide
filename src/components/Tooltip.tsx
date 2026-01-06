import React, { useState } from "react";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** Content to show in tooltip */
  content: string;
  /** Element that triggers the tooltip */
  children: React.ReactNode;
  /** Tooltip position */
  position?: TooltipPosition;
  /** Whether tooltip is visible (controlled mode) */
  visible?: boolean;
  /** Tooltip background color */
  bg?: string;
  /** Tooltip text color */
  fg?: string;
}

/**
 * Simple tooltip component for terminal UI.
 * Shows text hint near the wrapped element.
 *
 * @example
 * ```tsx
 * <Tooltip content="Press to save">
 *   <text>Save</text>
 * </Tooltip>
 * ```
 */
export function Tooltip({
  content,
  children,
  position = "top",
  visible = true,
  bg = "#333333",
  fg = "white",
}: TooltipProps) {
  if (!visible) {
    return <>{children}</>;
  }

  const tooltipElement = (
    <box
      style={{
        bg: bg as React.CSSProperties["color"],
        paddingX: 1,
        borderStyle: "round",
        borderColor: "gray",
      }}
    >
      <text style={{ fg: fg as React.CSSProperties["color"] }}>{content}</text>
    </box>
  );

  // Position tooltip relative to children
  if (position === "top") {
    return (
      <box style={{ flexDirection: "column", alignItems: "center" }}>
        {tooltipElement}
        {children}
      </box>
    );
  }

  if (position === "bottom") {
    return (
      <box style={{ flexDirection: "column", alignItems: "center" }}>
        {children}
        {tooltipElement}
      </box>
    );
  }

  if (position === "left") {
    return (
      <box style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
        {tooltipElement}
        {children}
      </box>
    );
  }

  // right
  return (
    <box style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
      {children}
      {tooltipElement}
    </box>
  );
}

interface HintTextProps {
  /** Main text */
  children: React.ReactNode;
  /** Hint text shown in parentheses */
  hint: string;
  /** Whether hint is dimmed */
  dimHint?: boolean;
  /** Color for main text */
  fg?: string;
  /** Color for hint */
  hintFg?: string;
}

/**
 * Text with inline hint.
 *
 * @example
 * ```tsx
 * <HintText hint="Ctrl+S">Save</HintText>
 * // Renders: Save (Ctrl+S)
 * ```
 */
export function HintText({
  children,
  hint,
  dimHint = true,
  fg = "white",
  hintFg = "gray",
}: HintTextProps) {
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text style={{ fg: fg as React.CSSProperties["color"] }}>{children}</text>
      <text style={{ fg: hintFg as React.CSSProperties["color"], dim: dimHint }}>
        ({hint})
      </text>
    </box>
  );
}

interface ShortcutHintProps {
  /** Action description */
  action: string;
  /** Keyboard shortcut */
  shortcut: string;
  /** Separator between action and shortcut */
  separator?: string;
  /** Action text color */
  actionFg?: string;
  /** Shortcut text color */
  shortcutFg?: string;
}

/**
 * Display action with keyboard shortcut.
 *
 * @example
 * ```tsx
 * <ShortcutHint action="Open file" shortcut="Ctrl+P" />
 * // Renders: Open file  Ctrl+P
 * ```
 */
export function ShortcutHint({
  action,
  shortcut,
  separator = "  ",
  actionFg = "gray",
  shortcutFg = "cyan",
}: ShortcutHintProps) {
  return (
    <box style={{ flexDirection: "row" }}>
      <text style={{ fg: actionFg as React.CSSProperties["color"] }}>{action}</text>
      <text>{separator}</text>
      <text style={{ fg: shortcutFg as React.CSSProperties["color"], bold: true }}>
        {shortcut}
      </text>
    </box>
  );
}

interface InfoBoxProps {
  /** Title of the info box */
  title?: string;
  /** Content */
  children: React.ReactNode;
  /** Box variant */
  variant?: "info" | "warning" | "error" | "success";
  /** Whether to show border */
  bordered?: boolean;
}

const INFO_BOX_COLORS = {
  info: { border: "cyan", title: "cyan", icon: "ℹ" },
  warning: { border: "yellow", title: "yellow", icon: "⚠" },
  error: { border: "red", title: "red", icon: "✕" },
  success: { border: "green", title: "green", icon: "✓" },
};

/**
 * Information box for displaying contextual messages.
 *
 * @example
 * ```tsx
 * <InfoBox title="Note" variant="info">
 *   This is helpful information.
 * </InfoBox>
 * ```
 */
export function InfoBox({
  title,
  children,
  variant = "info",
  bordered = true,
}: InfoBoxProps) {
  const colors = INFO_BOX_COLORS[variant];

  return (
    <box
      style={{
        flexDirection: "column",
        borderStyle: bordered ? "round" : undefined,
        borderColor: bordered ? (colors.border as React.CSSProperties["color"]) : undefined,
        padding: 1,
      }}
    >
      {title && (
        <box style={{ flexDirection: "row", gap: 1, marginBottom: 1 }}>
          <text style={{ fg: colors.title as React.CSSProperties["color"] }}>
            {colors.icon}
          </text>
          <text style={{ fg: colors.title as React.CSSProperties["color"], bold: true }}>
            {title}
          </text>
        </box>
      )}
      <box>{children}</box>
    </box>
  );
}
