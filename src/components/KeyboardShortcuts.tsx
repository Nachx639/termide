import React, { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { SHORTCUTS as HELP_SHORTCUTS } from "./HelpPanel";

interface ShortcutCategory {
  name: string;
  shortcuts: { keys: string; description: string }[];
}

// Same data as the help panel, so the two can never disagree (this overlay used
// to list shortcuts that did not exist, e.g. "Ctrl+X: cut line").
const SHORTCUTS: ShortcutCategory[] = HELP_SHORTCUTS.map((c) => ({ name: c.title, shortcuts: c.shortcuts }));

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
          backgroundColor: "#050505",
        }}
      >
        {/* Header */}
        <box
          style={{
            paddingX: 1,
            height: 1,
            backgroundColor: "#1a1a1a",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text style={{ fg: "cyan", attributes: TextAttributes.BOLD, bg: "#1a1a1a" }}>
            ⌨ Keyboard Shortcuts
          </text>
          <text style={{ fg: "gray", bg: "#1a1a1a" }}>Esc/q: close</text>
        </box>

        {/* Category selector: nine categories do not fit as tabs, so show the
            current one with its position (←/→ or Tab to move). */}
        <box
          style={{
            height: 2,
            flexShrink: 0,
            flexDirection: "row",
            paddingX: 1,
            border: ["bottom"],
            borderColor: "gray",
            justifyContent: "center",
          }}
        >
          <text wrapMode="none" style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>
            {`◀  ${selectedCategory + 1}/${SHORTCUTS.length}  ${category.name}  ▶`}
          </text>
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
              <text wrapMode="none" style={{ fg: "#d4a800", attributes: TextAttributes.BOLD, flexShrink: 0 }}>{shortcut.keys}</text>
              <text wrapMode="none" style={{ fg: "gray", flexShrink: 1 }}>{`  ${shortcut.description}`}</text>
            </box>
          ))}
        </box>

        {/* Footer */}
        <box
          style={{
            paddingX: 1,
            height: 2,
            flexShrink: 0,
            border: ["top"],
            borderColor: "gray",
            backgroundColor: "#0b0b0b",
          }}
        >
          <text style={{ fg: "gray", attributes: TextAttributes.DIM, bg: "#0b0b0b" }}>
            Tab/←/→: switch category | Esc: close
          </text>
        </box>
      </box>
    </box>
  );
}
