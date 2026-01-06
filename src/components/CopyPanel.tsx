import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

interface CopyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  title: string;
  onCopy: (text: string) => void;
}

/**
 * Global copy panel with vim-style visual selection.
 * Allows selecting and copying any part of the content.
 */
export function CopyPanel({ isOpen, onClose, content, title, onCopy }: CopyPanelProps) {
  const dimensions = useTerminalDimensions();
  const lines = content.split("\n");

  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // Reset state when opened - start with selection active on first line
  useEffect(() => {
    if (isOpen) {
      setScrollOffset(0);
      setCursorLine(0);
      // Start with selection active so user can immediately navigate and copy
      setSelectionStart(0);
      setSelectionEnd(0);
    }
  }, [isOpen]);

  const visibleHeight = Math.max(5, (dimensions.height || 24) - 8);

  // Ensure cursor is visible
  useEffect(() => {
    if (cursorLine < scrollOffset) {
      setScrollOffset(cursorLine);
    } else if (cursorLine >= scrollOffset + visibleHeight) {
      setScrollOffset(cursorLine - visibleHeight + 1);
    }
  }, [cursorLine, scrollOffset, visibleHeight]);

  const getSelectedRange = useCallback(() => {
    if (selectionStart === null) return null;
    const start = Math.min(selectionStart, selectionEnd ?? cursorLine);
    const end = Math.max(selectionStart, selectionEnd ?? cursorLine);
    return { start, end };
  }, [selectionStart, selectionEnd, cursorLine]);

  const copySelection = useCallback(async () => {
    const range = getSelectedRange();
    let textToCopy: string;
    let lineCount: number;

    if (range) {
      const selectedLines = lines.slice(range.start, range.end + 1);
      textToCopy = selectedLines.join("\n");
      lineCount = selectedLines.length;
    } else {
      // Copy current line if no selection
      textToCopy = lines[cursorLine] || "";
      lineCount = 1;
    }

    onCopy(textToCopy);
    onClose();
  }, [lines, cursorLine, getSelectedRange, onCopy, onClose]);

  useKeyboard((event) => {
    if (!isOpen) return;

    // Close
    if (event.name === "escape" || event.name === "q") {
      onClose();
      return;
    }

    // Navigation
    if (event.name === "j" || event.name === "down") {
      const newLine = Math.min(lines.length - 1, cursorLine + 1);
      setCursorLine(newLine);
      if (selectionStart !== null) {
        setSelectionEnd(newLine);
      }
      return;
    }

    if (event.name === "k" || event.name === "up") {
      const newLine = Math.max(0, cursorLine - 1);
      setCursorLine(newLine);
      if (selectionStart !== null) {
        setSelectionEnd(newLine);
      }
      return;
    }

    // Page down
    if (event.ctrl && event.name === "d") {
      const newLine = Math.min(lines.length - 1, cursorLine + Math.floor(visibleHeight / 2));
      setCursorLine(newLine);
      if (selectionStart !== null) {
        setSelectionEnd(newLine);
      }
      return;
    }

    // Page up
    if (event.ctrl && event.name === "u") {
      const newLine = Math.max(0, cursorLine - Math.floor(visibleHeight / 2));
      setCursorLine(newLine);
      if (selectionStart !== null) {
        setSelectionEnd(newLine);
      }
      return;
    }

    // Go to start
    if (event.name === "g" && !event.shift) {
      setCursorLine(0);
      if (selectionStart !== null) {
        setSelectionEnd(0);
      }
      return;
    }

    // Go to end
    if (event.name === "G" || (event.shift && event.name === "g")) {
      const lastLine = lines.length - 1;
      setCursorLine(lastLine);
      if (selectionStart !== null) {
        setSelectionEnd(lastLine);
      }
      return;
    }

    // Visual mode toggle
    if (event.name === "v" || event.name === "V") {
      if (selectionStart === null) {
        setSelectionStart(cursorLine);
        setSelectionEnd(cursorLine);
      } else {
        setSelectionStart(null);
        setSelectionEnd(null);
      }
      return;
    }

    // Copy (yank)
    if (event.name === "y" || event.name === "Y" || event.name === "return") {
      copySelection();
      return;
    }

    // Select all
    if (event.ctrl && event.name === "a") {
      setSelectionStart(0);
      setSelectionEnd(lines.length - 1);
      setCursorLine(lines.length - 1);
      return;
    }
  });

  if (!isOpen) return null;

  const width = Math.min(dimensions.width || 80, 120);
  const height = dimensions.height || 24;
  const range = getSelectedRange();
  const isInVisualMode = selectionStart !== null;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: dimensions.width,
        height,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width: width - 4,
          height: height - 4,
          flexDirection: "column",
          border: true,
          borderColor: "cyan",
          bg: "#0a0a0a",
        }}
      >
        {/* Header */}
        <box style={{ height: 1, paddingX: 1, borderBottom: true, borderColor: "gray" }}>
          <box style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            <box style={{ flexDirection: "row", gap: 1 }}>
              <text style={{ fg: "cyan", bold: true }}>📋 Copy Mode</text>
              <text style={{ fg: "gray" }}>- {title}</text>
              {isInVisualMode && <text style={{ fg: "black", bg: "yellow", bold: true }}> VISUAL </text>}
            </box>
            <text style={{ fg: "gray", dim: true }}>
              {range ? `${range.end - range.start + 1} lines` : `Line ${cursorLine + 1}/${lines.length}`}
            </text>
          </box>
        </box>

        {/* Content */}
        <box style={{ flex: 1, flexDirection: "column", overflow: "hidden" }}>
          {lines.slice(scrollOffset, scrollOffset + visibleHeight).map((line, idx) => {
            const actualLine = scrollOffset + idx;
            const isCurrentLine = actualLine === cursorLine;
            const isSelected = range && actualLine >= range.start && actualLine <= range.end;

            const bg = isSelected ? "#2a2a4a" : isCurrentLine ? "#1a1a2a" : undefined;
            const lineNumFg = isSelected ? "cyan" : isCurrentLine ? "yellow" : "gray";

            return (
              <box key={actualLine} style={{ flexDirection: "row", bg }}>
                <text style={{ fg: lineNumFg, width: 5, textAlign: "right" }}>
                  {String(actualLine + 1).padStart(4)}
                </text>
                <text style={{ fg: "gray", dim: true }}> │ </text>
                <text style={{ fg: isSelected ? "white" : "gray" }}>
                  {line.slice(0, width - 12) || " "}
                </text>
              </box>
            );
          })}
        </box>

        {/* Footer with shortcuts */}
        <box style={{ height: 1, paddingX: 1, borderTop: true, borderColor: "gray" }}>
          <box style={{ flexDirection: "row", gap: 2 }}>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>j/k</text>
              <text style={{ fg: "gray" }}> select</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "yellow", bold: true }}>y</text>
              <text style={{ fg: "gray" }}> COPY</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>g/G</text>
              <text style={{ fg: "gray" }}> start/end</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>Ctrl+A</text>
              <text style={{ fg: "gray" }}> all</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>q</text>
              <text style={{ fg: "gray" }}> close</text>
            </box>
          </box>
        </box>
      </box>
    </box>
  );
}
