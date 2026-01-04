import React from "react";

interface CompactHeaderProps {
  rootPath: string;
  width: number;
}

export function CompactHeader({ rootPath, width }: CompactHeaderProps) {
  const pathText = rootPath.replace(process.env.HOME || "", "~");

  // Truncate path if needed
  const maxPathLength = Math.max(10, width - 15);
  const displayPath = pathText.length > maxPathLength
    ? "..." + pathText.slice(-maxPathLength + 3)
    : pathText;

  return (
    <box style={{ height: 2, flexDirection: "column", borderBottom: true, borderColor: "cyan", bg: "#0b0b0b" }}>
      {/* Row 1: Logo + Path */}
      <box style={{ paddingX: 1, flexDirection: "row", bg: "#1a1a1a", justifyContent: "space-between" }}>
        <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>TERMIDE</text>
        <text style={{ fg: "gray", bg: "#1a1a1a" }}>{displayPath}</text>
      </box>
      {/* Row 2: Quick help */}
      <box style={{ paddingX: 1, bg: "#1a1a1a" }}>
        <text style={{ fg: "#d4a800", bg: "#1a1a1a", dim: true }}>
          Ctrl+P:open │ Ctrl+K:cmd │ Ctrl+B:help
        </text>
      </box>
    </box>
  );
}
