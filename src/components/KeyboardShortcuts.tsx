import React, { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

interface ShortcutCategory {
  name: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    name: "Navigation",
    shortcuts: [
      { keys: "Tab", description: "Next panel" },
      { keys: "Shift+Tab", description: "Previous panel" },
      { keys: "j/k", description: "Move down/up" },
      { keys: "h/l", description: "Move left/right" },
      { keys: "g/G", description: "Go to start/end" },
      { keys: "PgUp/PgDn", description: "Page up/down" },
      { keys: "Ctrl+G", description: "Go to line" },
    ],
  },
  {
    name: "Files",
    shortcuts: [
      { keys: "Ctrl+P", description: "Quick open file" },
      { keys: "Ctrl+W", description: "Close current tab" },
      { keys: "Ctrl+Tab", description: "Next tab" },
      { keys: "Ctrl+\\", description: "Toggle split view" },
      { keys: "Alt+←/→", description: "Switch split" },
    ],
  },
  {
    name: "Search",
    shortcuts: [
      { keys: "Alt+F", description: "Find in file" },
      { keys: "Ctrl+H", description: "Find & Replace" },
      { keys: "Ctrl+Shift+F", description: "Global search" },
    ],
  },
  {
    name: "Editing",
    shortcuts: [
      { keys: "V", description: "Visual selection mode" },
      { keys: "Shift+↑/↓", description: "Extend selection" },
      { keys: "Ctrl+C/y", description: "Copy line(s)" },
      { keys: "Ctrl+X", description: "Cut line(s)" },
      { keys: "Ctrl+V/p", description: "Paste line(s)" },
      { keys: "Ctrl+D", description: "Duplicate line(s)" },
      { keys: "Ctrl+Shift+K", description: "Delete line(s)" },
    ],
  },
  {
    name: "Code",
    shortcuts: [
      { keys: "F12", description: "Go to definition" },
      { keys: "z", description: "Toggle fold" },
      { keys: "Z (Shift+z)", description: "Fold all" },
      { keys: "Alt+Z", description: "Unfold all" },
      { keys: "Ctrl+Shift+G", description: "Toggle git blame" },
    ],
  },
  {
    name: "View",
    shortcuts: [
      { keys: "Ctrl+F", description: "Toggle focus mode" },
      { keys: "Cmd+Z", description: "Toggle word wrap" },
      { keys: "Cmd+I", description: "Toggle indent guides" },
      { keys: "Cmd+M", description: "Toggle minimap" },
      { keys: "Ctrl+,", description: "Quick settings" },
    ],
  },
  {
    name: "Other",
    shortcuts: [
      { keys: "Ctrl+K", description: "Command palette" },
      { keys: "Ctrl+Shift+/", description: "This shortcuts help" },
      { keys: "Ctrl+B/?/F1", description: "Toggle help panel" },
      { keys: "Ctrl+Space", description: "Toggle AI agent" },
      { keys: "Ctrl+`", description: "Focus terminal" },
      { keys: "Ctrl+Q", description: "Quit" },
    ],
  },
];

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  const [selectedCategory, setSelectedCategory] = useState(0);
  const dimensions = useTerminalDimensions();

  const width = Math.min(70, (dimensions.width || 80) - 4);
  const height = Math.min(24, (dimensions.height || 30) - 4);

  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape" || event.name === "q") {
      onClose();
      return;
    }

    if (event.name === "left" || event.name === "h") {
      setSelectedCategory((i) => Math.max(0, i - 1));
    } else if (event.name === "right" || event.name === "l") {
      setSelectedCategory((i) => Math.min(SHORTCUTS.length - 1, i + 1));
    } else if (event.name === "tab" && !event.shift) {
      setSelectedCategory((i) => (i + 1) % SHORTCUTS.length);
    } else if (event.name === "tab" && event.shift) {
      setSelectedCategory((i) => (i - 1 + SHORTCUTS.length) % SHORTCUTS.length);
    }
  });

  if (!isOpen) return null;

  const category = SHORTCUTS[selectedCategory]!;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: dimensions.width || 80,
        height: dimensions.height || 30,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width,
          height,
          flexDirection: "column",
          border: true,
          borderColor: "cyan",
          bg: "#050505",
        }}
      >
        {/* Header */}
        <box
          style={{
            paddingX: 1,
            height: 1,
            bg: "#1a1a1a",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>
            ⌨ Keyboard Shortcuts
          </text>
          <text style={{ fg: "gray", bg: "#1a1a1a" }}>Esc/q: close</text>
        </box>

        {/* Category tabs */}
        <box
          style={{
            height: 1,
            flexDirection: "row",
            paddingX: 1,
            borderBottom: true,
            borderColor: "gray",
            gap: 1,
          }}
        >
          {SHORTCUTS.map((cat, index) => (
            <text
              key={cat.name}
              style={{
                fg: index === selectedCategory ? "cyan" : "gray",
                bold: index === selectedCategory,
                dim: index !== selectedCategory,
              }}
            >
              {cat.name}
            </text>
          ))}
        </box>

        {/* Shortcuts list */}
        <box style={{ flexGrow: 1, flexDirection: "column", paddingX: 2, paddingY: 1 }}>
          {category.shortcuts.map((shortcut, index) => (
            <box
              key={index}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingY: 0,
              }}
            >
              <text style={{ fg: "#d4a800", bold: true }}>{shortcut.keys}</text>
              <text style={{ fg: "gray" }}>{shortcut.description}</text>
            </box>
          ))}
        </box>

        {/* Footer */}
        <box
          style={{
            paddingX: 1,
            height: 1,
            borderTop: true,
            borderColor: "gray",
            bg: "#0b0b0b",
          }}
        >
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
            Tab/←/→: switch category | Esc: close
          </text>
        </box>
      </box>
    </box>
  );
}
