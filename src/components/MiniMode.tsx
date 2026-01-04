import React, { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { Terminal } from "./Terminal";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { AgentPanel } from "./AgentPanel";
import type { MiniModePanel } from "../lib/ResponsiveLayout";
import { getMiniModePanelIcon } from "../lib/ResponsiveLayout";

interface MiniModeProps {
  rootPath: string;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
  showAgent: boolean;
  onToggleAgent: () => void;
}

export function MiniMode({
  rootPath,
  selectedFile,
  onFileSelect,
  showAgent,
  onToggleAgent
}: MiniModeProps) {
  const [activePanel, setActivePanel] = useState<MiniModePanel>("terminal");
  const dimensions = useTerminalDimensions();
  const width = dimensions.width || 50;
  const height = dimensions.height || 15;

  // Available panels based on context
  const panels: MiniModePanel[] = showAgent
    ? ["explorer", "viewer", "agent"]
    : ["explorer", "viewer", "terminal"];

  // Handle keyboard navigation
  useKeyboard((event) => {
    // Number keys to switch panels (1-4)
    if (event.name === "1") {
      setActivePanel("explorer");
      return;
    }
    if (event.name === "2") {
      setActivePanel("viewer");
      return;
    }
    if (event.name === "3") {
      setActivePanel(showAgent ? "agent" : "terminal");
      return;
    }

    // Tab to cycle panels
    if (event.name === "tab" && !event.shift && !event.ctrl) {
      const currentIndex = panels.indexOf(activePanel);
      const nextIndex = (currentIndex + 1) % panels.length;
      setActivePanel(panels[nextIndex]!);
      return;
    }

    // Shift+Tab to cycle backwards
    if (event.name === "tab" && event.shift) {
      const currentIndex = panels.indexOf(activePanel);
      const prevIndex = (currentIndex - 1 + panels.length) % panels.length;
      setActivePanel(panels[prevIndex]!);
      return;
    }

    // Ctrl+Space to toggle agent
    if (event.ctrl && (event.name === "space" || event.name === " ")) {
      onToggleAgent();
      if (!showAgent) {
        setActivePanel("agent");
      }
      return;
    }
  });

  // Calculate content height (total - status bar)
  const contentHeight = height - 2; // 1 for panel bar, 1 for status

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", bg: "#050505" }}>
      {/* Panel Switcher Bar */}
      <box style={{ height: 1, flexDirection: "row", bg: "#1a1a1a", paddingX: 1 }}>
        {panels.map((panel, index) => {
          const isActive = activePanel === panel;
          return (
            <box
              key={panel}
              style={{
                flexDirection: "row",
                marginRight: 1,
                bg: isActive ? "cyan" : "#1a1a1a"
              }}
              onMouseDown={() => setActivePanel(panel)}
            >
              <text style={{
                fg: isActive ? "black" : "gray",
                bg: isActive ? "cyan" : "#1a1a1a",
                bold: isActive
              }}>
                {` ${index + 1}:${getMiniModePanelIcon(panel)} `}
              </text>
            </box>
          );
        })}
        <box style={{ flexGrow: 1 }} />
        <text style={{ fg: "cyan", bg: "#1a1a1a" }}>TERMIDE</text>
      </box>

      {/* Active Panel Content */}
      <box style={{ flexGrow: 1, height: contentHeight }}>
        {activePanel === "explorer" && (
          <FileTree
            rootPath={rootPath}
            onFileSelect={(path) => {
              onFileSelect(path);
              setActivePanel("viewer");
            }}
            focused={true}
            onFocus={() => setActivePanel("explorer")}
          />
        )}

        {activePanel === "viewer" && (
          <FileViewer
            filePath={selectedFile}
            focused={true}
            rootPath={rootPath}
            height={contentHeight}
          />
        )}

        {activePanel === "terminal" && (
          <Terminal
            cwd={rootPath}
            focused={true}
            onFocusRequest={() => setActivePanel("terminal")}
            height={contentHeight}
          />
        )}

        {activePanel === "agent" && (
          <AgentPanel
            rootPath={rootPath}
            focused={true}
            onFocus={() => setActivePanel("agent")}
          />
        )}
      </box>

      {/* Mini Status Bar */}
      <box style={{ height: 1, bg: "black", paddingX: 1, flexDirection: "row" }}>
        <text style={{ fg: "cyan" }}>
          {getMiniModePanelIcon(activePanel)} {activePanel.toUpperCase()}
        </text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ fg: "gray", dim: true }}>
          Tab:switch │ Ctrl+Space:AI
        </text>
      </box>
    </box>
  );
}
