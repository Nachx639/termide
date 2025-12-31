import React, { useState, useEffect, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { tokenizeLine, detectLanguage, getTokenColor, Token, DARK_THEME } from "../lib/SyntaxHighlighter";
import { SearchBar } from "./SearchBar";
import { Minimap } from "./Minimap";
import { MarkdownPreview } from "./MarkdownPreview";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
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

export function FileViewer({ filePath, focused, rootPath }: FileViewerProps) {
  const [content, setContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<"search" | "goto">("search");
  const [wordWrap, setWordWrap] = useState(false);
  const [showIndentGuides, setShowIndentGuides] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const viewHeight = 20;
  const wrapWidth = 80; // Characters per line when wrapping
  const tabSize = 2;
  const minimapHeight = 15;

  // Check if current file is markdown
  const isMarkdown = filePath?.toLowerCase().endsWith(".md") || filePath?.toLowerCase().endsWith(".markdown");

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
      // Fallback if watch fails (some OS or file systems)
      console.error("Watcher error:", e);
    }
  }, [filePath]);


  useKeyboard((event) => {
    if (!focused) return;

    // Don't handle if search is open
    if (showSearch) return;

    // Ctrl+F - Open search
    if (event.ctrl && event.name === "f") {
      setSearchMode("search");
      setShowSearch(true);
      return;
    }

    // Ctrl+G - Go to line
    if (event.ctrl && event.name === "g") {
      setSearchMode("goto");
      setShowSearch(true);
      return;
    }

    // Alt+Z - Toggle word wrap
    if (event.meta && event.name === "z") {
      setWordWrap((w) => !w);
      return;
    }

    // Alt+I - Toggle indent guides
    if (event.meta && event.name === "i") {
      setShowIndentGuides((v) => !v);
      return;
    }

    // Alt+M - Toggle minimap
    if (event.meta && event.name === "m") {
      setShowMinimap((v) => !v);
      return;
    }

    // Alt+P - Toggle markdown preview
    if (event.meta && event.name === "p") {
      if (isMarkdown) {
        setShowPreview((v) => !v);
      }
      return;
    }

    // Don't handle navigation keys if in preview mode
    if (showPreview) return;

    if (event.name === "up" || event.name === "k") {
      setCursorLine((l) => Math.max(0, l - 1));
      // Auto-scroll if cursor goes above visible area
      setScrollOffset((o) => {
        const newCursor = Math.max(0, cursorLine - 1);
        if (newCursor < o) return newCursor;
        return o;
      });
    } else if (event.name === "down" || event.name === "j") {
      setCursorLine((l) => Math.min(content.length - 1, l + 1));
      // Auto-scroll if cursor goes below visible area
      setScrollOffset((o) => {
        const newCursor = Math.min(content.length - 1, cursorLine + 1);
        if (newCursor >= o + viewHeight) return newCursor - viewHeight + 1;
        return o;
      });
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
      <box style={{ paddingX: 1, justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          {filePath ? (
            <Breadcrumbs filePath={filePath} rootPath={rootPath} />
          ) : (
            <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
          )}
          {langIndicator && <text style={{ fg: "yellow", dim: true }}> [{langIndicator}]</text>}
          {wordWrap && <text style={{ fg: "magenta", dim: true }}> [wrap]</text>}
          {showIndentGuides && <text style={{ fg: "gray", dim: true }}> [guides]</text>}
          {showMinimap && <text style={{ fg: "blue", dim: true }}> [map]</text>}
          {isMarkdown && (
            <text style={{ fg: showPreview ? "magenta" : "gray", dim: !showPreview }}>
              {showPreview ? " [preview]" : " [Alt+P preview]"}
            </text>
          )}
        </box>
        <text style={{ fg: "gray" }}>
          {filePath ? `Ln ${cursorLine + 1}/${content.length}` : ""}
        </text>
      </box>
      {/* Show markdown preview or code view */}
      {showPreview && isMarkdown ? (
        <MarkdownPreview
          filePath={filePath}
          focused={focused}
          rootPath={rootPath}
        />
      ) : (
        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          <scrollbox style={{ flexDirection: "column", paddingX: 1, flexGrow: 1 }}>
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
                    <box key={index} style={{ flexDirection: "column" }}>
                      {wrappedLines.map((wrappedLine, wrapIdx) => (
                        <box key={wrapIdx} style={{ flexDirection: "row", bg: lineBg as any }}>
                          <text style={{ fg: lineNumFg as any, bold: isCurrentLine && wrapIdx === 0 }}>
                            {wrapIdx === 0
                              ? `${String(lineNum).padStart(lineNumWidth, " ")}${isCurrentLine ? " ▸ " : "   "}`
                              : `${" ".repeat(lineNumWidth)}   ↪ `}
                          </text>
                          <HighlightedLine line={wrappedLine} lang={language} showGuides={showIndentGuides} tabSize={tabSize} />
                        </box>
                      ))}
                    </box>
                  );
                }

                return (
                  <box key={index} style={{ flexDirection: "row", bg: lineBg as any }}>
                    <text style={{ fg: lineNumFg as any, bold: isCurrentLine }}>
                      {String(lineNum).padStart(lineNumWidth, " ")}{isCurrentLine ? " ▸ " : "   "}
                    </text>
                    <HighlightedLine line={line} lang={language} showGuides={showIndentGuides} tabSize={tabSize} />
                  </box>
                );
              })
            ) : (
              <box style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1 }}>
                <text style={{ fg: "gray" }}>Select a file from the explorer</text>
                <text style={{ fg: "gray", dim: true }}>Use j/k to navigate, Enter to open</text>
              </box>
            )}
          </scrollbox>
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

      {/* Search Bar */}
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
