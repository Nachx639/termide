import React, { useState, useEffect, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { tokenizeLine, detectLanguage, getTokenColor, type Token, DARK_THEME } from "../lib/SyntaxHighlighter";
import { SearchBar } from "./SearchBar";
import { Minimap } from "./Minimap";
import { MarkdownPreview } from "./MarkdownPreview";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
  height: number;
}

// Breadcrumbs component
function Breadcrumbs({ filePath, rootPath }: { filePath: string; rootPath?: string }) {
  const relativePath = rootPath ? path.relative(rootPath, filePath) : filePath;
  const parts = relativePath.split(path.sep);
  const fileName = parts.pop() || "";

  return (
    <box style={{ flexDirection: "row", gap: 0 }}>
      {parts.map((part, idx) => (
        <box key={idx} style={{ flexDirection: "row" }}>
          <text style={{ fg: "gray" }}>{part}</text>
          <text style={{ fg: "gray", dim: true }}> › </text>
        </box>
      ))}
      <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
    </box>
  );
}

// Calculate indentation level of a line
function getIndentLevel(line: string, tabSize: number = 2): number {
  let spaces = 0;
  for (const char of line) {
    if (char === " ") spaces++;
    else if (char === "\t") spaces += tabSize;
    else break;
  }
  return Math.floor(spaces / tabSize);
}

// Generate indent guides for a line
function generateIndentGuides(line: string, tabSize: number = 2): string {
  const level = getIndentLevel(line, tabSize);
  if (level === 0) return "";

  let guides = "";
  for (let i = 0; i < level; i++) {
    guides += "│" + " ".repeat(tabSize - 1);
  }
  return guides;
}

// Helper to wrap a line to a specific width
function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    if (remaining.length <= width) {
      wrapped.push(remaining);
      break;
    }

    // Try to break at a word boundary
    let breakPoint = width;
    const lastSpace = remaining.lastIndexOf(" ", width);
    if (lastSpace > width * 0.5) {
      breakPoint = lastSpace + 1;
    }

    wrapped.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
  }

  return wrapped;
}

// Component to render a line with syntax highlighting
function HighlightedLine({ line, lang, showGuides = false, tabSize = 2 }: { line: string; lang: string | null; showGuides?: boolean; tabSize?: number }) {
  const tokens = useMemo(() => tokenizeLine(line, lang), [line, lang]);

  // Calculate indent and strip leading whitespace for guides
  const indentLevel = getIndentLevel(line, tabSize);
  const leadingSpaces = line.match(/^[\s]*/)?.[0].length || 0;
  const trimmedLine = line.slice(leadingSpaces);

  return (
    <>
      {showGuides && indentLevel > 0 ? (
        <>
          {/* Render indent guides */}
          {Array.from({ length: indentLevel }).map((_, i) => (
            <text key={`guide-${i}`} style={{ fg: "gray", dim: true }}>
              │{" ".repeat(tabSize - 1)}
            </text>
          ))}
          {/* Render the rest of the line after guides */}
          {tokenizeLine(trimmedLine, lang).map((token, idx) => (
            <text key={idx} style={{ fg: getTokenColor(token.type) as any }}>
              {token.text}
            </text>
          ))}
        </>
      ) : (
        tokens.map((token, idx) => (
          <text key={idx} style={{ fg: getTokenColor(token.type) as any }}>
            {token.text}
          </text>
        ))
      )}
    </>
  );
}

