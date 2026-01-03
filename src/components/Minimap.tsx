import React, { useMemo } from "react";

interface MinimapProps {
  content: string[];
  scrollOffset: number;
  viewHeight: number;
  cursorLine: number;
  height: number;
  width?: number;
  onLineClick?: (line: number) => void;
}

// Create a compressed representation of a line for the minimap
function compressLine(line: string, maxWidth: number): string {
  if (line.length === 0) return "";

  // Calculate density based on line content
  const density = Math.min(line.replace(/\s/g, "").length / line.length, 1);

  // Use block characters to represent code density
  const blocks = Math.ceil(Math.min(line.length, maxWidth) / 2);
  let result = "";

  for (let i = 0; i < blocks; i++) {
    const startIdx = i * 2;
    const segment = line.slice(startIdx, startIdx + 2);
    const hasContent = segment.replace(/\s/g, "").length > 0;

    if (hasContent) {
      result += "▪";
    } else {
      result += " ";
    }
  }

  return result;
}

// Get a color hint based on line content
function getLineColor(line: string): string {
  const trimmed = line.trim();

  // Comments
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
    return "gray";
  }

  // Keywords
  if (/^(import|export|const|let|var|function|class|interface|type|if|else|for|while|return|async|await)\b/.test(trimmed)) {
    return "#d4a800";
  }

  // Strings
  if (/["'`]/.test(trimmed)) {
    return "green";
  }

  return "white";
}

export function Minimap({
  content,
  scrollOffset,
  viewHeight,
  cursorLine,
  height,
  width = 8,
  onLineClick,
}: MinimapProps) {
  // Calculate which portion of the file to show in the minimap
  const minimapData = useMemo(() => {
    const totalLines = content.length;
    const linesPerMinimapRow = Math.max(1, Math.ceil(totalLines / height));

    const rows: { text: string; color: string; originalLine: number }[] = [];

    for (let i = 0; i < height && i * linesPerMinimapRow < totalLines; i++) {
      const lineIdx = i * linesPerMinimapRow;
      const line = content[lineIdx] || "";
      rows.push({
        text: compressLine(line, width),
        color: getLineColor(line),
        originalLine: lineIdx,
      });
    }

    return rows;
  }, [content, height, width]);

  // Calculate visible region indicator
  const totalLines = content.length;
  const linesPerMinimapRow = Math.max(1, Math.ceil(totalLines / height));
  const visibleStartRow = Math.floor(scrollOffset / linesPerMinimapRow);
  const visibleEndRow = Math.min(height - 1, Math.floor((scrollOffset + viewHeight) / linesPerMinimapRow));
  const cursorRow = Math.floor(cursorLine / linesPerMinimapRow);

  return (
    <box
      style={{
        flexDirection: "column",
        width: width + 1,
        borderLeft: true,
        borderColor: "gray",
        bg: "black",
      }}
    >
      {minimapData.map((row, idx) => {
        const isInViewport = idx >= visibleStartRow && idx <= visibleEndRow;
        const isCursor = idx === cursorRow;

        return (
          <box key={idx} style={{ flexDirection: "row" }}>
            {/* Viewport indicator */}
            <text style={{ fg: isInViewport ? "cyan" : "gray", dim: !isInViewport }}>
              {isCursor ? "▸" : isInViewport ? "│" : " "}
            </text>
            {/* Compressed line content */}
            <text
              style={{
                fg: (isCursor ? "yellow" : row.color) as any,
                bg: isInViewport ? "gray" : undefined,
                dim: !isInViewport,
              }}
            >
              {row.text.padEnd(width, " ").slice(0, width)}
            </text>
          </box>
        );
      })}
    </box>
  );
}
