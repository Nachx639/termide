import React from "react";
import { useKeyboard } from "@opentui/react";
import * as path from "path";
import { getFileIconSimple } from "../lib/FileIcons";

interface Tab {
  filePath: string;
  isDirty?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabIndex: number;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  focused: boolean;
}

export function TabBar({ tabs, activeTabIndex, onSelectTab, onCloseTab, focused }: TabBarProps) {
  useKeyboard((event) => {
    if (!focused) return;

    // Ctrl+Tab - Next tab
    if (event.ctrl && event.name === "tab" && !event.shift) {
      const nextIndex = (activeTabIndex + 1) % tabs.length;
      onSelectTab(nextIndex);
      return;
    }

    // Ctrl+Shift+Tab - Previous tab
    if (event.ctrl && event.name === "tab" && event.shift) {
      const prevIndex = (activeTabIndex - 1 + tabs.length) % tabs.length;
      onSelectTab(prevIndex);
      return;
    }

    // Ctrl+W - Close current tab
    if (event.ctrl && event.name === "w") {
      if (tabs.length > 0) {
        onCloseTab(activeTabIndex);
      }
      return;
    }

    // Alt+1-9 - Jump to tab by number
    if (event.meta && event.name && /^[1-9]$/.test(event.name)) {
      const tabIndex = parseInt(event.name) - 1;
      if (tabIndex < tabs.length) {
        onSelectTab(tabIndex);
      }
      return;
    }
  });

  if (tabs.length === 0) {
    return null;
  }

  return (
    <box style={{ flexDirection: "row", bg: "#111111", height: 1 }}>
      {tabs.map((tab, index) => {
        const isActive = index === activeTabIndex;
        const fileName = path.basename(tab.filePath);
        const icon = getFileIconSimple(fileName);

        return (
          <box
            key={tab.filePath}
            style={{
              flexDirection: "row",
              paddingX: 1,
              bg: isActive ? "#1a2a35" : undefined,
              borderRight: true,
              borderColor: "#333333",
            }}
            onMouseDown={() => onSelectTab(index)}
          >
            {/* File icon */}
            <text style={{ fg: isActive ? "cyan" : (icon.color as any) }}>
              {icon.icon}{" "}
            </text>
            {/* File name */}
            <text
              style={{
                fg: isActive ? "cyan" : "#888888",
                bold: isActive,
              }}
            >
              {fileName}
            </text>
            {/* Dirty indicator */}
            {tab.isDirty && (
              <text style={{ fg: isActive ? "cyan" : "yellow" }}> ●</text>
            )}
            {/* Close button - clickable */}
            <text
              style={{ fg: isActive ? "cyan" : "#444444", dim: !isActive }}
              onMouseDown={(e: any) => {
                e.stopPropagation?.();
                onCloseTab(index);
              }}
            >
              {" "}×
            </text>
          </box>
        );
      })}
      {/* Tab hint */}
      <box style={{ flexGrow: 1, justifyContent: "flex-end", bg: "#111111" }}>
        <text style={{ fg: "gray", dim: true, paddingX: 1 }}>
          Click to switch | Ctrl+W close
        </text>
      </box>
    </box>
  );
}
