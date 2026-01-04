import React, { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { THEMES } from "../lib/ThemeSystem";
import type { Theme } from "../lib/ThemeSystem";

export interface QuickSettingsState {
  wordWrap: boolean;
  indentGuides: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  fontSize: "small" | "normal" | "large";
  tabSize: number;
  autoSave: boolean;
  theme: Theme;
}

interface QuickSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: QuickSettingsState;
  onSettingsChange: (settings: Partial<QuickSettingsState>) => void;
}

interface SettingItem {
  key: keyof QuickSettingsState;
  label: string;
  type: "toggle" | "select" | "number";
  options?: string[];
}

const SETTINGS_LIST: SettingItem[] = [
  { key: "wordWrap", label: "Word Wrap", type: "toggle" },
  { key: "indentGuides", label: "Indent Guides", type: "toggle" },
  { key: "minimap", label: "Minimap", type: "toggle" },
  { key: "lineNumbers", label: "Line Numbers", type: "toggle" },
  { key: "autoSave", label: "Auto Save", type: "toggle" },
  { key: "tabSize", label: "Tab Size", type: "number" },
  { key: "fontSize", label: "Font Size", type: "select", options: ["small", "normal", "large"] },
];

export function QuickSettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: QuickSettingsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingTheme, setEditingTheme] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);
  const dimensions = useTerminalDimensions();

  const width = Math.min(45, (dimensions.width || 80) - 4);
  const height = Math.min(16, (dimensions.height || 30) - 6);

  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      if (editingTheme) {
        setEditingTheme(false);
      } else {
        onClose();
      }
      return;
    }

    if (editingTheme) {
      if (event.name === "up" || event.name === "k") {
        setThemeIndex((i) => Math.max(0, i - 1));
      } else if (event.name === "down" || event.name === "j") {
        setThemeIndex((i) => Math.min(THEMES.length - 1, i + 1));
      } else if (event.name === "return") {
        onSettingsChange({ theme: THEMES[themeIndex]! });
        setEditingTheme(false);
      }
      return;
    }

    if (event.name === "up" || event.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (event.name === "down" || event.name === "j") {
      setSelectedIndex((i) => Math.min(SETTINGS_LIST.length, i + 1)); // +1 for theme row
    } else if (event.name === "return" || event.name === "space" || event.name === " ") {
      // Theme selector
      if (selectedIndex === SETTINGS_LIST.length) {
        setEditingTheme(true);
        const currentThemeIndex = THEMES.findIndex((t) => t.name === settings.theme.name);
        setThemeIndex(currentThemeIndex >= 0 ? currentThemeIndex : 0);
        return;
      }

      const setting = SETTINGS_LIST[selectedIndex];
      if (!setting) return;

      if (setting.type === "toggle") {
        onSettingsChange({ [setting.key]: !settings[setting.key] });
      } else if (setting.type === "number") {
        // Cycle tab sizes: 2 -> 4 -> 8 -> 2
        const current = settings[setting.key] as number;
        const next = current === 2 ? 4 : current === 4 ? 8 : 2;
        onSettingsChange({ [setting.key]: next });
      } else if (setting.type === "select" && setting.options) {
        const current = settings[setting.key] as string;
        const currentIdx = setting.options.indexOf(current);
        const nextIdx = (currentIdx + 1) % setting.options.length;
        onSettingsChange({ [setting.key]: setting.options[nextIdx] });
      }
    } else if (event.name === "left" || event.name === "h") {
      const setting = SETTINGS_LIST[selectedIndex];
      if (setting?.type === "number") {
        const current = settings[setting.key] as number;
        const next = Math.max(2, current === 8 ? 4 : current === 4 ? 2 : 2);
        onSettingsChange({ [setting.key]: next });
      }
    } else if (event.name === "right" || event.name === "l") {
      const setting = SETTINGS_LIST[selectedIndex];
      if (setting?.type === "number") {
        const current = settings[setting.key] as number;
        const next = Math.min(8, current === 2 ? 4 : current === 4 ? 8 : 8);
        onSettingsChange({ [setting.key]: next });
      }
    }
  });

  if (!isOpen) return null;

  const renderSettingValue = (setting: SettingItem) => {
    const value = settings[setting.key];

    if (setting.type === "toggle") {
      return (
        <text style={{ fg: value ? "green" : "red", bold: true }}>
          {value ? "ON" : "OFF"}
        </text>
      );
    }

    if (setting.type === "number") {
      return <text style={{ fg: "cyan" }}>{String(value)}</text>;
    }

    if (setting.type === "select") {
      return <text style={{ fg: "cyan" }}>{String(value)}</text>;
    }

    return null;
  };

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
            Quick Settings
          </text>
          <text style={{ fg: "gray", bg: "#1a1a1a" }}>Esc: close</text>
        </box>

        {/* Settings List or Theme Picker */}
        {editingTheme ? (
          <box style={{ flexGrow: 1, flexDirection: "column", paddingX: 1 }}>
            <text style={{ fg: "yellow", marginBottom: 1 }}>Select Theme:</text>
            <scrollbox style={{ flexGrow: 1 }}>
              {THEMES.map((theme, index) => {
                const isSelected = index === themeIndex;
                return (
                  <box
                    key={theme.name}
                    style={{
                      flexDirection: "row",
                      bg: isSelected ? "blue" : undefined,
                      paddingX: 1,
                    }}
                  >
                    <text
                      style={{
                        fg: isSelected ? "white" : "gray",
                        bold: isSelected,
                      }}
                    >
                      {isSelected ? ">" : " "} {theme.name}
                    </text>
                  </box>
                );
              })}
            </scrollbox>
          </box>
        ) : (
          <box style={{ flexGrow: 1, flexDirection: "column", paddingX: 1, paddingY: 1 }}>
            {SETTINGS_LIST.map((setting, index) => {
              const isSelected = index === selectedIndex;
              return (
                <box
                  key={setting.key}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    bg: isSelected ? "blue" : undefined,
                    paddingX: 1,
                  }}
                >
                  <text
                    style={{
                      fg: isSelected ? "white" : "gray",
                      bold: isSelected,
                    }}
                  >
                    {setting.label}
                  </text>
                  <box style={{ bg: isSelected ? "blue" : undefined }}>
                    {renderSettingValue(setting)}
                  </box>
                </box>
              );
            })}

            {/* Theme Row */}
            <box
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                bg: selectedIndex === SETTINGS_LIST.length ? "blue" : undefined,
                paddingX: 1,
                marginTop: 1,
              }}
            >
              <text
                style={{
                  fg: selectedIndex === SETTINGS_LIST.length ? "white" : "gray",
                  bold: selectedIndex === SETTINGS_LIST.length,
                }}
              >
                Theme
              </text>
              <text style={{ fg: "cyan" }}>{settings.theme.name}</text>
            </box>
          </box>
        )}

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
            {editingTheme
              ? "j/k: navigate | Enter: select"
              : "j/k: navigate | Enter/Space: toggle"}
          </text>
        </box>
      </box>
    </box>
  );
}
