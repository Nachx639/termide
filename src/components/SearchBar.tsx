import React, { useState, useEffect, useMemo } from "react";
import { useKeyboard } from "@opentui/react";

interface SearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  content: string[];
  onJumpToLine: (lineNumber: number) => void;
  mode: "search" | "goto";
}

interface SearchMatch {
  lineIndex: number;
  startIndex: number;
  endIndex: number;
  lineContent: string;
}

export function SearchBar({ isOpen, onClose, content, onJumpToLine, mode }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setCurrentMatchIndex(0);
    }
  }, [isOpen]);

  // Find all matches
  const matches = useMemo((): SearchMatch[] => {
    if (mode === "goto" || !query.trim()) return [];

    const results: SearchMatch[] = [];
    const queryLower = query.toLowerCase();

    for (let i = 0; i < content.length; i++) {
      const line = content[i];
      const lineLower = line.toLowerCase();
      let pos = 0;

      while (pos < line.length) {
        const foundIndex = lineLower.indexOf(queryLower, pos);
        if (foundIndex === -1) break;

        results.push({
          lineIndex: i,
          startIndex: foundIndex,
          endIndex: foundIndex + query.length,
          lineContent: line,
        });

        pos = foundIndex + 1;
      }
    }

    return results;
  }, [content, query, mode]);

  // Handle keyboard
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    if (event.name === "return") {
      if (mode === "goto") {
        const lineNum = parseInt(query);
        if (!isNaN(lineNum) && lineNum > 0 && lineNum <= content.length) {
          onJumpToLine(lineNum - 1);
        }
        onClose();
        return;
      }

      // Jump to current match
      if (matches[currentMatchIndex]) {
        onJumpToLine(matches[currentMatchIndex].lineIndex);
        onClose();
      }
      return;
    }

    // Navigate between matches
    if (mode === "search") {
      if (event.name === "n" && event.ctrl) {
        // Next match
        setCurrentMatchIndex((i) => (i + 1) % matches.length);
        if (matches[(currentMatchIndex + 1) % matches.length]) {
          onJumpToLine(matches[(currentMatchIndex + 1) % matches.length].lineIndex);
        }
        return;
      }

      if (event.name === "p" && event.ctrl) {
        // Previous match
        const newIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
        setCurrentMatchIndex(newIndex);
        if (matches[newIndex]) {
          onJumpToLine(matches[newIndex].lineIndex);
        }
        return;
      }
    }

    if (event.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      setCurrentMatchIndex(0);
      return;
    }

    // Regular characters
    if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      setQuery((q) => q + event.name);
      setCurrentMatchIndex(0);
    }
  });

  if (!isOpen) return null;

  const isGotoMode = mode === "goto";
  const borderColor = isGotoMode ? "yellow" : "green";
  const icon = isGotoMode ? ":" : "/";

  return (
    <box
      style={{
        height: 1,
        flexDirection: "column",
        borderTop: true,
        borderColor: borderColor as any,
        bg: "black",
        paddingX: 1,
      }}
    >
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: borderColor as any, bold: true }}>{icon}</text>
          <text style={{ fg: "white" }}>{query}</text>
          <text style={{ fg: borderColor as any, blink: true }}>▌</text>
        </box>
        <box style={{ flexDirection: "row" }}>
          {isGotoMode ? (
            <text style={{ fg: "gray", dim: true }}>
              Go to line (1-{content.length})
            </text>
          ) : (
            <text style={{ fg: matches.length > 0 ? "green" : "red" as any }}>
              {matches.length > 0
                ? `${currentMatchIndex + 1}/${matches.length}`
                : query.length > 0
                  ? "No matches"
                  : "Type to search"}
            </text>
          )}
        </box>
      </box>
    </box>
  );
}
