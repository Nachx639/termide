import React, { useState, useMemo } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

export interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  category?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

function fuzzyMatch(pattern: string, text: string): boolean {
  if (pattern.length === 0) return true;

  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  let patternIdx = 0;
  for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      patternIdx++;
    }
  }

  return patternIdx === pattern.length;
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    return commands.filter(
      (cmd) =>
        fuzzyMatch(query, cmd.label) ||
        fuzzyMatch(query, cmd.description || "") ||
        fuzzyMatch(query, cmd.category || "")
    );
  }, [query, commands]);

  // Reset when opened
  React.useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard
  useKeyboard((event) => {
    if (!isOpen) return;

    if (event.name === "escape") {
      onClose();
      return;
    }

    if (event.name === "return") {
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
      return;
    }

    if (event.name === "up" || (event.ctrl && event.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (event.name === "down" || (event.ctrl && event.name === "n")) {
      setSelectedIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      return;
    }

    if (event.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Regular characters
    if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      setQuery((q) => q + event.name);
      setSelectedIndex(0);
    }
  });

  if (!isOpen) return null;

  const visibleCommands = filteredCommands.slice(0, 12);

  // Group by category
  const groupedCommands: { [category: string]: Command[] } = {};
  for (const cmd of visibleCommands) {
    const cat = cmd.category || "General";
    if (!groupedCommands[cat]) groupedCommands[cat] = [];
    groupedCommands[cat].push(cmd);
  }

  let globalIndex = 0;

  const dimensions = useTerminalDimensions();
  const width = dimensions.width || 80;
  const height = dimensions.height || 24;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box
        style={{
          width: "80%",
          height: 18,
          flexDirection: "column",
          border: true,
          borderColor: "magenta",
          bg: "#0b0b0b",
          position: "relative",
        }}
      >
        {/* Absolute Backdrop of spaces to force terminal opacity */}
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            bg: "#1a1a1a",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <text key={i} style={{ bg: "#1a1a1a" }}>{" ".repeat(200)}</text>
          ))}
        </box>

        {/* Search input */}
        <box style={{ paddingX: 1, borderBottom: true, borderColor: "gray", bg: "#1a1a1a" }}>
          <text style={{ fg: "magenta", bg: "#1a1a1a" }}>⌘ </text>
          <text style={{ fg: "white", bg: "#1a1a1a" }}>{query || ""}</text>
          <text style={{ fg: "magenta", blink: true, bg: "#1a1a1a" }}>▌</text>
        </box>

        {/* Results */}
        <scrollbox style={{ flexDirection: "column", flexGrow: 1, paddingX: 1, bg: "#1a1a1a" }}>
          {visibleCommands.length === 0 ? (
            <text style={{ fg: "gray", dim: true, bg: "#1a1a1a" }}>No commands found</text>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <box key={category} style={{ flexDirection: "column", bg: "#1a1a1a" }}>
                <text style={{ fg: "gray", dim: true, bold: true, bg: "#1a1a1a" }}>{category}</text>
                {cmds.map((cmd) => {
                  const isSelected = globalIndex === selectedIndex;
                  const currentIndex = globalIndex;
                  globalIndex++;

                  return (
                    <box
                      key={cmd.id}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        bg: isSelected ? "magenta" : "#1a1a1a" as any,
                      }}
                    >
                      <box style={{ flexDirection: "row", bg: isSelected ? "magenta" : "#1a1a1a" as any }}>
                        <text style={{ fg: isSelected ? "black" : "gray", bg: isSelected ? "magenta" : "#1a1a1a" as any }}>
                          {isSelected ? "▸ " : "  "}
                        </text>
                        <text style={{ fg: isSelected ? "black" : "white", bg: isSelected ? "magenta" : "#1a1a1a" as any }}>
                          {cmd.label}
                        </text>
                        {cmd.description && (
                          <text style={{ fg: isSelected ? "black" : "gray", dim: !isSelected, bg: isSelected ? "magenta" : "#1a1a1a" as any }}>
                            {" - "}{cmd.description}
                          </text>
                        )}
                      </box>
                      {cmd.shortcut && (
                        <text style={{ fg: isSelected ? "black" : "cyan", bg: isSelected ? "magenta" : "#1a1a1a" as any }}>
                          {cmd.shortcut}
                        </text>
                      )}
                    </box>
                  );
                })}
              </box>
            ))
          )}
          {/* Filler to ensure background opacity */}
          <box style={{ flexGrow: 1, bg: "#1a1a1a" }}>
            <text style={{ bg: "#1a1a1a" }}> </text>
          </box>
        </scrollbox>

        {/* Footer */}
        <box style={{ paddingX: 1, borderTop: true, borderColor: "gray", bg: "#0b0b0b" }}>
          <text style={{ fg: "gray", dim: true, bg: "#0b0b0b" }}>
            {filteredCommands.length} commands | ↑↓ select | Enter run | Esc close
          </text>
        </box>
      </box>

    </box>
  );
}
