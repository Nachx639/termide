import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";

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

/** The single source of truth for shortcut help (also used by KeyboardShortcuts). */
export const SHORTCUTS: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Tab", description: "Switch to next panel" },
      { keys: "Shift+Tab", description: "Switch to previous panel" },
      { keys: "Ctrl+P", description: "Quick open file (fuzzy finder)" },
      { keys: "Ctrl+K", description: "Open command palette" },
      { keys: "Ctrl+Shift+F", description: "Search in all files" },
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
    title: "Editor (type to edit, autosaves)",
    shortcuts: [
      { keys: "Ctrl+F", description: "Find in file (Enter / Shift+Enter)" },
      { keys: "Ctrl+D", description: "Highlight word under cursor" },
      { keys: "Ctrl+G", description: "Toggle inline git blame" },
      { keys: "F12", description: "Go to definition" },
      { keys: "Ctrl+Shift+O", description: "Go to symbol" },
      { keys: "Ctrl+S", description: "Save now" },
      { keys: "Ctrl+R", description: "Load disk version (on conflict)" },
      { keys: "Ctrl+W", description: "Close tab" },
      { keys: "Ctrl+X → F", description: "Maximize / restore panel" },
    ],
  },
  {
    title: "Copy Panel (Ctrl+X → V)",
    shortcuts: [
      { keys: "Mouse drag", description: "Select with mouse" },
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
      { keys: "Mouse drag", description: "Select text with mouse" },
      { keys: "Ctrl+Y", description: "Copy selection to clipboard" },
      { keys: "Ctrl+X → V", description: "Open Copy Panel" },
    ],
  },
  {
    title: "Terminal (every key goes to the shell)",
    shortcuts: [
      { keys: "Ctrl+X → Tab", description: "Leave the terminal (next panel)" },
      { keys: "Ctrl+X → K / P", description: "Command palette / open file" },
      { keys: "Ctrl+X → X", description: "Send a literal Ctrl+X" },
      { keys: "Shift+PgUp/PgDn", description: "Scroll back through output" },
      { keys: "Shift+↑/↓, wheel", description: "Scroll line by line" },
      { keys: "Ctrl+X → /", description: "Search the output (Enter: older)" },
      { keys: "Double-click path", description: "Open file:line from the output" },
      { keys: "Drag", description: "Select and copy output" },
      { keys: "Ctrl+X → T / ] / [", description: "New tab / next / previous" },
      { keys: "Shift+Enter", description: "Newline without submit (Claude Code)" },
      { keys: "Enter (after exit)", description: "Restart the shell" },
    ],
  },
  {
    title: "AI Agent Panel",
    shortcuts: [
      { keys: "Enter", description: "Send prompt" },
      { keys: "Esc", description: "Stop the running turn" },
      { keys: "Esc Esc", description: "Disconnect agent" },
      { keys: "←/→ Enter, 1-9", description: "Answer a permission request" },
      { keys: "Ctrl+T", description: "Show / hide agent thoughts" },
    ],
  },
  {
    title: "Application",
    shortcuts: [
      { keys: "Ctrl+Q", description: "Zen Mode (distraction-free)" },
      { keys: "F1 / Ctrl+B / ?", description: "Toggle this help panel" },
      { keys: "Ctrl+Space", description: "Toggle AI agent panel" },
      { keys: "Ctrl+C", description: "Exit (when the terminal is not focused)" },
      { keys: "Ctrl+X → Q", description: "Exit from anywhere" },
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
          backgroundColor: "#050505",
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
            backgroundColor: "#050505",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 100 }).map((_, i) => (
            <text key={i} style={{ bg: "#050505" }}>{" ".repeat(250)}</text>
          ))}
        </box>

        {/* Header */}
        <box style={{ paddingX: 1, border: ["bottom"], borderColor: "gray", backgroundColor: "#1a1a1a" }}>
          <box style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1a1a1a" }}>
            <text style={{ fg: "cyan", attributes: TextAttributes.BOLD, bg: "#1a1a1a" }}>
              📖 Termide Keyboard Shortcuts
            </text>
            <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#1a1a1a" }}>Press Esc or F1 to close</text>
          </box>
        </box>

        {/* Content */}
        <scrollbox style={{ flexGrow: 1, backgroundColor: "#050505" }}>
          <box style={{ flexDirection: "row", flexWrap: "wrap", padding: 2, gap: 4, backgroundColor: "#050505" }}>
            {SHORTCUTS.map((category) => (
              <box
                key={category.title}
                style={{
                  flexDirection: "column",
                  width: 38,
                  marginBottom: 2,
                  backgroundColor: "#050505",
                }}
              >
                <box style={{ marginBottom: 1, border: ["bottom"], borderColor: "blue", backgroundColor: "#050505" }}>
                  <text style={{ fg: "#d4a800", attributes: TextAttributes.BOLD, bg: "#050505" }}>
                    {category.title.toUpperCase()}
                  </text>
                </box>
                {category.shortcuts.map((shortcut, idx) => (
                  <box key={idx} style={{ flexDirection: "row", marginBottom: 0, backgroundColor: "#050505" }}>
                    <text style={{ fg: "cyan", width: 14, bg: "#050505" }}>{shortcut.keys}</text>
                    <text style={{ fg: "white", bg: "#050505" }}>{shortcut.description}</text>
                  </box>
                ))}
              </box>
            ))}
            {/* Filler to ensure bottom padding and background solidity */}
            <box style={{ height: 10, width: "100%", backgroundColor: "#050505" }}>
              <text style={{ bg: "#050505" }}>{" ".repeat(200)}</text>
            </box>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, border: ["top"], borderColor: "gray", backgroundColor: "#0b0b0b" }}>
          <box style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#0b0b0b" }}>
            <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#0b0b0b" }}>
              Termide v0.1.0 - Terminal IDE for AI Coding Agents
            </text>
            <text style={{ fg: "#d4a800", bg: "#0b0b0b" }}>Made with ♥</text>
          </box>
        </box>
      </box>
    </box>
  );
}
