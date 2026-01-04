import React from "react";

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
          bg: "#0b0b0b",
        }}
      >
        <text style={{ fg: "cyan", bold: true }}>TERMIDE</text>
        <text style={{ fg: "gray", marginTop: 1 }}>Ctrl+P: Open</text>
        <text style={{ fg: "gray" }}>Ctrl+K: Commands</text>
      </box>
    );
  }

  return (
    <box
      style={{
        flexDirection: "column",
        height,
        paddingX: 2,
        paddingY: 1,
        bg: "#0b0b0b",
      }}
    >
      {/* Logo */}
      <box style={{ flexDirection: "column", alignItems: "center", marginBottom: 1 }}>
        <text style={{ fg: "cyan", bold: true }}>
          {`
  _____ _____ ____  __  __ ___ ____  _____
 |_   _| ____|  _ \\|  \\/  |_ _|  _ \\| ____|
   | | |  _| | |_) | |\\/| || || | | |  _|
   | | | |___|  _ <| |  | || || |_| | |___
   |_| |_____|_| \\_\\_|  |_|___|____/|_____|
`.trim()}
        </text>
      </box>

      <box style={{ height: 1 }} />

      {/* Project Info */}
      <box style={{ flexDirection: "row", justifyContent: "center" }}>
        <text style={{ fg: "white", bold: true }}>{projectName}</text>
      </box>

      <box style={{ height: 1 }} />

      {/* Quick Actions */}
      <box style={{ flexDirection: "column", paddingX: 2 }}>
        <text style={{ fg: "yellow", bold: true }}>Quick Start</text>
        <box style={{ height: 1 }} />

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+P</text>
          <text style={{ fg: "gray" }}> - Open file...</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+K</text>
          <text style={{ fg: "gray" }}> - Command palette</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+B</text>
          <text style={{ fg: "gray" }}> - Show help</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+`</text>
          <text style={{ fg: "gray" }}> - Focus terminal</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+Space</text>
          <text style={{ fg: "gray" }}> - Toggle AI agent</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>F12</text>
          <text style={{ fg: "gray" }}> - Go to definition</text>
        </box>

        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: "cyan", bold: true }}>Ctrl+\</text>
          <text style={{ fg: "gray" }}> - Toggle split view</text>
        </box>
      </box>

      <box style={{ height: 1 }} />

      {/* Recent Files */}
      {recentFiles.length > 0 && (
        <box style={{ flexDirection: "column", paddingX: 2, flexGrow: 1 }}>
          <text style={{ fg: "yellow", bold: true }}>Recent Files</text>
          <box style={{ height: 1 }} />

          {recentFiles.slice(0, 5).map((file, index) => (
            <box key={file} style={{ flexDirection: "row" }}>
              <text style={{ fg: "gray" }}>{index + 1}. </text>
              <text style={{ fg: "white" }}>{truncatePath(file)}</text>
            </box>
          ))}
        </box>
      )}

      {/* Footer */}
      <box style={{ flexDirection: "column", marginTop: 1, alignItems: "center" }}>
        <text style={{ fg: "gray", dim: true }}>
          Terminal IDE for the AI era
        </text>
        <text style={{ fg: "gray", dim: true }}>
          Built with OpenTUI
        </text>
      </box>
    </box>
  );
}
