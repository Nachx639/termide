import React from "react";
import { useKeyboard } from "@opentui/react";

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
      { keys: "1 / 2 / 3", description: "Jump to Explorer / Editor / Terminal" },
      { keys: "Ctrl+P", description: "Quick open file (fuzzy finder)" },
      { keys: "Ctrl+Shift+P", description: "Open command palette" },
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
    title: "File Viewer",
    shortcuts: [
      { keys: "j / ↓", description: "Scroll down" },
      { keys: "k / ↑", description: "Scroll up" },
      { keys: "PageUp / PageDown", description: "Page scroll" },
      { keys: "g", description: "Go to start" },
      { keys: "G", description: "Go to end" },
      { keys: "Ctrl+F", description: "Find in file" },
      { keys: "Ctrl+G", description: "Go to line" },
      { keys: "Alt+Z", description: "Toggle word wrap" },
      { keys: "Alt+I", description: "Toggle indent guides" },
      { keys: "Alt+M", description: "Toggle minimap" },
      { keys: "Alt+P", description: "Toggle markdown preview" },
    ],
  },
  {
    title: "Terminal",
    shortcuts: [
      { keys: "Any key", description: "Type in terminal" },
      { keys: "Ctrl+C", description: "Interrupt command" },
      { keys: "Ctrl+D", description: "Send EOF" },
      { keys: "Ctrl+L", description: "Clear screen" },
    ],
  },
  {
    title: "Tabs",
    shortcuts: [
      { keys: "Ctrl+W", description: "Close current tab" },
      { keys: "Ctrl+Tab", description: "Next tab" },
      { keys: "Alt+1-9", description: "Jump to tab by number" },
    ],
  },
  {
    title: "Clipboard",
    shortcuts: [
      { keys: "Ctrl+Shift+C", description: "Copy panel content" },
      { keys: "Ctrl+Shift+V", description: "Paste to terminal" },
    ],
  },
  {
    title: "Application",
    shortcuts: [
      { keys: "F1", description: "Toggle this help panel" },
      { keys: "Ctrl+Q", description: "Quit application" },
    ],
  },
];

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape" || event.name === "f1" || event.name === "q") {
      onClose();
    }
  });

  if (!isOpen) return null;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bg: "black",
      }}
    >
    <box
      style={{
        position: "absolute",
        top: 2,
        left: 4,
        right: 4,
        bottom: 3,
        flexDirection: "column",
        border: true,
        borderColor: "cyan",
        bg: "black",
      }}
    >
      {/* Header */}
      <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray" }}>
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text style={{ fg: "cyan", bold: true }}>
            📖 Termide Keyboard Shortcuts
          </text>
          <text style={{ fg: "gray", dim: true }}>Press Esc or F1 to close</text>
        </box>
      </box>

      {/* Content */}
      <scrollbox style={{ flexDirection: "row", flexWrap: "wrap", flexGrow: 1, padding: 1, gap: 2 }}>
        {SHORTCUTS.map((category) => (
          <box
            key={category.title}
            style={{
              flexDirection: "column",
              width: 35,
              marginBottom: 1,
            }}
          >
            <text style={{ fg: "yellow", bold: true, marginBottom: 1 }}>
              {category.title}
            </text>
            {category.shortcuts.map((shortcut, idx) => (
              <box key={idx} style={{ flexDirection: "row" }}>
                <text style={{ fg: "cyan", width: 16 }}>{shortcut.keys}</text>
                <text style={{ fg: "white" }}>{shortcut.description}</text>
              </box>
            ))}
          </box>
        ))}
      </scrollbox>

      {/* Footer */}
      <box style={{ paddingX: 1, borderTop: true, borderColor: "gray" }}>
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text style={{ fg: "gray", dim: true }}>
            Termide v0.1.0 - Terminal IDE for AI Coding Agents
          </text>
          <text style={{ fg: "magenta" }}>Made with ♥</text>
        </box>
      </box>
    </box>
    </box>
  );
}
