import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { tokenizeLine, detectLanguage, getTokenColor, type Token, DARK_THEME } from "../lib/SyntaxHighlighter";
import { SearchBar } from "./SearchBar";
import { Minimap } from "./Minimap";
import { MarkdownPreview } from "./MarkdownPreview";
import { FindReplace } from "./FindReplace";
import { findMatchingBracket, isBracket, type BracketMatch } from "../lib/BracketMatcher";
import { findDefinition, getWordAtPosition, type SymbolLocation } from "../lib/SymbolFinder";
import { detectFoldableRegions, getFoldMarker, toggleFold, foldAll, unfoldAll, type FoldableRegion } from "../lib/CodeFolding";
import { getGitBlame, getBlameAnnotation, getBlameColor, type BlameLine } from "../lib/GitBlame";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
  height: number;
  onJumpToFile?: (filePath: string, line?: number) => void;
  onCursorChange?: (line: number, column: number) => void;
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

// Props for bracket highlighting
interface HighlightedLineProps {
  line: string;
  lang: string | null;
  showGuides?: boolean;
  tabSize?: number;
  bracketHighlight?: number; // Column to highlight as matching bracket
}

// Component to render a line with syntax highlighting
function HighlightedLine({ line, lang, showGuides = false, tabSize = 2, bracketHighlight }: HighlightedLineProps) {
  const tokens = useMemo(() => tokenizeLine(line, lang), [line, lang]);

  // Calculate indent and strip leading whitespace for guides
  const indentLevel = getIndentLevel(line, tabSize);
  const leadingSpaces = line.match(/^[\s]*/)?.[0].length || 0;
  const trimmedLine = line.slice(leadingSpaces);

  // Helper to render tokens with bracket highlighting
  const renderTokens = (tokensToRender: Token[], offset: number = 0) => {
    const result: React.ReactNode[] = [];
    let currentCol = offset;

    for (let idx = 0; idx < tokensToRender.length; idx++) {
      const token = tokensToRender[idx]!;
      const tokenStart = currentCol;
      const tokenEnd = currentCol + token.text.length;

      // Check if bracket highlight falls within this token
      if (bracketHighlight !== undefined && bracketHighlight >= tokenStart && bracketHighlight < tokenEnd) {
        const relativePos = bracketHighlight - tokenStart;
        // Split token into before, highlighted char, and after
        const before = token.text.slice(0, relativePos);
        const highlighted = token.text[relativePos];
        const after = token.text.slice(relativePos + 1);

        if (before) {
          result.push(
            <text key={`${idx}-before`} style={{ fg: getTokenColor(token.type) as any }}>
              {before}
            </text>
          );
        }
        result.push(
          <text key={`${idx}-hl`} style={{ fg: "black", bg: "yellow", bold: true }}>
            {highlighted}
          </text>
        );
        if (after) {
          result.push(
            <text key={`${idx}-after`} style={{ fg: getTokenColor(token.type) as any }}>
              {after}
            </text>
          );
        }
      } else {
        result.push(
          <text key={idx} style={{ fg: getTokenColor(token.type) as any }}>
            {token.text}
          </text>
        );
      }

      currentCol = tokenEnd;
    }

    return result;
  };

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
          {renderTokens(tokenizeLine(trimmedLine, lang), leadingSpaces)}
        </>
      ) : (
        renderTokens(tokens, 0)
      )}
    </>
  );
}

