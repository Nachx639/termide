import React, { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { THEMES, Theme } from "../lib/ThemeSystem";

interface ThemePickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onSelect: (theme: Theme) => void;
}

export function ThemePicker({ isOpen, onClose, currentTheme, onSelect }: ThemePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when opened
  useEffect(() => {
    if (isOpen) {
      const currentIndex = THEMES.findIndex((t) => t.id === currentTheme.id);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentTheme]);

  // Handle keyboard
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    if (event.name === "return") {
      onSelect(THEMES[selectedIndex]);
      onClose();
      return;
    }

    if (event.name === "up" || event.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (event.name === "down" || event.name === "j") {
      setSelectedIndex((i) => Math.min(THEMES.length - 1, i + 1));
      return;
    }
  });

  if (!isOpen) return null;

  return (
    <box
      style={{
        position: "absolute",
        top: 5,
        left: 15,
        right: 15,
        height: THEMES.length + 5,
        flexDirection: "column",
        border: true,
        borderColor: "magenta",
        bg: "black",
      }}
    >
      {/* Header */}
      <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray" }}>
        <text style={{ fg: "magenta", bold: true }}>🎨 Select Theme</text>
      </box>

      {/* Theme list */}
      <scrollbox style={{ flexDirection: "column", flexGrow: 1, paddingX: 1 }}>
        {THEMES.map((theme, index) => {
          const isSelected = index === selectedIndex;
          const isCurrent = theme.id === currentTheme.id;

          return (
            <box
              key={theme.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                bg: isSelected ? theme.accent : undefined,
              }}
            >
              <box style={{ flexDirection: "row" }}>
                <text style={{ fg: isSelected ? "black" : "gray" }}>
                  {isSelected ? "▸ " : "  "}
                </text>
                <text style={{ fg: isSelected ? "black" : "white" }}>
                  {theme.name}
                </text>
              </box>
              <box style={{ flexDirection: "row", gap: 1 }}>
                {/* Color preview */}
                <text style={{ fg: theme.syntax.keyword as any }}>●</text>
                <text style={{ fg: theme.syntax.string as any }}>●</text>
                <text style={{ fg: theme.syntax.function as any }}>●</text>
                <text style={{ fg: theme.accent as any }}>●</text>
                {isCurrent && (
                  <text style={{ fg: isSelected ? "black" : "green" }}> ✓</text>
                )}
              </box>
            </box>
          );
        })}
      </scrollbox>

      {/* Footer */}
      <box style={{ paddingX: 1, borderTop: true, borderColor: "gray" }}>
        <text style={{ fg: "gray", dim: true }}>
          ↑↓ select | Enter apply | Esc cancel
        </text>
      </box>
    </box>
  );
}
