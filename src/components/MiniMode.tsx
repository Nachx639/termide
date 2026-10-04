import React, { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
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

  // Panel switching. In the explorer, 1/2/3 and Tab switch directly; in the
  // terminal, editor and agent those keys are typed text (they used to switch
  // panels mid-command), so there it is Ctrl+X then 1/2/3/Tab.
  const leaderRef = React.useRef(false);
  const switchTo = (key: string, shift: boolean): boolean => {
    if (key === "1") setActivePanel("explorer");
    else if (key === "2") setActivePanel("viewer");
    else if (key === "3") setActivePanel(showAgent ? "agent" : "terminal");
    else if (key === "tab") {
      const i = panels.indexOf(activePanel);
      setActivePanel(panels[(i + (shift ? panels.length - 1 : 1)) % panels.length]!);
    } else return false;
    return true;
  };

  useKeyboard((event) => {
    if (event.eventType === "release") return;
    if (leaderRef.current) {
      leaderRef.current = false;
      switchTo(event.name, event.shift);
      return;
    }
    if (event.ctrl && !event.shift && event.name === "x") {
      leaderRef.current = true;
      return;
    }
    if (activePanel === "explorer" && !event.ctrl && !event.meta && switchTo(event.name, event.shift)) return;

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
    <box style={{ flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#050505" }}>
      {/* Panel Switcher Bar */}
      <box style={{ height: 1, flexDirection: "row", backgroundColor: "#1a1a1a", paddingX: 1 }}>
        {panels.map((panel, index) => {
          const isActive = activePanel === panel;
          return (
            <box
              key={panel}
              style={{
                flexDirection: "row",
                marginRight: 1,
                backgroundColor: isActive ? "cyan" : "#1a1a1a"
              }}
              onMouseDown={() => setActivePanel(panel)}
            >
              <text style={{
                fg: isActive ? "black" : "gray",
                bg: isActive ? "cyan" : "#1a1a1a",
                attributes: isActive ? TextAttributes.BOLD : 0
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
      <box style={{ height: 1, backgroundColor: "black", paddingX: 1, flexDirection: "row" }}>
        <text style={{ fg: "cyan" }}>
          {getMiniModePanelIcon(activePanel)} {activePanel.toUpperCase()}
        </text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>
          {activePanel === "explorer" ? "Tab/1-3:switch" : "Ctrl+X 1-3:switch"} │ Ctrl+Space:AI
        </text>
      </box>
    </box>
  );
}