export function FileViewer({ filePath, focused, rootPath, height, onJumpToFile, onCursorChange }: FileViewerProps) {
  const [content, setContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorColumn, setCursorColumn] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<"search" | "goto">("search");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [definitionHighlight, setDefinitionHighlight] = useState<SymbolLocation | null>(null);

  // Line selection state
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [clipboard, setClipboard] = useState<string[]>([]);
  const [showIndentGuides, setShowIndentGuides] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // Code folding state
  const [foldedRegions, setFoldedRegions] = useState<Set<number>>(new Set());

  // Git blame state
  const [showBlame, setShowBlame] = useState(false);
  const [blameData, setBlameData] = useState<BlameLine[]>([]);

  // Relative line numbers state
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(false);

  // Notify parent of cursor position changes
  useEffect(() => {
    if (onCursorChange && filePath) {
      onCursorChange(cursorLine + 1, cursorColumn + 1); // 1-indexed for display
    }
  }, [cursorLine, cursorColumn, onCursorChange, filePath]);

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

  // Find matching bracket for the current cursor line
  // Check first bracket on line or last bracket before cursor position
  const bracketMatch = useMemo((): BracketMatch | null => {
    if (content.length === 0) return null;
    const line = content[cursorLine];
    if (!line) return null;

    // Find the first bracket on the line
    for (let col = 0; col < line.length; col++) {
      if (isBracket(line[col]!)) {
        const match = findMatchingBracket(content, cursorLine, col);
        if (match) return match;
      }
    }
    return null;
  }, [content, cursorLine]);

  // Detect foldable regions
  const foldableRegions = useMemo((): FoldableRegion[] => {
    if (content.length === 0) return [];
    return detectFoldableRegions(content, language);
  }, [content, language]);

  // Handle toggling fold at cursor line
  const handleToggleFold = useCallback(() => {
    const region = foldableRegions.find((r) => r.startLine === cursorLine);
    if (region) {
      setFoldedRegions(toggleFold(cursorLine, foldableRegions, foldedRegions));
    }
  }, [cursorLine, foldableRegions, foldedRegions]);

  // Handle folding all regions
  const handleFoldAll = useCallback(() => {
    setFoldedRegions(foldAll(foldableRegions));
  }, [foldableRegions]);

  // Handle unfolding all regions
  const handleUnfoldAll = useCallback(() => {
    setFoldedRegions(unfoldAll());
  }, []);

  // Handle jumping to a line (from search or goto)
  const handleJumpToLine = (lineIndex: number) => {
    setCursorLine(lineIndex);
    // Center the line in view
    const newOffset = Math.max(0, Math.min(lineIndex - Math.floor(viewHeight / 2), Math.max(0, content.length - viewHeight)));
    setScrollOffset(newOffset);
  };

  // Handle replacing content from Find & Replace
  const handleReplaceContent = useCallback((newContent: string) => {
    if (!filePath) return;
    try {
      fs.writeFileSync(filePath, newContent, "utf-8");
      setContent(newContent.split("\n"));
    } catch (e) {
      console.error("Error saving file:", e);
    }
  }, [filePath]);

  // Get selected lines range
  const getSelectedRange = useCallback(() => {
    if (selectionStart === null) return null;
    const start = Math.min(selectionStart, selectionEnd ?? cursorLine);
    const end = Math.max(selectionStart, selectionEnd ?? cursorLine);
    return { start, end };
  }, [selectionStart, selectionEnd, cursorLine]);

  // Copy selected lines to clipboard
  const copySelectedLines = useCallback(() => {
    const range = getSelectedRange();
    if (!range) {
      // Copy current line if no selection
      const line = content[cursorLine];
      if (line !== undefined) {
        setClipboard([line]);
        // Also copy to system clipboard using OSC52
        const base64 = Buffer.from(line).toString("base64");
        process.stdout.write(`\x1b]52;c;${base64}\x07`);
      }
      return;
    }
    const lines = content.slice(range.start, range.end + 1);
    setClipboard(lines);
    // Copy to system clipboard
    const text = lines.join("\n");
    const base64 = Buffer.from(text).toString("base64");
    process.stdout.write(`\x1b]52;c;${base64}\x07`);
  }, [content, cursorLine, getSelectedRange]);

  // Cut selected lines
  const cutSelectedLines = useCallback(() => {
    if (!filePath) return;
    const range = getSelectedRange();
    const startLine = range ? range.start : cursorLine;
    const endLine = range ? range.end : cursorLine;

    const linesToCut = content.slice(startLine, endLine + 1);
    setClipboard(linesToCut);

    // Copy to system clipboard
    const text = linesToCut.join("\n");
    const base64 = Buffer.from(text).toString("base64");
    process.stdout.write(`\x1b]52;c;${base64}\x07`);

    // Remove lines from content
    const newContent = [...content.slice(0, startLine), ...content.slice(endLine + 1)];
    if (newContent.length === 0) newContent.push("");

    try {
      fs.writeFileSync(filePath, newContent.join("\n"), "utf-8");
      setContent(newContent);
      setCursorLine(Math.min(startLine, newContent.length - 1));
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (e) {
      console.error("Error cutting lines:", e);
    }
  }, [filePath, content, cursorLine, getSelectedRange]);

  // Paste clipboard lines
  const pasteLines = useCallback(() => {
    if (!filePath || clipboard.length === 0) return;

    const insertAt = cursorLine + 1;
    const newContent = [
      ...content.slice(0, insertAt),
      ...clipboard,
      ...content.slice(insertAt),
    ];

    try {
      fs.writeFileSync(filePath, newContent.join("\n"), "utf-8");
      setContent(newContent);
      setCursorLine(insertAt + clipboard.length - 1);
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (e) {
      console.error("Error pasting lines:", e);
    }
  }, [filePath, content, cursorLine, clipboard]);

  // Duplicate current line or selection
  const duplicateLines = useCallback(() => {
    if (!filePath) return;
    const range = getSelectedRange();
    const startLine = range ? range.start : cursorLine;
    const endLine = range ? range.end : cursorLine;

    const linesToDupe = content.slice(startLine, endLine + 1);
    const newContent = [
      ...content.slice(0, endLine + 1),
      ...linesToDupe,
      ...content.slice(endLine + 1),
    ];

    try {
      fs.writeFileSync(filePath, newContent.join("\n"), "utf-8");
      setContent(newContent);
      setCursorLine(endLine + linesToDupe.length);
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (e) {
      console.error("Error duplicating lines:", e);
    }
  }, [filePath, content, cursorLine, getSelectedRange]);

  // Delete current line or selection
  const deleteLines = useCallback(() => {
    if (!filePath) return;
    const range = getSelectedRange();
    const startLine = range ? range.start : cursorLine;
    const endLine = range ? range.end : cursorLine;

    const newContent = [...content.slice(0, startLine), ...content.slice(endLine + 1)];
    if (newContent.length === 0) newContent.push("");

    try {
      fs.writeFileSync(filePath, newContent.join("\n"), "utf-8");
      setContent(newContent);
      setCursorLine(Math.min(startLine, newContent.length - 1));
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (e) {
      console.error("Error deleting lines:", e);
    }
  }, [filePath, content, cursorLine, getSelectedRange]);

  // Go to definition of symbol at cursor
  const goToDefinition = useCallback(() => {
    if (!filePath || content.length === 0) return;

    const line = content[cursorLine];
    if (!line) return;

    // Get word at cursor position
    const wordInfo = getWordAtPosition(line, cursorColumn);
    if (!wordInfo) return;

    const currentContent = content.join("\n");
    const definition = findDefinition(currentContent, filePath, wordInfo.word);

    if (definition) {
      if (definition.filePath === filePath) {
        // Jump within same file
        handleJumpToLine(definition.line);
        setCursorColumn(definition.column);
        // Briefly highlight the definition
        setDefinitionHighlight(definition);
        setTimeout(() => setDefinitionHighlight(null), 1500);
      } else if (onJumpToFile) {
        // Jump to different file
        onJumpToFile(definition.filePath, definition.line);
      }
    }
  }, [filePath, content, cursorLine, cursorColumn, handleJumpToLine, onJumpToFile]);

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

  // Load git blame data when enabled
  useEffect(() => {
    if (!showBlame || !filePath) {
      setBlameData([]);
      return;
    }

    // Load blame data asynchronously
    const blame = getGitBlame(filePath);
    setBlameData(blame);
  }, [showBlame, filePath]);

  useKeyboard((event) => {
    if (!focused) return;

    if (showSearch || showFindReplace) return;

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

    // Find & Replace (Ctrl+H)
    if (event.ctrl && event.name === "h") {
      setShowFindReplace(true);
      return;
    }

    // Go to definition (F12)
    if (event.name === "f12") {
      goToDefinition();
      return;
    }

    // Code folding: z = toggle fold, zM = fold all, zR = unfold all
    if (event.name === "z" && !event.ctrl && !event.meta && !event.alt) {
      handleToggleFold();
      return;
    }
    if ((event.shift && event.name === "z") || event.name === "Z") {
      // Shift+Z = fold all
      handleFoldAll();
      return;
    }
    if (event.alt && event.name === "z") {
      // Alt+Z = unfold all
      handleUnfoldAll();
      return;
    }

    // Git blame: Ctrl+Shift+G
    if (event.ctrl && event.shift && (event.name === "g" || event.name === "G")) {
      setShowBlame((v) => !v);
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

    // Alt+L - Toggle relative line numbers
    if (event.alt && event.name === "l") {
      setRelativeLineNumbers((v) => !v);
      return;
    }

    if (event.meta && event.name === "p") {
      if (isMarkdown) {
        setShowPreview((v) => !v);
      }
      return;
    }

    // Line editing operations
    // V = Start visual selection (vim-style)
    if (event.name === "v" || event.name === "V") {
      if (selectionStart === null) {
        setSelectionStart(cursorLine);
        setSelectionEnd(cursorLine);
      } else {
        // Clear selection
        setSelectionStart(null);
        setSelectionEnd(null);
      }
      return;
    }

    // Shift+Up/Down = Extend selection
    if (event.shift && (event.name === "up" || event.name === "k")) {
      if (selectionStart === null) {
        setSelectionStart(cursorLine);
      }
      const newLine = Math.max(0, cursorLine - 1);
      setSelectionEnd(newLine);
      setCursorLine(newLine);
      return;
    }

    if (event.shift && (event.name === "down" || event.name === "j")) {
      if (selectionStart === null) {
        setSelectionStart(cursorLine);
      }
      const newLine = Math.min(content.length - 1, cursorLine + 1);
      setSelectionEnd(newLine);
      setCursorLine(newLine);
      return;
    }

    // Ctrl+C or y = Copy line(s)
    if ((event.ctrl && event.name === "c") || event.name === "y") {
      copySelectedLines();
      return;
    }

    // Ctrl+X or d+d = Cut/delete line(s)
    if (event.ctrl && event.name === "x") {
      cutSelectedLines();
      return;
    }

    // Ctrl+V or p = Paste line(s)
    if ((event.ctrl && event.name === "v") || event.name === "p") {
      pasteLines();
      return;
    }

    // Ctrl+D = Duplicate line(s)
    if (event.ctrl && event.name === "d") {
      duplicateLines();
      return;
    }

    // Ctrl+Shift+K or dd = Delete line(s)
    if (event.ctrl && event.shift && event.name === "k") {
      deleteLines();
      return;
    }

    // Escape = Clear selection
    if (event.name === "escape" && selectionStart !== null) {
      setSelectionStart(null);
      setSelectionEnd(null);
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
    } else if (event.name === "left" || event.name === "h") {
      // Move cursor left
      const line = content[cursorLine] || "";
      setCursorColumn(Math.max(0, cursorColumn - 1));
    } else if (event.name === "right" || event.name === "l") {
      // Move cursor right
      const line = content[cursorLine] || "";
      setCursorColumn(Math.min(line.length, cursorColumn + 1));
    } else if (event.name === "home" || event.name === "0") {
      // Go to start of line
      setCursorColumn(0);
    } else if (event.name === "end" || event.name === "$") {
      // Go to end of line
      const line = content[cursorLine] || "";
      setCursorColumn(line.length);
    } else if (event.name === "w") {
      // Jump to next word
      const line = content[cursorLine] || "";
      const rest = line.slice(cursorColumn);
      const match = rest.match(/^\s*\w+\s*/);
      if (match) {
        setCursorColumn(Math.min(line.length, cursorColumn + match[0].length));
      }
    } else if (event.name === "b") {
      // Jump to previous word
      const line = content[cursorLine] || "";
      const before = line.slice(0, cursorColumn);
      const match = before.match(/\s*\w+\s*$/);
      if (match) {
        setCursorColumn(Math.max(0, cursorColumn - match[0].length));
      }
    }
  });

  const visibleLines = content.slice(scrollOffset, scrollOffset + viewHeight);
  const fileName = filePath ? path.basename(filePath) : "No file selected";
  const borderColor = focused ? "cyan" : "gray";
  const lineNumWidth = Math.max(4, String(content.length).length);

  // Get file type indicator
  const langIndicator = language ? language.toUpperCase() : "";

  // Mouse scroll handler - at top level so it works anywhere in the viewer
  const handleMouseScroll = (event: any) => {
    if (event.action === "wheel") {
      if (event.direction === "up") {
        const newOffset = Math.max(0, scrollOffset - 3);
        setScrollOffset(newOffset);
        if (cursorLine >= newOffset + viewHeight) {
          setCursorLine(newOffset + viewHeight - 1);
        }
      } else if (event.direction === "down") {
        const maxOffset = Math.max(0, content.length - viewHeight);
        const newOffset = Math.min(maxOffset, scrollOffset + 3);
        setScrollOffset(newOffset);
        if (cursorLine < newOffset) {
          setCursorLine(newOffset);
        }
      }
    }
  };

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}
      onMouse={handleMouseScroll}
    >
      {/* Header with Breadcrumbs and status indicators */}
      <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1, flexShrink: 1 }}>
          {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
          {filePath ? (
            <box style={{ flexShrink: 1 }}><Breadcrumbs filePath={filePath} rootPath={rootPath} /></box>
          ) : (
            <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
          )}
          <box style={{ flexDirection: "row", flexShrink: 0 }}>
            {langIndicator && <text style={{ fg: "#d4a800", dim: true }}> [{langIndicator}]</text>}
            {wordWrap && <text style={{ fg: "#d4a800", dim: true }}> [wrap]</text>}
            {showIndentGuides && <text style={{ fg: "gray", dim: true }}> [guides]</text>}
            {showMinimap && <text style={{ fg: "blue", dim: true }}> [map]</text>}
            {relativeLineNumbers && <text style={{ fg: "yellow", dim: true }}> [rel]</text>}
            {foldedRegions.size > 0 && <text style={{ fg: "cyan", dim: true }}> [{foldedRegions.size} folded]</text>}
            {showBlame && <text style={{ fg: "magenta", dim: true }}> [blame]</text>}
            {isMarkdown && (
              <text style={{ fg: showPreview ? "#d4a800" : "gray", dim: !showPreview }}>
                {showPreview ? " [preview]" : " [Alt+P preview]"}
              </text>
            )}
          </box>
        </box>
        <text style={{ fg: "gray", flexShrink: 0 }}>
          Ln {cursorLine + 1}:{cursorColumn + 1}/{content.length}
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
        <box
          style={{ flexDirection: "row", flexGrow: 1, position: "relative" }}
          onMouse={handleMouseScroll}
        >
          <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1, flexGrow: 1, height: viewHeight, overflow: "hidden" }}>
            {filePath ? (
              visibleLines.map((line, index) => {
                const lineNum = scrollOffset + index + 1;
                const actualLineNum = scrollOffset + index;
                const isCurrentLine = actualLineNum === cursorLine;

                // Check if this line is in the selection range
                let isSelected = false;
                if (selectionStart !== null) {
                  const selStart = Math.min(selectionStart, selectionEnd ?? cursorLine);
                  const selEnd = Math.max(selectionStart, selectionEnd ?? cursorLine);
                  isSelected = actualLineNum >= selStart && actualLineNum <= selEnd;
                }

                const lineNumFg = isCurrentLine ? "yellow" : isSelected ? "cyan" : "gray";
                const lineBg = isSelected ? "#2a2a4a" : (isCurrentLine && focused ? "#1a1a1a" : undefined);

                // Check if line is inside a folded region (skip rendering)
                const isInsideFold = Array.from(foldedRegions).some((startLine) => {
                  const region = foldableRegions.find((r) => r.startLine === startLine);
                  return region && actualLineNum > startLine && actualLineNum <= region.endLine;
                });
                if (isInsideFold) return null;

                // Get fold marker for this line
                const foldMarker = getFoldMarker(actualLineNum, foldableRegions, foldedRegions);
                const foldIndicator = foldMarker === "collapsed" ? "▶" : foldMarker === "expanded" ? "▼" : " ";
                const foldColor = foldMarker !== "none" ? "cyan" : "gray";

                // Determine bracket highlight for this line
                let bracketHighlightCol: number | undefined;
                if (bracketMatch) {
                  if (actualLineNum === bracketMatch.openLine) {
                    bracketHighlightCol = bracketMatch.openColumn;
                  } else if (actualLineNum === bracketMatch.closeLine) {
                    bracketHighlightCol = bracketMatch.closeColumn;
                  }
                }

                // Handle word wrap
                if (wordWrap && line.length > wrapWidth) {
                  const wrappedLines = wrapLine(line, wrapWidth);
                  // Calculate display line number for relative mode
                  const wrapDisplayNum = relativeLineNumbers && !isCurrentLine
                    ? Math.abs(actualLineNum - cursorLine)
                    : lineNum;
                  return (
                    <box key={index} style={{ flexDirection: "column", overflow: "hidden" }}>
                      {wrappedLines.map((wrappedLine, wrapIdx) => (
                        <box key={wrapIdx} style={{ flexDirection: "row", bg: lineBg as any, overflow: "hidden" }}>
                          <text style={{ fg: lineNumFg as any, bold: isCurrentLine && wrapIdx === 0, flexShrink: 0 }}>
                            {wrapIdx === 0
                              ? `${String(wrapDisplayNum).padStart(lineNumWidth, " ")}${isCurrentLine ? " ▸ " : "   "}`
                              : `${" ".repeat(lineNumWidth)}   ↪ `}
                          </text>
                          <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden" }}>
                            <HighlightedLine line={wrappedLine} lang={language} showGuides={showIndentGuides} tabSize={tabSize} bracketHighlight={bracketHighlightCol} />
                          </box>
                        </box>
                      ))}
                    </box>
                  );
                }

                // Show fold count for collapsed lines
                const foldInfo = foldMarker === "collapsed" ?
                  foldableRegions.find((r) => r.startLine === actualLineNum) : null;
                const foldedCount = foldInfo ? foldInfo.endLine - foldInfo.startLine : 0;

                // Get blame info for this line
                const blameLine = showBlame && blameData[actualLineNum];
                const blameAnnotation = blameLine ? getBlameAnnotation(blameLine) : "";
                const blameColor = blameLine ? getBlameColor(blameLine.date) : "gray";

                // Calculate display line number (absolute or relative)
                const displayLineNum = relativeLineNumbers && !isCurrentLine
                  ? Math.abs(actualLineNum - cursorLine)
                  : lineNum;

                return (
                  <box key={index} style={{ flexDirection: "row", bg: lineBg as any, overflow: "hidden" }}>
                    <text style={{ fg: foldColor as any, flexShrink: 0 }}>{foldIndicator}</text>
                    {showBlame && (
                      <text style={{ fg: blameColor as any, dim: true, flexShrink: 0 }}>
                        {blameAnnotation ? blameAnnotation.padEnd(12) : "            "}
                      </text>
                    )}
                    <text style={{ fg: lineNumFg as any, bold: isCurrentLine, flexShrink: 0 }}>
                      {String(displayLineNum).padStart(lineNumWidth, " ")}{isCurrentLine ? " ▸ " : "   "}
                    </text>
                    <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden", paddingRight: 1 }}>
                      <HighlightedLine line={line} lang={language} showGuides={showIndentGuides} tabSize={tabSize} bracketHighlight={bracketHighlightCol} />
                      {foldMarker === "collapsed" && (
                        <text style={{ fg: "gray", dim: true }}> ⋯ ({foldedCount} lines)</text>
                      )}
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

          {/* Scrollbar */}
          {content.length > viewHeight && (
            <box style={{ width: 1, height: viewHeight, flexDirection: "column", bg: "#050505", borderLeft: true, borderColor: "gray", dim: true }}>
              {(() => {
                const scrollPercentage = scrollOffset / (content.length - viewHeight);
                const thumbHeight = Math.max(1, Math.floor((viewHeight / content.length) * viewHeight));
                const thumbPos = Math.floor(scrollPercentage * (viewHeight - thumbHeight));

                return Array.from({ length: viewHeight }).map((_, i) => {
                  const isThumb = i >= thumbPos && i < thumbPos + thumbHeight;
                  return (
                    <text key={i} style={{ fg: isThumb ? "cyan" : "gray", dim: !isThumb }}>
                      {isThumb ? "█" : "│"}
                    </text>
                  );
                });
              })()}
            </box>
          )}

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

      {/* Find & Replace Modal */}
      <FindReplace
        isOpen={showFindReplace}
        onClose={() => setShowFindReplace(false)}
        content={content.join("\n")}
        onReplace={handleReplaceContent}
        filePath={filePath}
      />
    </box>
  );
}