export function FileViewer({ filePath, focused, rootPath, height }: FileViewerProps) {
  const [content, setContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<"search" | "goto">("search");
  const [wordWrap, setWordWrap] = useState(false);
  const [showIndentGuides, setShowIndentGuides] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // Calculate dynamic heights
  const isMarkdown = filePath?.toLowerCase().endsWith(".md") || filePath?.toLowerCase().endsWith(".markdown");
  const headerHeight = 1;
  const headerSeparatorHeight = 1; // The line from borderBottom
  const chromeHeight = 2; // Outer Border top/bottom
  const searchHeight = showSearch ? 1 : 0;
  const viewHeight = Math.max(1, height - headerHeight - headerSeparatorHeight - chromeHeight - searchHeight - 1);

  const wrapWidth = 80;
  const tabSize = 2;
  const minimapHeight = Math.max(5, viewHeight);

  const language = useMemo(() => {
    return filePath ? detectLanguage(filePath) : null;
  }, [filePath]);

  // Handle jumping to a line (from search or goto)
  const handleJumpToLine = (lineIndex: number) => {
    setCursorLine(lineIndex);
    // Center the line in view
    const newOffset = Math.max(0, Math.min(lineIndex - Math.floor(viewHeight / 2), Math.max(0, content.length - viewHeight)));
    setScrollOffset(newOffset);
  };

  useEffect(() => {
    if (!filePath || !fs.existsSync(filePath)) {
      setContent([]);
      return;
    }

    const readFile = () => {
      try {
        const text = fs.readFileSync(filePath, "utf-8");
        setContent(text.split("\n"));
      } catch {
        setContent(["Error reading file"]);
      }
    };

    // Initial read
    readFile();
    setScrollOffset(0);

    // Watch for changes
    try {
      const watcher = fs.watch(filePath, (event) => {
        if (event === "change") {
          readFile();
        }
      });

      return () => watcher.close();
    } catch (e) {
      console.error("Watcher error:", e);
    }
  }, [filePath]);


  useKeyboard((event) => {
    if (!focused) return;

    if (showSearch) return;

    if (event.alt && event.name === "f") {
      setSearchMode("search");
      setShowSearch(true);
      return;
    }

    if (event.ctrl && event.name === "g") {
      setSearchMode("goto");
      setShowSearch(true);
      return;
    }

    if (event.meta && event.name === "z") {
      setWordWrap((w) => !w);
      return;
    }

    if (event.meta && event.name === "i") {
      setShowIndentGuides((v) => !v);
      return;
    }

    if (event.meta && event.name === "m") {
      setShowMinimap((v) => !v);
      return;
    }

    if (event.meta && event.name === "p") {
      if (isMarkdown) {
        setShowPreview((v) => !v);
      }
      return;
    }

    if (showPreview) return;

    if (event.name === "up" || event.name === "k") {
      const newCursor = Math.max(0, cursorLine - 1);
      setCursorLine(newCursor);

      // Smart Auto-scroll (edge-triggered)
      const scrollMargin = 2;
      if (newCursor < scrollOffset + scrollMargin) {
        setScrollOffset(Math.max(0, newCursor - scrollMargin));
      }
    } else if (event.name === "down" || event.name === "j") {
      const newCursor = Math.min(content.length - 1, cursorLine + 1);
      setCursorLine(newCursor);

      // Smart Auto-scroll (edge-triggered)
      const scrollMargin = 2;
      if (newCursor >= scrollOffset + viewHeight - scrollMargin) {
        setScrollOffset(Math.min(
          Math.max(0, content.length - viewHeight),
          newCursor - viewHeight + 1 + scrollMargin
        ));
      }
    } else if (event.name === "pageup") {
      const newOffset = Math.max(0, scrollOffset - viewHeight);
      setScrollOffset(newOffset);
      setCursorLine(newOffset);
    } else if (event.name === "pagedown") {
      const newOffset = Math.min(Math.max(0, content.length - viewHeight), scrollOffset + viewHeight);
      setScrollOffset(newOffset);
      setCursorLine(newOffset);
    } else if (event.name === "g") {
      setScrollOffset(0);
      setCursorLine(0);
    } else if (event.name === "G") {
      const lastOffset = Math.max(0, content.length - viewHeight);
      setScrollOffset(lastOffset);
      setCursorLine(content.length - 1);
    }
  });

  const visibleLines = content.slice(scrollOffset, scrollOffset + viewHeight);
  const fileName = filePath ? path.basename(filePath) : "No file selected";
  const borderColor = focused ? "cyan" : "gray";
  const lineNumWidth = Math.max(4, String(content.length).length);

  // Get file type indicator
  const langIndicator = language ? language.toUpperCase() : "";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      {/* Header with Breadcrumbs and status indicators */}
      <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1, flexShrink: 1 }}>
          {filePath ? (
            <box style={{ flexShrink: 1 }}><Breadcrumbs filePath={filePath} rootPath={rootPath} /></box>
          ) : (
            <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
          )}
          <box style={{ flexDirection: "row", flexShrink: 0 }}>
            {langIndicator && <text style={{ fg: "#d4a800", dim: true }}> [{langIndicator}]</text>}
            {wordWrap && <text style={{ fg: "magenta", dim: true }}> [wrap]</text>}
            {showIndentGuides && <text style={{ fg: "gray", dim: true }}> [guides]</text>}
            {showMinimap && <text style={{ fg: "blue", dim: true }}> [map]</text>}
            {isMarkdown && (
              <text style={{ fg: showPreview ? "magenta" : "gray", dim: !showPreview }}>
                {showPreview ? " [preview]" : " [Alt+P preview]"}
              </text>
            )}
          </box>
        </box>
        <text style={{ fg: "gray", flexShrink: 0 }}>
          Ln {cursorLine + 1}/{content.length}
        </text>
      </box>

      {/* Separator line */}
      <box style={{ height: 1, borderTop: true, borderColor: "gray", dim: true }} />
      {/* Show markdown preview or code view */}
      {showPreview && isMarkdown ? (
        <MarkdownPreview
          filePath={filePath}
          focused={focused}
          rootPath={rootPath}
        />
      ) : (
        <box style={{ flexDirection: "row", flexGrow: 1, position: "relative" }}>
          <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 2, flexGrow: 1, height: viewHeight, overflow: "hidden" }}>
            {filePath ? (
              visibleLines.map((line, index) => {
                const lineNum = scrollOffset + index + 1;
                const isCurrentLine = scrollOffset + index === cursorLine;
                const lineNumFg = isCurrentLine ? "yellow" : "gray";
                const lineBg = isCurrentLine && focused ? "gray" : undefined;

                // Handle word wrap
                if (wordWrap && line.length > wrapWidth) {
                  const wrappedLines = wrapLine(line, wrapWidth);
                  return (
                    <box key={index} style={{ flexDirection: "column", overflow: "hidden" }}>
                      {wrappedLines.map((wrappedLine, wrapIdx) => (
                        <box key={wrapIdx} style={{ flexDirection: "row", bg: lineBg as any, overflow: "hidden" }}>
                          <text style={{ fg: lineNumFg as any, bold: isCurrentLine && wrapIdx === 0, flexShrink: 0 }}>
                            {wrapIdx === 0
                              ? `${String(lineNum).padStart(lineNumWidth, " ")}${isCurrentLine ? " ▸ " : "   "}`
                              : `${" ".repeat(lineNumWidth)}   ↪ `}
                          </text>
                          <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden" }}>
                            <HighlightedLine line={wrappedLine} lang={language} showGuides={showIndentGuides} tabSize={tabSize} />
                          </box>
                        </box>
                      ))}
                    </box>
                  );
                }

                return (
                  <box key={index} style={{ flexDirection: "row", bg: lineBg as any, overflow: "hidden" }}>
                    <text style={{ fg: lineNumFg as any, bold: isCurrentLine, flexShrink: 0 }}>
                      {String(lineNum).padStart(lineNumWidth, " ")}{isCurrentLine ? " ▸ " : "   "}
                    </text>
                    <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden", paddingRight: 1 }}>
                      <HighlightedLine line={line} lang={language} showGuides={showIndentGuides} tabSize={tabSize} />
                    </box>
                  </box>
                );
              })
            ) : (
              <box style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1 }}>
                <text style={{ fg: "gray" }}>Select a file from the explorer</text>
                <text style={{ fg: "gray", dim: true }}>Use j/k to navigate, Enter to open</text>
              </box>
            )}
          </box>
          {/* Minimap */}
          {showMinimap && filePath && content.length > 0 && !showPreview && (
            <Minimap
              content={content}
              scrollOffset={scrollOffset}
              viewHeight={viewHeight}
              cursorLine={cursorLine}
              height={minimapHeight}
              width={10}
            />
          )}
        </box>
      )}

      {/* Search Bar - Docked */}
      <SearchBar
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        content={content}
        onJumpToLine={handleJumpToLine}
        mode={searchMode}
      />
    </box>
  );
}
