import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

interface Position {
  line: number;
  col: number;
}

interface CopyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  title: string;
  onCopy: (text: string) => void;
}

/**
 * Global copy panel with vim-style visual selection AND mouse support.
 * Allows selecting and copying any part of the content - lines or specific characters.
 */
export function CopyPanel({ isOpen, onClose, content, title, onCopy }: CopyPanelProps) {
  const dimensions = useTerminalDimensions();
  const lines = content.split("\n");

  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursor, setCursor] = useState<Position>({ line: 0, col: 0 });
  const [selectionStart, setSelectionStart] = useState<Position | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"char" | "line">("line");

  // Layout constants
  const LINE_NUM_WIDTH = 5;
  const SEPARATOR_WIDTH = 3; // " │ "
  const CONTENT_START_COL = LINE_NUM_WIDTH + SEPARATOR_WIDTH;
  const HEADER_HEIGHT = 2; // Header row + border
  const FOOTER_HEIGHT = 2; // Footer row + border

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setScrollOffset(0);
      setCursor({ line: 0, col: 0 });
      // Start with line selection active on first line
      setSelectionStart({ line: 0, col: 0 });
      setSelectionEnd({ line: 0, col: lines[0]?.length || 0 });
      setSelectionMode("line");
      setIsDragging(false);
    }
  }, [isOpen, lines]);

  const visibleHeight = Math.max(5, (dimensions.height || 24) - 8);
  const panelWidth = Math.min(dimensions.width || 80, 120) - 4;
  const contentWidth = panelWidth - CONTENT_START_COL - 2; // -2 for padding

  // Ensure cursor is visible
  useEffect(() => {
    if (cursor.line < scrollOffset) {
      setScrollOffset(cursor.line);
    } else if (cursor.line >= scrollOffset + visibleHeight) {
      setScrollOffset(cursor.line - visibleHeight + 1);
    }
  }, [cursor.line, scrollOffset, visibleHeight]);

  // Get normalized selection range (start always before end)
  const getSelectedRange = useCallback(() => {
    if (selectionStart === null || selectionEnd === null) return null;

    let start = selectionStart;
    let end = selectionEnd;

    // Normalize: start should be before end
    if (start.line > end.line || (start.line === end.line && start.col > end.col)) {
      [start, end] = [end, start];
    }

    return { start, end };
  }, [selectionStart, selectionEnd]);

  // Check if a position is within selection
  const isPositionSelected = useCallback((line: number, col: number): boolean => {
    const range = getSelectedRange();
    if (!range) return false;

    const { start, end } = range;

    if (line < start.line || line > end.line) return false;

    if (selectionMode === "line") {
      return true; // Entire line is selected
    }

    // Character mode
    if (line === start.line && line === end.line) {
      return col >= start.col && col < end.col;
    }
    if (line === start.line) {
      return col >= start.col;
    }
    if (line === end.line) {
      return col < end.col;
    }
    return true; // Middle lines are fully selected
  }, [getSelectedRange, selectionMode]);

  // Copy selected text
  const copySelection = useCallback(async () => {
    const range = getSelectedRange();
    let textToCopy: string;

    if (range) {
      const { start, end } = range;

      if (selectionMode === "line") {
        // Line mode: copy entire lines
        const selectedLines = lines.slice(start.line, end.line + 1);
        textToCopy = selectedLines.join("\n");
      } else {
        // Character mode: copy partial text
        if (start.line === end.line) {
          textToCopy = lines[start.line]?.slice(start.col, end.col) || "";
        } else {
          const result: string[] = [];
          result.push(lines[start.line]?.slice(start.col) || "");
          for (let i = start.line + 1; i < end.line; i++) {
            result.push(lines[i] || "");
          }
          result.push(lines[end.line]?.slice(0, end.col) || "");
          textToCopy = result.join("\n");
        }
      }
    } else {
      // Copy current line if no selection
      textToCopy = lines[cursor.line] || "";
    }

    onCopy(textToCopy);
    onClose();
  }, [lines, cursor, getSelectedRange, selectionMode, onCopy, onClose]);

  // Convert mouse coordinates to text position
  const mouseToPosition = useCallback((mouseX: number, mouseY: number): Position => {
    // Account for panel centering and borders
    const panelLeft = Math.floor(((dimensions.width || 80) - panelWidth) / 2) + 1;
    const panelTop = Math.floor(((dimensions.height || 24) - (dimensions.height || 24) + 4) / 2) + 2;

    // Calculate relative position within content area
    const relativeY = mouseY - panelTop - HEADER_HEIGHT;
    const relativeX = mouseX - panelLeft - CONTENT_START_COL;

    const line = Math.max(0, Math.min(lines.length - 1, scrollOffset + relativeY));
    const lineContent = lines[line] || "";
    const col = Math.max(0, Math.min(lineContent.length, relativeX));

    return { line, col };
  }, [dimensions, panelWidth, scrollOffset, lines]);

  // Mouse event handler
  const handleMouse = useCallback((event: any) => {
    if (!isOpen) return;

    const x = event.x ?? 0;
    const y = event.y ?? 0;

    if (event.type === "down" && event.button === 0) {
      // Left click - start selection
      const pos = mouseToPosition(x, y);
      setCursor(pos);
      setSelectionStart(pos);
      setSelectionEnd(pos);
      setSelectionMode("char"); // Mouse always uses character mode
      setIsDragging(true);
    } else if (event.type === "drag" && isDragging) {
      // Dragging - extend selection
      const pos = mouseToPosition(x, y);
      setCursor(pos);
      setSelectionEnd(pos);

      // Auto-scroll when dragging near edges
      if (pos.line <= scrollOffset + 1 && scrollOffset > 0) {
        setScrollOffset(Math.max(0, scrollOffset - 1));
      } else if (pos.line >= scrollOffset + visibleHeight - 2) {
        setScrollOffset(Math.min(lines.length - visibleHeight, scrollOffset + 1));
      }
    } else if (event.type === "up") {
      setIsDragging(false);
    } else if (event.type === "scroll" && event.scroll) {
      // Scroll wheel
      if (event.scroll.direction === "up") {
        setScrollOffset(Math.max(0, scrollOffset - 3));
      } else if (event.scroll.direction === "down") {
        setScrollOffset(Math.min(Math.max(0, lines.length - visibleHeight), scrollOffset + 3));
      }
    }
  }, [isOpen, mouseToPosition, isDragging, scrollOffset, visibleHeight, lines.length]);

  // Keyboard handler
  useKeyboard((event) => {
    if (!isOpen) return;

    // Close
    if (event.name === "escape" || event.name === "q") {
      onClose();
      return;
    }

    const currentLine = lines[cursor.line] || "";

    // Vertical navigation
    if (event.name === "j" || event.name === "down") {
      const newLine = Math.min(lines.length - 1, cursor.line + 1);
      const newLineContent = lines[newLine] || "";
      const newCol = selectionMode === "line" ? 0 : Math.min(cursor.col, newLineContent.length);
      setCursor({ line: newLine, col: newCol });
      if (selectionStart !== null) {
        if (selectionMode === "line") {
          setSelectionEnd({ line: newLine, col: newLineContent.length });
        } else {
          setSelectionEnd({ line: newLine, col: newCol });
        }
      }
      return;
    }

    if (event.name === "k" || event.name === "up") {
      const newLine = Math.max(0, cursor.line - 1);
      const newLineContent = lines[newLine] || "";
      const newCol = selectionMode === "line" ? 0 : Math.min(cursor.col, newLineContent.length);
      setCursor({ line: newLine, col: newCol });
      if (selectionStart !== null) {
        if (selectionMode === "line") {
          setSelectionEnd({ line: newLine, col: newLineContent.length });
        } else {
          setSelectionEnd({ line: newLine, col: newCol });
        }
      }
      return;
    }

    // Horizontal navigation (character mode)
    if (event.name === "h" || event.name === "left") {
      if (cursor.col > 0) {
        const newCol = cursor.col - 1;
        setCursor({ ...cursor, col: newCol });
        if (selectionStart !== null && selectionMode === "char") {
          setSelectionEnd({ line: cursor.line, col: newCol });
        }
      } else if (cursor.line > 0) {
        // Move to end of previous line
        const newLine = cursor.line - 1;
        const newCol = lines[newLine]?.length || 0;
        setCursor({ line: newLine, col: newCol });
        if (selectionStart !== null && selectionMode === "char") {
          setSelectionEnd({ line: newLine, col: newCol });
        }
      }
      return;
    }

    if (event.name === "l" || event.name === "right") {
      if (cursor.col < currentLine.length) {
        const newCol = cursor.col + 1;
        setCursor({ ...cursor, col: newCol });
        if (selectionStart !== null && selectionMode === "char") {
          setSelectionEnd({ line: cursor.line, col: newCol });
        }
      } else if (cursor.line < lines.length - 1) {
        // Move to start of next line
        const newLine = cursor.line + 1;
        setCursor({ line: newLine, col: 0 });
        if (selectionStart !== null && selectionMode === "char") {
          setSelectionEnd({ line: newLine, col: 0 });
        }
      }
      return;
    }

    // Word navigation
    if (event.name === "w") {
      // Jump to next word
      let col = cursor.col;
      let line = cursor.line;
      const lineContent = lines[line] || "";

      // Skip current word
      while (col < lineContent.length && /\w/.test(lineContent[col] || "")) col++;
      // Skip whitespace
      while (col < lineContent.length && /\s/.test(lineContent[col] || "")) col++;

      if (col >= lineContent.length && line < lines.length - 1) {
        line++;
        col = 0;
      }

      setCursor({ line, col });
      if (selectionStart !== null && selectionMode === "char") {
        setSelectionEnd({ line, col });
      }
      return;
    }

    if (event.name === "b") {
      // Jump to previous word
      let col = cursor.col;
      let line = cursor.line;

      if (col === 0 && line > 0) {
        line--;
        col = lines[line]?.length || 0;
      }

      const lineContent = lines[line] || "";
      // Skip whitespace backwards
      while (col > 0 && /\s/.test(lineContent[col - 1] || "")) col--;
      // Skip word backwards
      while (col > 0 && /\w/.test(lineContent[col - 1] || "")) col--;

      setCursor({ line, col });
      if (selectionStart !== null && selectionMode === "char") {
        setSelectionEnd({ line, col });
      }
      return;
    }

    // Start/end of line
    if (event.name === "0" || event.name === "home") {
      setCursor({ ...cursor, col: 0 });
      if (selectionStart !== null && selectionMode === "char") {
        setSelectionEnd({ line: cursor.line, col: 0 });
      }
      return;
    }

    if (event.name === "$" || event.name === "end") {
      const endCol = currentLine.length;
      setCursor({ ...cursor, col: endCol });
      if (selectionStart !== null && selectionMode === "char") {
        setSelectionEnd({ line: cursor.line, col: endCol });
      }
      return;
    }

    // Page down
    if (event.ctrl && event.name === "d") {
      const newLine = Math.min(lines.length - 1, cursor.line + Math.floor(visibleHeight / 2));
      setCursor({ line: newLine, col: cursor.col });
      if (selectionStart !== null) {
        setSelectionEnd({ line: newLine, col: selectionMode === "line" ? (lines[newLine]?.length || 0) : cursor.col });
      }
      return;
    }

    // Page up
    if (event.ctrl && event.name === "u") {
      const newLine = Math.max(0, cursor.line - Math.floor(visibleHeight / 2));
      setCursor({ line: newLine, col: cursor.col });
      if (selectionStart !== null) {
        setSelectionEnd({ line: newLine, col: selectionMode === "line" ? (lines[newLine]?.length || 0) : cursor.col });
      }
      return;
    }

    // Go to start of file
    if (event.name === "g" && !event.shift) {
      setCursor({ line: 0, col: 0 });
      if (selectionStart !== null) {
        setSelectionEnd({ line: 0, col: 0 });
      }
      return;
    }

    // Go to end of file
    if (event.name === "G" || (event.shift && event.name === "g")) {
      const lastLine = lines.length - 1;
      const lastCol = lines[lastLine]?.length || 0;
      setCursor({ line: lastLine, col: lastCol });
      if (selectionStart !== null) {
        setSelectionEnd({ line: lastLine, col: lastCol });
      }
      return;
    }

    // Visual line mode toggle (V)
    if (event.name === "V" || (event.shift && event.name === "v")) {
      if (selectionMode === "line" && selectionStart !== null) {
        // Turn off selection
        setSelectionStart(null);
        setSelectionEnd(null);
      } else {
        // Enter line mode
        setSelectionMode("line");
        setSelectionStart({ line: cursor.line, col: 0 });
        setSelectionEnd({ line: cursor.line, col: lines[cursor.line]?.length || 0 });
      }
      return;
    }

    // Visual character mode toggle (v)
    if (event.name === "v" && !event.shift) {
      if (selectionMode === "char" && selectionStart !== null) {
        // Turn off selection
        setSelectionStart(null);
        setSelectionEnd(null);
      } else {
        // Enter character mode
        setSelectionMode("char");
        setSelectionStart({ ...cursor });
        setSelectionEnd({ ...cursor });
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
      setSelectionMode("line");
      setSelectionStart({ line: 0, col: 0 });
      const lastLine = lines.length - 1;
      setSelectionEnd({ line: lastLine, col: lines[lastLine]?.length || 0 });
      setCursor({ line: lastLine, col: 0 });
      return;
    }
  });

  if (!isOpen) return null;

  const width = panelWidth + 4;
  const height = dimensions.height || 24;
  const range = getSelectedRange();
  const isInVisualMode = selectionStart !== null;

  // Calculate selection info text
  let selectionInfo = `Line ${cursor.line + 1}:${cursor.col}`;
  if (range) {
    if (selectionMode === "line") {
      const lineCount = range.end.line - range.start.line + 1;
      selectionInfo = `${lineCount} line${lineCount > 1 ? "s" : ""}`;
    } else {
      // Character count
      let charCount = 0;
      if (range.start.line === range.end.line) {
        charCount = range.end.col - range.start.col;
      } else {
        charCount = (lines[range.start.line]?.length || 0) - range.start.col + 1; // First line + newline
        for (let i = range.start.line + 1; i < range.end.line; i++) {
          charCount += (lines[i]?.length || 0) + 1;
        }
        charCount += range.end.col;
      }
      selectionInfo = `${charCount} char${charCount !== 1 ? "s" : ""}`;
    }
  }

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
      onMouse={handleMouse}
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
              {isInVisualMode && (
                <text style={{ fg: "black", bg: selectionMode === "line" ? "yellow" : "magenta", bold: true }}>
                  {selectionMode === "line" ? " V-LINE " : " V-CHAR "}
                </text>
              )}
            </box>
            <text style={{ fg: "gray", dim: true }}>{selectionInfo}</text>
          </box>
        </box>

        {/* Content */}
        <box style={{ flex: 1, flexDirection: "column", overflow: "hidden" }}>
          {lines.slice(scrollOffset, scrollOffset + visibleHeight).map((line, idx) => {
            const actualLine = scrollOffset + idx;
            const isCurrentLine = actualLine === cursor.line;
            const lineRange = range && actualLine >= range.start.line && actualLine <= range.end.line;

            // For line mode, highlight entire line
            if (selectionMode === "line" && lineRange) {
              const bg = "#2a2a4a";
              const lineNumFg = "cyan";
              return (
                <box key={actualLine} style={{ flexDirection: "row", bg }}>
                  <text style={{ fg: lineNumFg, width: LINE_NUM_WIDTH, textAlign: "right" }}>
                    {String(actualLine + 1).padStart(4)}
                  </text>
                  <text style={{ fg: "gray", dim: true }}> │ </text>
                  <text style={{ fg: "white" }}>{line.slice(0, contentWidth) || " "}</text>
                </box>
              );
            }

            // For character mode, render with partial highlights
            const lineBg = isCurrentLine ? "#1a1a2a" : undefined;
            const lineNumFg = isCurrentLine ? "yellow" : "gray";

            // Build segments for character-level selection
            const displayLine = line.slice(0, contentWidth) || " ";
            const segments: { text: string; selected: boolean }[] = [];

            if (selectionMode === "char" && lineRange && range) {
              let startCol = 0;
              let endCol = displayLine.length;

              if (actualLine === range.start.line) {
                startCol = Math.min(range.start.col, displayLine.length);
              }
              if (actualLine === range.end.line) {
                endCol = Math.min(range.end.col, displayLine.length);
              }

              if (startCol > 0) {
                segments.push({ text: displayLine.slice(0, startCol), selected: false });
              }
              if (endCol > startCol) {
                segments.push({ text: displayLine.slice(startCol, endCol), selected: true });
              }
              if (endCol < displayLine.length) {
                segments.push({ text: displayLine.slice(endCol), selected: false });
              }
              if (segments.length === 0) {
                segments.push({ text: displayLine, selected: false });
              }
            } else {
              segments.push({ text: displayLine, selected: false });
            }

            return (
              <box key={actualLine} style={{ flexDirection: "row", bg: lineBg }}>
                <text style={{ fg: lineNumFg, width: LINE_NUM_WIDTH, textAlign: "right" }}>
                  {String(actualLine + 1).padStart(4)}
                </text>
                <text style={{ fg: "gray", dim: true }}> │ </text>
                {segments.map((seg, segIdx) => (
                  <text
                    key={segIdx}
                    style={{
                      fg: seg.selected ? "white" : "gray",
                      bg: seg.selected ? "#4a2a6a" : undefined,
                    }}
                  >
                    {seg.text}
                  </text>
                ))}
              </box>
            );
          })}
        </box>

        {/* Footer with shortcuts */}
        <box style={{ height: 1, paddingX: 1, borderTop: true, borderColor: "gray" }}>
          <box style={{ flexDirection: "row", gap: 2 }}>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>🖱️ drag</text>
              <text style={{ fg: "gray" }}> select</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>v/V</text>
              <text style={{ fg: "gray" }}> char/line</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "cyan" }}>hjkl</text>
              <text style={{ fg: "gray" }}> move</text>
            </box>
            <box style={{ flexDirection: "row" }}>
              <text style={{ fg: "yellow", bold: true }}>y</text>
              <text style={{ fg: "gray" }}> COPY</text>
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
