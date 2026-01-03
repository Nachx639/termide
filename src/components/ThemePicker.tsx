import React, { useState, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
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
          width: "60%",
          height: THEMES.length + 5,
          flexDirection: "column",
          border: true,
          borderColor: "yellow",
          bg: "#0b0b0b",
          position: "relative",
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
            bg: "#1a1a1a",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: THEMES.length + 5 }).map((_, i) => (
            <text key={i} style={{ bg: "#1a1a1a" }}>{" ".repeat(200)}</text>
          ))}
        </box>

        {/* Header */}
        <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray", bg: "#1a1a1a" }}>
          <text style={{ fg: "#d4a800", bold: true, bg: "#1a1a1a" }}>🎨 Select Theme</text>
        </box>

        {/* Theme list */}
        <scrollbox style={{ flexDirection: "column", flexGrow: 1, bg: "#1a1a1a" }}>
          {THEMES.map((theme, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = theme.id === currentTheme.id;

            return (
              <box
                key={theme.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  bg: isSelected ? theme.accent : "#1a1a1a" as any,
                  width: "100%",
                  paddingX: 1,
                }}
              >
                <box style={{ flexDirection: "row", bg: isSelected ? theme.accent : "#1a1a1a" as any }}>
                  <text style={{ fg: isSelected ? "black" : "gray", bg: isSelected ? theme.accent : "#1a1a1a" as any }}>
                    {isSelected ? "▸ " : "  "}
                  </text>
                  <text style={{ fg: isSelected ? "black" : "white", bg: isSelected ? theme.accent : "#1a1a1a" as any }}>
                    {theme.name}
                  </text>
                </box>
                <box style={{ flexDirection: "row", gap: 1, bg: isSelected ? theme.accent : "#1a1a1a" as any }}>
                  {/* Color preview */}
                  <text style={{ fg: theme.syntax.keyword as any, bg: isSelected ? theme.accent : "#1a1a1a" as any }}>●</text>
                  <text style={{ fg: theme.syntax.string as any, bg: isSelected ? theme.accent : "#1a1a1a" as any }}>●</text>
                  <text style={{ fg: theme.syntax.function as any, bg: isSelected ? theme.accent : "#1a1a1a" as any }}>●</text>
                  <text style={{ fg: theme.accent as any, bg: isSelected ? theme.accent : "#1a1a1a" as any }}>●</text>
                  {isCurrent && (
                    <text style={{ fg: isSelected ? "black" : "green", bg: isSelected ? theme.accent : "#1a1a1a" as any }}> ✓</text>
                  )}
                </box>
              </box>
            );
          })}
          {/* Filler to ensure background opacity */}
          <box style={{ flexGrow: 1, bg: "#1a1a1a" }}>
            <text style={{ bg: "#1a1a1a" }}> </text>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, borderTop: true, borderColor: "gray", bg: "#0b0b0b" }}>
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
            ↑↓ select | Enter apply | Esc cancel
          </text>
        </box>
      </box>
    </box>
  );
}
