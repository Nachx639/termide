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

  // Reset when opened or query changes
  React.useEffect(() => {
    setSelectedIndex(0);
    setScrollTop(0);
  }, [isOpen, query]);

  // Handle keyboard events exclusively when open
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

  const dimensions = useTerminalDimensions();
  const width = dimensions.width || 80;
  const height = dimensions.height || 24;

  // Create flat list for rendering (Headers + Commands)
  const fullRenderList: ({ type: "header"; label: string } | { type: "command"; cmd: Command; index: number })[] = [];
  const allGrouped: { [category: string]: Command[] } = {};

  filteredCommands.forEach((cmd, idx) => {
    const cat = cmd.category || "General";
    if (!allGrouped[cat]) allGrouped[cat] = [];
    allGrouped[cat].push(cmd);
  });

  Object.entries(allGrouped).forEach(([category, cmds]) => {
    fullRenderList.push({ type: "header", label: category });
    cmds.forEach(cmd => {
      const originalIdx = filteredCommands.findIndex(c => c.id === cmd.id);
      fullRenderList.push({ type: "command", cmd, index: originalIdx });
    });
  });

  // Edge-triggered scroll logic based on flat lines
  const maxLines = 13;
  const scrollMargin = 2; // Buffer: scroll 2 lines before reaching the edge
  const [scrollTop, setScrollTop] = React.useState(0);

  const selectedFlatIndex = fullRenderList.findIndex(
    item => item.type === "command" && item.index === selectedIndex
  );

  // Compute effective scroll for this frame (zero-lag sync)
  let currentScroll = scrollTop;
  if (isOpen && selectedFlatIndex !== -1) {
    if (selectedFlatIndex < currentScroll + scrollMargin) {
      currentScroll = Math.max(0, selectedFlatIndex - scrollMargin);
    } else if (selectedFlatIndex >= currentScroll + maxLines - scrollMargin) {
      const maxPossible = Math.max(0, fullRenderList.length - maxLines);
      currentScroll = Math.min(maxPossible, selectedFlatIndex - maxLines + 1 + scrollMargin);
    }
  }

  // Update state to keep it stable
  React.useEffect(() => {
    if (isOpen && currentScroll !== scrollTop) {
      setScrollTop(currentScroll);
    }
  }, [currentScroll, isOpen, scrollTop]);

  const visibleLines = fullRenderList.slice(currentScroll, currentScroll + maxLines);

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
          height: 19,
          flexDirection: "column",
          border: true,
          borderColor: "magenta",
          bg: "#050505",
          position: "relative",
        }}
      >
        {/* Force opacity with backdrop - offset by 1 to protect borders */}
        <box
          style={{
            position: "absolute",
            top: 1,
            left: 1,
            width: "100%",
            height: 17,
            bg: "#050505",
            flexDirection: "column",
          }}
        >
          {Array.from({ length: 17 }).map((_, i) => (
            <text key={i} style={{ bg: "#050505" }}>{" ".repeat(150)}</text>
          ))}
        </box>

        {/* Content Container - Offset by 1 to protect the magenta border */}
        <box style={{ margin: 1, flexDirection: "column", flexGrow: 1, bg: "#050505" }}>
          {/* Search input */}
          <box style={{ paddingX: 2, height: 1, bg: "#050505", flexDirection: "row" }}>
            <text style={{ fg: "magenta", bold: true, bg: "#050505" }}> › </text>
            <text style={{ fg: "white", bg: "#050505" }}>{query}</text>
            <text style={{ fg: "magenta", bg: "#050505" }}>█</text>
          </box>

          {/* 3. Results Area (Height 13 fixed) */}
          <box style={{ flexDirection: "column", height: 13, paddingX: 2, bg: "#050505" }}>
            {visibleLines.length === 0 ? (
              <text style={{ fg: "gray", dim: true, bg: "#050505" }}>No commands found</text>
            ) : (
              visibleLines.map((item, i) => {
                const itemKey = item.type === "header" ? `h-${item.label}` : `c-${item.cmd.id}`;

                if (item.type === "header") {
                  return (
                    <box key={itemKey} style={{ height: 1, bg: "#050505" }}>
                      <text style={{ fg: "gray", dim: true, bold: true, bg: "#050505" }}>{item.label}</text>
                    </box>
                  );
                }

                const isSelected = item.index === selectedIndex;
                const cmd = item.cmd;

                return (
                  <box
                    key={itemKey}
                    style={{
                      height: 1,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      bg: isSelected ? "magenta" : "#050505" as any,
                    }}
                  >
                    <box style={{ flexDirection: "row", bg: isSelected ? "magenta" : "#050505" as any }}>
                      <text style={{ fg: isSelected ? "black" : "gray", bg: isSelected ? "magenta" : "#050505" as any }}>
                        {isSelected ? "▸ " : "  "}
                      </text>
                      <text style={{ fg: isSelected ? "black" : "white", bg: isSelected ? "magenta" : "#050505" as any }}>
                        {cmd.label}
                      </text>
                      {cmd.description && (
                        <text style={{ fg: isSelected ? "black" : "gray", dim: !isSelected, bg: isSelected ? "magenta" : "#050505" as any }}>
                          {" - "}{cmd.description}
                        </text>
                      )}
                    </box>
                    {cmd.shortcut && (
                      <text style={{ fg: isSelected ? "black" : "cyan", bg: isSelected ? "magenta" : "#050505" as any }}>
                        {cmd.shortcut}
                      </text>
                    )}
                  </box>
                );
              })
            )}
          </box>

          {/* Footer Divider */}
          <box style={{ height: 1, borderTop: true, borderColor: "gray", bg: "#050505" }} />

          {/* 5. Footer Instructions (Height 1) */}
          <box style={{ paddingX: 2, height: 1, bg: "#050505" }}>
            <text style={{ fg: "gray", dim: true, bg: "#050505" }}>
              {`${filteredCommands.length} commands | ↑↓ select | Enter run | Esc close`}
            </text>
          </box>
        </box>
      </box>
    </box>
  );
}
