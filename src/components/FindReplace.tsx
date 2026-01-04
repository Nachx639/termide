import React, { useState, useEffect, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

interface Match {
  line: number;
  column: number;
  text: string;
  lineText: string;
}

interface FindReplaceProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onReplace: (newContent: string) => void;
  filePath: string | null;
}

export function FindReplace({ isOpen, onClose, content, onReplace, filePath }: FindReplaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState(0);
  const [activeField, setActiveField] = useState<"search" | "replace">("search");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  const dimensions = useTerminalDimensions();
  const width = Math.min(70, (dimensions.width || 80) - 4);
  const height = Math.min(20, (dimensions.height || 30) - 6);
  const listHeight = height - 7;

  // Find all matches when search term changes
  const findMatches = useCallback(() => {
    if (!searchTerm || !content) {
      setMatches([]);
      return;
    }

    try {
      const lines = content.split("\n");
      const foundMatches: Match[] = [];
      const flags = caseSensitive ? "g" : "gi";
      const pattern = useRegex ? new RegExp(searchTerm, flags) : new RegExp(escapeRegex(searchTerm), flags);

      lines.forEach((lineText, lineIndex) => {
        let match;
        while ((match = pattern.exec(lineText)) !== null) {
          foundMatches.push({
            line: lineIndex + 1,
            column: match.index + 1,
            text: match[0],
            lineText: lineText.trim().slice(0, 60),
          });
          // Prevent infinite loops for zero-length matches
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
        }
      });

      setMatches(foundMatches);
      setSelectedMatch(0);
      setScrollTop(0);
    } catch {
      setMatches([]);
    }
  }, [searchTerm, content, caseSensitive, useRegex]);

  useEffect(() => {
    if (isOpen) {
      findMatches();
    }
  }, [isOpen, findMatches]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setReplaceTerm("");
      setMatches([]);
      setSelectedMatch(0);
      setActiveField("search");
    }
  }, [isOpen]);

  const handleReplaceOne = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;

    const match = matches[selectedMatch];
    if (!match) return;

    const lines = content.split("\n");
    const line = lines[match.line - 1];
    if (!line) return;

    const flags = caseSensitive ? "g" : "gi";
    const pattern = useRegex ? new RegExp(searchTerm, flags) : new RegExp(escapeRegex(searchTerm), flags);

    // Find the specific occurrence
    let count = 0;
    let targetIndex = -1;
    for (let i = 0; i < matches.length; i++) {
      if (matches[i]!.line === match.line) {
        if (i === selectedMatch) {
          targetIndex = count;
          break;
        }
        count++;
      }
    }

    // Replace only that occurrence
    let occurrenceCount = 0;
    const newLine = line.replace(pattern, (m) => {
      if (occurrenceCount === targetIndex) {
        occurrenceCount++;
        return replaceTerm;
      }
      occurrenceCount++;
      return m;
    });

    lines[match.line - 1] = newLine;
    onReplace(lines.join("\n"));
  }, [matches, selectedMatch, searchTerm, replaceTerm, content, caseSensitive, useRegex, onReplace]);

  const handleReplaceAll = useCallback(() => {
    if (!searchTerm) return;

    const flags = caseSensitive ? "g" : "gi";
    const pattern = useRegex ? new RegExp(searchTerm, flags) : new RegExp(escapeRegex(searchTerm), flags);
    const newContent = content.replace(pattern, replaceTerm);
    onReplace(newContent);
    findMatches();
  }, [searchTerm, replaceTerm, content, caseSensitive, useRegex, onReplace, findMatches]);

  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    // Tab to switch between search and replace fields
    if (event.name === "tab" && !event.ctrl) {
      setActiveField(prev => prev === "search" ? "replace" : "search");
      return;
    }

    // Navigate matches
    if (event.ctrl && event.name === "n") {
      setSelectedMatch(i => {
        const next = Math.min(matches.length - 1, i + 1);
        if (next >= scrollTop + listHeight) setScrollTop(next - listHeight + 1);
        return next;
      });
      return;
    }

    if (event.ctrl && event.name === "p") {
      setSelectedMatch(i => {
        const prev = Math.max(0, i - 1);
        if (prev < scrollTop) setScrollTop(prev);
        return prev;
      });
      return;
    }

    // Arrow navigation in match list
    if (event.name === "up") {
      setSelectedMatch(i => {
        const prev = Math.max(0, i - 1);
        if (prev < scrollTop) setScrollTop(prev);
        return prev;
      });
      return;
    }

    if (event.name === "down") {
      setSelectedMatch(i => {
        const next = Math.min(matches.length - 1, i + 1);
        if (next >= scrollTop + listHeight) setScrollTop(next - listHeight + 1);
        return next;
      });
      return;
    }

    // Replace current
    if (event.ctrl && event.name === "r") {
      handleReplaceOne();
      return;
    }

    // Replace all
    if (event.ctrl && event.shift && event.name === "r") {
      handleReplaceAll();
      return;
    }

    // Toggle options
    if (event.ctrl && event.name === "c" && event.shift) {
      setCaseSensitive(prev => !prev);
      return;
    }

    if (event.ctrl && event.name === "x") {
      setUseRegex(prev => !prev);
      return;
    }

    // Text input
    if (event.name === "backspace") {
      if (activeField === "search") {
        setSearchTerm(prev => prev.slice(0, -1));
      } else {
        setReplaceTerm(prev => prev.slice(0, -1));
      }
      return;
    }

    // Regular characters
    if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      if (activeField === "search") {
        setSearchTerm(prev => prev + event.name);
      } else {
        setReplaceTerm(prev => prev + event.name);
      }
    }
  });

  if (!isOpen) return null;

  const fileName = filePath ? filePath.split("/").pop() : "No file";

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: dimensions.width || 80,
        height: dimensions.height || 30,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width,
          height,
          flexDirection: "column",
          border: true,
          borderColor: "cyan",
          bg: "#050505",
        }}
      >
        {/* Header */}
        <box style={{ paddingX: 1, height: 1, bg: "#1a1a1a", flexDirection: "row", justifyContent: "space-between" }}>
          <text style={{ fg: "cyan", bold: true, bg: "#1a1a1a" }}>Find & Replace</text>
          <text style={{ fg: "gray", bg: "#1a1a1a" }}>{fileName}</text>
        </box>

        {/* Search Field */}
        <box style={{ paddingX: 1, height: 1, flexDirection: "row", bg: activeField === "search" ? "#1a1a1a" : "#050505" }}>
          <text style={{ fg: "yellow", bg: activeField === "search" ? "#1a1a1a" : "#050505" }}>Find: </text>
          <text style={{ fg: "white", bg: activeField === "search" ? "#1a1a1a" : "#050505" }}>{searchTerm}</text>
          {activeField === "search" && <text style={{ fg: "cyan", bg: "#1a1a1a" }}>|</text>}
          <box style={{ flexGrow: 1 }} />
          <text style={{ fg: matches.length > 0 ? "green" : "gray", bg: activeField === "search" ? "#1a1a1a" : "#050505" }}>
            {matches.length} found
          </text>
        </box>

        {/* Replace Field */}
        <box style={{ paddingX: 1, height: 1, flexDirection: "row", bg: activeField === "replace" ? "#1a1a1a" : "#050505" }}>
          <text style={{ fg: "magenta", bg: activeField === "replace" ? "#1a1a1a" : "#050505" }}>Replace: </text>
          <text style={{ fg: "white", bg: activeField === "replace" ? "#1a1a1a" : "#050505" }}>{replaceTerm}</text>
          {activeField === "replace" && <text style={{ fg: "cyan", bg: "#1a1a1a" }}>|</text>}
        </box>

        {/* Options */}
        <box style={{ paddingX: 1, height: 1, flexDirection: "row", bg: "#0b0b0b" }}>
          <text style={{ fg: caseSensitive ? "cyan" : "gray", bg: "#0b0b0b" }}>[{caseSensitive ? "x" : " "}] Case </text>
          <text style={{ fg: useRegex ? "cyan" : "gray", bg: "#0b0b0b" }}>[{useRegex ? "x" : " "}] Regex</text>
          <box style={{ flexGrow: 1 }} />
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>Tab:switch</text>
        </box>

        {/* Results List */}
        <box style={{ flexGrow: 1, flexDirection: "column", paddingX: 1, bg: "#050505" }}>
          {matches.length === 0 && searchTerm && (
            <text style={{ fg: "gray", italic: true }}>No matches found</text>
          )}
          {matches.slice(scrollTop, scrollTop + listHeight).map((match, index) => {
            const actualIndex = index + scrollTop;
            const isSelected = actualIndex === selectedMatch;
            return (
              <box
                key={`${match.line}-${match.column}`}
                style={{
                  flexDirection: "row",
                  bg: isSelected ? "blue" : undefined,
                  paddingX: 1,
                }}
              >
                <text style={{ fg: isSelected ? "white" : "yellow", bg: isSelected ? "blue" : undefined }}>
                  {String(match.line).padStart(4)}:
                </text>
                <text style={{ fg: isSelected ? "cyan" : "gray", bg: isSelected ? "blue" : undefined }}>
                  {String(match.column).padStart(3)}
                </text>
                <text style={{ fg: isSelected ? "white" : "gray", bg: isSelected ? "blue" : undefined }}>
                  {" "}{match.lineText.slice(0, width - 15)}
                </text>
              </box>
            );
          })}
        </box>

        {/* Footer with shortcuts */}
        <box style={{ paddingX: 1, height: 1, borderTop: true, borderColor: "gray", bg: "#0b0b0b" }}>
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
            Ctrl+R:replace | Ctrl+Shift+R:all | Esc:close
          </text>
        </box>
      </box>
    </box>
  );
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
