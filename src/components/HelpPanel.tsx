import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Tab", description: "Switch to next panel" },
      { keys: "Shift+Tab", description: "Switch to previous panel" },
      { keys: "Ctrl+P", description: "Quick open file (fuzzy finder)" },
      { keys: "Ctrl+K", description: "Open command palette" },
      { keys: "Ctrl+G", description: "Go to line" },
      { keys: "Ctrl+Shift+O / @", description: "Go to symbol" },
    ],
  },
  {
    title: "File Explorer",
    shortcuts: [
      { keys: "j / ↓", description: "Move down" },
      { keys: "k / ↑", description: "Move up" },
      { keys: "Enter / l", description: "Open file or expand folder" },
      { keys: "h", description: "Collapse folder" },
    ],
  },
  {
    title: "Editor View",
    shortcuts: [
      { keys: "Ctrl+W", description: "Toggle word wrap" },
      { keys: "Ctrl+E", description: "Toggle minimap" },
      { keys: "Ctrl+N", description: "Toggle line numbers" },
      { keys: "Ctrl+R", description: "Toggle relative numbers" },
      { keys: "Ctrl+T", description: "Toggle sticky scroll" },
      { keys: "Ctrl+I", description: "Toggle git gutter" },
    ],
  },
  {
    title: "Editor Navigation",
    shortcuts: [
      { keys: "j / ↓", description: "Scroll down" },
      { keys: "k / ↑", description: "Scroll up" },
      { keys: "g", description: "Go to start" },
      { keys: "G", description: "Go to end" },
      { keys: "Ctrl+D", description: "Select word / next occurrence" },
      { keys: "z / Z", description: "Fold / Fold all" },
    ],
  },
  {
    title: "Selection & Copy (File Viewer)",
    shortcuts: [
      { keys: "V", description: "Start/toggle visual line selection" },
      { keys: "Shift+j/k", description: "Extend selection up/down" },
      { keys: "y", description: "Copy selected lines (yank)" },
      { keys: "Escape", description: "Clear selection" },
    ],
  },
  {
    title: "Copy Panel (Ctrl+X → V)",
    shortcuts: [
      { keys: "🖱️ drag", description: "Select with mouse" },
      { keys: "v / V", description: "Char mode / Line mode" },
      { keys: "hjkl", description: "Navigate & extend selection" },
      { keys: "w / b", description: "Jump word forward/back" },
      { keys: "0 / $", description: "Start/end of line" },
      { keys: "y", description: "Copy selection (yank)" },
    ],
  },
  {
    title: "Quick Copy (Global)",
    shortcuts: [
      { keys: "Ctrl+X → V", description: "Open Copy Panel" },
      { keys: "Ctrl+X → Y", description: "Copy all content" },
      { keys: "Ctrl+Y", description: "Copy all (quick)" },
      { keys: "Ctrl+Shift+V", description: "Paste to terminal" },
    ],
  },
  {
    title: "Terminal",
    shortcuts: [
      { keys: "Any key", description: "Type in terminal" },
      { keys: "Ctrl+C", description: "Interrupt command" },
      { keys: "Ctrl+L", description: "Clear screen" },
    ],
  },
  {
    title: "Application",
    shortcuts: [
      { keys: "Ctrl+Q", description: "Zen Mode (distraction-free)" },
      { keys: "Ctrl+B / ?", description: "Toggle this help panel" },
      { keys: "Ctrl+Space", description: "Toggle AI agent panel" },
    ],
  },
];

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  useKeyboard((event) => {
    if (!isOpen) return;

    if (
      event.name === "escape" ||
      event.name === "f1" ||
      event.name === "q" ||
      ((event.ctrl || event.meta) && event.shift && (event.name === "h" || event.name === "H")) ||
      (event.name === "?" && !event.ctrl && !event.meta)
    ) {
      onClose();
    }
  });

  if (!isOpen) return null;

  const dimensions = useTerminalDimensions();
  const width = dimensions.width || 80;
  const height = dimensions.height || 24;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width: "90%",
          height: "85%",
          flexDirection: "column",
          border: true,
          borderColor: "cyan",
          bg: "#050505",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Absolute Backdrop of spaces to force terminal opacity */}
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            bg: "#050505",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 100 }).map((_, i) => (
            <text key={i} style={{ bg: "#050505" }}>{" ".repeat(250)}</text>
          ))}
        </box>

        {/* Header */}
        <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray", bg: "#1a1a1a" }}>
          <box style={{ flexDirection: "row", justifyContent: "space-between", bg: "#1a1a1a" }}>
            <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>
              📖 Termide Keyboard Shortcuts
            </text>
            <text style={{ fg: "gray", dim: true, bg: "#1a1a1a" }}>Press Esc or F1 to close</text>
          </box>
        </box>

        {/* Content */}
        <scrollbox style={{ flexGrow: 1, bg: "#050505" }}>
          <box style={{ flexDirection: "row", flexWrap: "wrap", padding: 2, gap: 4, bg: "#050505" }}>
            {SHORTCUTS.map((category) => (
              <box
                key={category.title}
                style={{
                  flexDirection: "column",
                  width: 38,
                  marginBottom: 2,
                  bg: "#050505",
                }}
              >
                <box style={{ marginBottom: 1, borderBottom: true, borderColor: "blue", bg: "#050505" }}>
                  <text style={{ fg: "#d4a800", bold: true, bg: "#050505" }}>
                    {category.title.toUpperCase()}
                  </text>
                </box>
                {category.shortcuts.map((shortcut, idx) => (
                  <box key={idx} style={{ flexDirection: "row", marginBottom: 0, bg: "#050505" }}>
                    <text style={{ fg: "cyan", width: 14, bg: "#050505" }}>{shortcut.keys}</text>
                    <text style={{ fg: "white", bg: "#050505" }}>{shortcut.description}</text>
                  </box>
                ))}
              </box>
            ))}
            {/* Filler to ensure bottom padding and background solidity */}
            <box style={{ height: 10, width: "100%", bg: "#050505" }}>
              <text style={{ bg: "#050505" }}>{" ".repeat(200)}</text>
            </box>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, borderTop: true, borderColor: "gray", bg: "#0b0b0b" }}>
          <box style={{ flexDirection: "row", justifyContent: "space-between", bg: "#0b0b0b" }}>
            <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
              Termide v0.1.0 - Terminal IDE for AI Coding Agents
            </text>
            <text style={{ fg: "#d4a800", bg: "#0b0b0b" }}>Made with ♥</text>
          </box>
        </box>
      </box>
    </box>
  );
}
