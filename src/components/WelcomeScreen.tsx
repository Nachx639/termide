import React from "react";
import { TextAttributes } from "@opentui/core";

interface WelcomeScreenProps {
  height: number;
  onOpenFile: () => void;
  onOpenTerminal: () => void;
  onShowHelp: () => void;
  onShowCommandPalette: () => void;
  recentFiles: string[];
  onOpenRecentFile: (path: string) => void;
  rootPath: string;
  isCompact?: boolean;
}

export function WelcomeScreen({
  height,
  onOpenFile,
  onOpenTerminal,
  onShowHelp,
  onShowCommandPalette,
  recentFiles,
  onOpenRecentFile,
  rootPath,
  isCompact = false,
}: WelcomeScreenProps) {
  const projectName = rootPath.split("/").pop() || "Project";
  const truncatePath = (p: string) => {
    const relativePath = p.replace(rootPath + "/", "");
    return relativePath.length > 40 ? "..." + relativePath.slice(-37) : relativePath;
  };

  if (isCompact) {
    return (
      <box
        style={{
          flexDirection: "column",
          height,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0b0b0b",
        }}
      >
        <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>TERMIDE</text>
        <text style={{ fg: "gray", marginTop: 1 }}>Ctrl+P: Open</text>
        <text style={{ fg: "gray" }}>Ctrl+K: Commands</text>
      </box>
    );
  }

  // Everything must fit in `height`: Yoga shrinks rows that don't fit and they end
  // up painted on top of each other, so we budget lines and drop what doesn't fit.
  const shortcuts: [string, string][] = [
    ["Ctrl+P", "Open file..."],
    ["Ctrl+K", "Command palette"],
    ["Ctrl+B", "Show help"],
    ["Ctrl+Space", "Toggle AI agent"],
    ["Tab/Shift+Tab", "Navigate panels (Ctrl+X Tab from the terminal)"],
    ["Ctrl+Q", "Zen mode (full screen)"],
    ["Ctrl+\\", "Toggle split view"],
    ["Ctrl+Shift+G", "Go to definition"],
  ];
  const keyWidth = Math.max(...shortcuts.map(([k]) => k.length)) + 2;
  let budget = height - 2; // paddingY
  const take = (n: number) => (budget >= n ? ((budget -= n), true) : false);
  const showProject = take(2);
  const showQuickHeader = take(2);
  const shownShortcuts = shortcuts.slice(0, Math.max(0, Math.min(shortcuts.length, budget)));
  budget -= shownShortcuts.length;
  const showLogo = take(7);
  const recent = recentFiles.slice(0, Math.max(0, Math.min(5, budget - 3)));
  const showRecent = recent.length > 0 && take(recent.length + 3);
  const showFooter = take(2);
  const row = { flexDirection: "row" as const, flexShrink: 0, height: 1 };

  return (
    <box
      style={{
        flexDirection: "column",
        height,
        paddingX: 2,
        paddingY: 1,
        backgroundColor: "#0b0b0b",
        overflow: "hidden",
      }}
    >
      {showLogo && (
        <box style={{ flexDirection: "column", alignItems: "center", height: 5, flexShrink: 0, marginBottom: 2 }}>
          <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>
            {` _____ _____ ____  __  __ ___ ____  _____
|_   _| ____|  _ \\|  \\/  |_ _|  _ \\| ____|
  | | |  _| | |_) | |\\/| || || | | |  _|
  | | | |___|  _ <| |  | || || |_| | |___
  |_| |_____|_| \\_\\_|  |_|___|____/|_____|`}
          </text>
        </box>
      )}

      {showProject && (
        <box style={{ ...row, justifyContent: "center", marginBottom: 1 }}>
          <text style={{ fg: "white", attributes: TextAttributes.BOLD }}>{projectName}</text>
        </box>
      )}

      {showQuickHeader && (
        <box style={{ flexDirection: "column", paddingX: 2, flexShrink: 0 }}>
          <box style={{ ...row, marginBottom: 1 }}>
            <text style={{ fg: "yellow", attributes: TextAttributes.BOLD }}>Quick Start</text>
          </box>
          {shownShortcuts.map(([key, label]) => (
            <box key={key} style={row}>
              <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>{key.padEnd(keyWidth)}</text>
              <text style={{ fg: "gray" }}>{label}</text>
            </box>
          ))}
        </box>
      )}

      {showRecent && (
        <box style={{ flexDirection: "column", paddingX: 2, marginTop: 1, flexShrink: 0 }}>
          <box style={{ ...row, marginBottom: 1 }}>
            <text style={{ fg: "yellow", attributes: TextAttributes.BOLD }}>Recent Files</text>
          </box>
          {recent.map((file, index) => (
            <box key={file} style={row} onMouseDown={() => onOpenRecentFile(file)}>
              <text style={{ fg: "gray" }}>{index + 1}. </text>
              <text style={{ fg: "white" }}>{truncatePath(file)}</text>
            </box>
          ))}
        </box>
      )}

      {showFooter && (
        <box style={{ ...row, marginTop: 1, justifyContent: "center" }}>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>Terminal IDE for the AI era · Built with OpenTUI</text>
        </box>
      )}
    </box>
  );
}
