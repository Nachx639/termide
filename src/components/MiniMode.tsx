import React, { useState } from "react";
import { quit } from "../lib/quit";
import { getTerminalManager } from "../lib/terminal/TerminalManager";
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
  // State (not a ref) so the panels re-render unfocused while the leader is
  // pending: otherwise the key after Ctrl+X ("1") was also typed into the shell.
  const [leader, setLeader] = useState(false);
  const leaderRef = React.useRef(false);
  leaderRef.current = leader;
  const switchTo = (key: string, shift: boolean): boolean => {
    if (key === "q" || key === "Q") quit();
    else if (key === "t" || key === "T") {
      getTerminalManager(rootPath).newTab();
      setActivePanel("terminal");
    } else if (key === "]" || key === "[") getTerminalManager(rootPath).cycle(key === "]" ? 1 : -1);
    else if (key === "1") setActivePanel("explorer");
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
      setLeader(false);
      switchTo(event.name, event.shift);
      return;
    }
    if (event.ctrl && !event.shift && event.name === "x") {
      leaderRef.current = true;
      setLeader(true);
      return;
    }
    // Ctrl+C quits from the explorer (in the terminal it interrupts the program).
    if (activePanel === "explorer" && event.ctrl && event.name === "c") {
      quit();
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
            focused={!leader}
            onFocus={() => setActivePanel("explorer")}
          />
        )}

        {activePanel === "viewer" && (
          <FileViewer
            filePath={selectedFile}
            focused={!leader}
            rootPath={rootPath}
            height={contentHeight}
          />
        )}

        {activePanel === "terminal" && (
          <Terminal
            cwd={rootPath}
            focused={!leader}
            onFocusRequest={() => setActivePanel("terminal")}
            height={contentHeight}
          />
        )}

        {activePanel === "agent" && (
          <AgentPanel
            rootPath={rootPath}
            focused={!leader}
            onFocus={() => setActivePanel("agent")}
          />
        )}
      </box>

      {/* Mini Status Bar */}
      <box style={{ height: 1, backgroundColor: "black", paddingX: 1, flexDirection: "row" }}>
        <text style={{ fg: "cyan" }}>
          {getMiniModePanelIcon(activePanel)} {activePanel.toUpperCase()}
        </text>
        <box style={{ flexGrow: 1, minWidth: 1 }} />
        <text wrapMode="none" style={{ fg: "gray", attributes: TextAttributes.DIM, flexShrink: 1 }}>
          {leader ? "1-3/Tab:panel T:term Q:quit" : activePanel === "explorer" ? "Tab/1-3:switch" : "Ctrl+X 1-3:switch"} │ Ctrl+Space:AI
        </text>
      </box>
    </box>
  );
}
