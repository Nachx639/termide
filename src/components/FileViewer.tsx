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
import { findDefinition, getWordAtPosition, getAllSymbols, type SymbolLocation } from "../lib/SymbolFinder";
import { SymbolPicker } from "./SymbolPicker";
import { detectFoldableRegions, getFoldMarker, toggleFold, foldAll, unfoldAll, type FoldableRegion } from "../lib/CodeFolding";
import { getGitBlame, getBlameAnnotation, getBlameColor, type BlameLine } from "../lib/GitBlame";
import { getFileLineDiffs, getLineDiffIndicator, type LineDiffInfo } from "../lib/GitIntegration";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
  height: number;
  onJumpToFile?: (filePath: string, line?: number) => void;
  onCursorChange?: (line: number, column: number) => void;
  onSelectionChange?: (selectedText: string) => void; // Report selection for Cmd+C copy
  initialLine?: number; // Line to jump to when file is opened
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
  wordHighlight?: string | null; // Word to highlight all occurrences
  wordHighlightOccurrences?: Array<number>; // Column positions of occurrences on this line
  currentWordOccurrence?: number | null; // The current occurrence column (for extra emphasis)
}

// Component to render a line with syntax highlighting
function HighlightedLine({ line, lang, showGuides = false, tabSize = 2, bracketHighlight, wordHighlight, wordHighlightOccurrences, currentWordOccurrence }: HighlightedLineProps) {
  const tokens = useMemo(() => tokenizeLine(line, lang), [line, lang]);

  // Build a set of columns that are part of word highlight occurrences
  const highlightRanges = useMemo(() => {
    if (!wordHighlight || !wordHighlightOccurrences || wordHighlightOccurrences.length === 0) return null;
    const ranges: Array<{ start: number; end: number; isCurrent: boolean }> = [];
    for (const col of wordHighlightOccurrences) {
      ranges.push({
        start: col,
        end: col + wordHighlight.length,
        isCurrent: col === currentWordOccurrence,
      });
    }
    return ranges;
  }, [wordHighlight, wordHighlightOccurrences, currentWordOccurrence]);

  // Calculate indent and strip leading whitespace for guides
  const indentLevel = getIndentLevel(line, tabSize);
  const leadingSpaces = line.match(/^[\s]*/)?.[0].length || 0;
  const trimmedLine = line.slice(leadingSpaces);

  // Check if a column is within a word highlight range
  const getWordHighlightInfo = (col: number): { highlighted: boolean; isCurrent: boolean } | null => {
    if (!highlightRanges) return null;
    for (const range of highlightRanges) {
      if (col >= range.start && col < range.end) {
        return { highlighted: true, isCurrent: range.isCurrent };
      }
    }
    return null;
  };

  // Helper to render tokens with bracket and word highlighting
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
      } else if (highlightRanges && highlightRanges.length > 0) {
        // Check for word highlighting - need to render character by character for highlighted ranges
        let charIdx = 0;
        let segments: React.ReactNode[] = [];
        let segmentStart = 0;
        let currentHighlight: { highlighted: boolean; isCurrent: boolean } | null = null;

        while (charIdx <= token.text.length) {
          const absCol = tokenStart + charIdx;
          const newHighlight = charIdx < token.text.length ? getWordHighlightInfo(absCol) : null;

          const highlightChanged = (
            (currentHighlight === null && newHighlight !== null) ||
            (currentHighlight !== null && newHighlight === null) ||
            (currentHighlight !== null && newHighlight !== null && currentHighlight.isCurrent !== newHighlight.isCurrent)
          );

          if (highlightChanged || charIdx === token.text.length) {
            // Flush the current segment
            if (charIdx > segmentStart) {
              const segmentText = token.text.slice(segmentStart, charIdx);
              if (currentHighlight) {
                segments.push(
                  <text
                    key={`${idx}-seg-${segmentStart}`}
                    style={{
                      fg: currentHighlight.isCurrent ? "black" : getTokenColor(token.type) as any,
                      bg: currentHighlight.isCurrent ? "#569cd6" : "#3a3d41",
                      bold: currentHighlight.isCurrent,
                    }}
                  >
                    {segmentText}
                  </text>
                );
              } else {
                segments.push(
                  <text key={`${idx}-seg-${segmentStart}`} style={{ fg: getTokenColor(token.type) as any }}>
                    {segmentText}
                  </text>
                );
              }
            }
            segmentStart = charIdx;
            currentHighlight = newHighlight;
          }
          charIdx++;
        }
        result.push(...segments);
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

export function FileViewer({ filePath, focused, rootPath, height, onJumpToFile, onCursorChange, onSelectionChange, initialLine }: FileViewerProps) {
  const [content, setContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorColumn, setCursorColumn] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [initialLineHandled, setInitialLineHandled] = useState<number | null>(null);
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

  // Show/hide line numbers state
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Git gutter state (inline diff indicators)
  const [showGitGutter, setShowGitGutter] = useState(true);
  const [lineDiffs, setLineDiffs] = useState<Map<number, LineDiffInfo>>(new Map());

  // Symbol picker state (Ctrl+Shift+O)
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  // Multi-cursor / word highlight state (Ctrl+D)
  const [highlightedWord, setHighlightedWord] = useState<string | null>(null);
  const [wordOccurrences, setWordOccurrences] = useState<Array<{ line: number; column: number }>>([]);
  const [currentOccurrenceIndex, setCurrentOccurrenceIndex] = useState(0);

  // Sticky Scroll state
  const [showStickyScroll, setShowStickyScroll] = useState(true);

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

  // Compute sticky scroll context - shows parent function/class headers
  const stickyScrollContext = useMemo(() => {
    if (!showStickyScroll || content.length === 0) return [];

    const contexts: Array<{ line: number; text: string; kind: string }> = [];

    // Find all scope-defining lines that are above the current scroll position
    // but whose scope includes the visible area
    const scopePatterns = [
      { regex: /^(export\s+)?(async\s+)?function\s+\w+/, kind: "function" },
      { regex: /^(export\s+)?class\s+\w+/, kind: "class" },
      { regex: /^(export\s+)?interface\s+\w+/, kind: "interface" },
      { regex: /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/, kind: "function" },
      { regex: /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?function/, kind: "function" },
      { regex: /^\s+(async\s+)?(?:public|private|protected)?\s*\w+\s*\([^)]*\)\s*[:{]/, kind: "method" },
    ];

    // Track nesting level using braces
    let braceCount = 0;
    const scopeStack: Array<{ line: number; text: string; kind: string; braceLevel: number }> = [];

    for (let i = 0; i < content.length && i <= scrollOffset + viewHeight; i++) {
      const line = content[i] || "";
      const trimmed = line.trim();

      // Count braces
      for (const char of line) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          // Pop scopes that have closed
          while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1]!.braceLevel >= braceCount) {
            scopeStack.pop();
          }
        }
      }

      // Check if this line starts a new scope
      for (const { regex, kind } of scopePatterns) {
        if (regex.test(trimmed)) {
          scopeStack.push({
            line: i,
            text: trimmed.slice(0, 60) + (trimmed.length > 60 ? "..." : ""),
            kind,
            braceLevel: braceCount
          });
          break;
        }
      }
    }

    // Return scopes that are above scroll offset but still open
    return scopeStack
      .filter(s => s.line < scrollOffset)
      .slice(-3) // Show at most 3 levels of context
      .map(s => ({ line: s.line, text: s.text, kind: s.kind }));
  }, [showStickyScroll, content, scrollOffset, viewHeight]);

  // Compute symbols for current file
  const fileSymbols = useMemo(() => {
    if (!filePath || content.length === 0) return [];
    return getAllSymbols(content.join("\n"), filePath);
  }, [filePath, content]);

  // Fetch git line diffs when file changes
  useEffect(() => {
    if (!filePath || !rootPath || !showGitGutter) {
      setLineDiffs(new Map());
      return;
    }

    const fetchLineDiffs = async () => {
      const diffs = await getFileLineDiffs(filePath, rootPath);
      const diffMap = new Map<number, LineDiffInfo>();
      for (const diff of diffs) {
        diffMap.set(diff.lineNumber, diff);
      }
      setLineDiffs(diffMap);
    };

    fetchLineDiffs();
    // Refresh periodically
    const interval = setInterval(fetchLineDiffs, 5000);
    return () => clearInterval(interval);
  }, [filePath, rootPath, showGitGutter, content]);

  // Notify parent of cursor position changes
  useEffect(() => {
    if (onCursorChange && filePath) {
      onCursorChange(cursorLine + 1, cursorColumn + 1); // 1-indexed for display
    }
  }, [cursorLine, cursorColumn, onCursorChange, filePath]);

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


  // Copy to system clipboard with multiple fallbacks
  const copyToSystemClipboard = useCallback(async (text: string): Promise<boolean> => {
    // Try OSC52 first (works in iTerm2, Kitty, etc.)
    const base64 = Buffer.from(text).toString("base64");
    process.stdout.write(`\x1b]52;c;${base64}\x07`);

    // Also try pbcopy on macOS as fallback
    try {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited;
      return true;
    } catch {
      // pbcopy failed, OSC52 might still work
      return true;
    }
  }, []);

  // Copy selected lines to clipboard
  const copySelectedLines = useCallback(async () => {
    const range = getSelectedRange();
    let text: string;
    let lineCount: number;

    if (!range) {
      // Copy current line if no selection
      const line = content[cursorLine];
      if (line !== undefined) {
        setClipboard([line]);
        text = line;
        lineCount = 1;
      } else {
        return;
      }
    } else {
      const lines = content.slice(range.start, range.end + 1);
      setClipboard(lines);
      text = lines.join("\n");
      lineCount = lines.length;
    }

    await copyToSystemClipboard(text);

    // Clear selection after copy and show feedback via console (notification would need prop)
    setSelectionStart(null);
    setSelectionEnd(null);
    console.log(`✓ Copied ${lineCount} line${lineCount > 1 ? "s" : ""} to clipboard`);
  }, [content, cursorLine, getSelectedRange, copyToSystemClipboard]);

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

  // Jump to initial line when specified and content is loaded
  useEffect(() => {
    if (initialLine !== undefined && initialLine !== initialLineHandled && content.length > 0) {
      // Use the handleJumpToLine function to scroll to the line
      const targetLine = Math.max(0, Math.min(initialLine, content.length - 1));
      setCursorLine(targetLine);
      setCursorColumn(0);
      // Center the line in the view
      const centerOffset = Math.max(0, targetLine - Math.floor(viewHeight / 2));
      setScrollOffset(Math.min(centerOffset, Math.max(0, content.length - viewHeight)));
      setInitialLineHandled(initialLine);
    }
  }, [initialLine, initialLineHandled, content.length, viewHeight]);

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

  // Handle symbol selection - jump to symbol's line
  const handleSymbolSelect = useCallback((symbol: SymbolLocation) => {
    handleJumpToLine(symbol.line);
    setCursorColumn(symbol.column);
  }, [handleJumpToLine]);

  // Find all occurrences of a word in content
  const findWordOccurrences = useCallback((word: string): Array<{ line: number; column: number }> => {
    const occurrences: Array<{ line: number; column: number }> = [];
    const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

    for (let lineNum = 0; lineNum < content.length; lineNum++) {
      const line = content[lineNum]!;
      let match;
      while ((match = wordRegex.exec(line)) !== null) {
        occurrences.push({ line: lineNum, column: match.index });
      }
    }

    return occurrences;
  }, [content]);

  // Handle Ctrl+D - select word and find occurrences, or jump to next
  const handleSelectWord = useCallback(() => {
    if (!filePath || content.length === 0) return;

    const currentLine = content[cursorLine];
    if (!currentLine) return;

    // Get word at cursor
    const wordInfo = getWordAtPosition(currentLine, cursorColumn);
    if (!wordInfo) return;

    if (highlightedWord === wordInfo.word && wordOccurrences.length > 0) {
      // Already highlighting this word, jump to next occurrence
      const nextIndex = (currentOccurrenceIndex + 1) % wordOccurrences.length;
      setCurrentOccurrenceIndex(nextIndex);
      const nextOccurrence = wordOccurrences[nextIndex]!;
      handleJumpToLine(nextOccurrence.line);
      setCursorColumn(nextOccurrence.column);
    } else {
      // New word - find all occurrences
      const occurrences = findWordOccurrences(wordInfo.word);
      setHighlightedWord(wordInfo.word);
      setWordOccurrences(occurrences);

      // Find current occurrence index
      const currentIdx = occurrences.findIndex(
        occ => occ.line === cursorLine && occ.column >= wordInfo.startColumn && occ.column <= wordInfo.endColumn
      );
      setCurrentOccurrenceIndex(currentIdx >= 0 ? currentIdx : 0);
    }
  }, [filePath, content, cursorLine, cursorColumn, highlightedWord, wordOccurrences, currentOccurrenceIndex, findWordOccurrences, handleJumpToLine]);

  // Clear word highlight when cursor moves away from highlighted word or escape pressed
  useEffect(() => {
    if (!highlightedWord) return;

    const currentLine = content[cursorLine];
    if (!currentLine) {
      setHighlightedWord(null);
      setWordOccurrences([]);
      return;
    }

    const wordInfo = getWordAtPosition(currentLine, cursorColumn);
    if (!wordInfo || wordInfo.word !== highlightedWord) {
      // Don't clear immediately - only clear if we've moved to a different word
      // This allows jumping between occurrences
    }
  }, [cursorLine, cursorColumn, content, highlightedWord]);

  useKeyboard((event) => {
    if (!focused) return;

    if (showSearch || showFindReplace || showSymbolPicker) return;

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

    // Jump to Symbol (Ctrl+Shift+O or @)
    if ((event.ctrl && event.shift && (event.name === "o" || event.name === "O")) ||
      (event.name === "@" || (event.shift && event.name === "2"))) {
      if (filePath && fileSymbols.length > 0) {
        setShowSymbolPicker(true);
      }
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

    // Ctrl+W - Toggle word wrap
    if (event.ctrl && !event.shift && event.name === "w") {
      setWordWrap((w) => !w);
      return;
    }

    if (event.meta && event.name === "i") {
      setShowIndentGuides((v) => !v);
      return;
    }

    // Ctrl+E - Toggle minimap (E for Eye view)
    if (event.ctrl && !event.shift && event.name === "e") {
      setShowMinimap((v) => !v);
      return;
    }

    // Ctrl+N - Toggle line numbers visibility (N for Numbers)
    if (event.ctrl && !event.shift && event.name === "n") {
      setShowLineNumbers((v) => !v);
      return;
    }

    // Ctrl+R - Toggle relative line numbers
    if (event.ctrl && !event.shift && event.name === "r") {
      setRelativeLineNumbers((v) => !v);
      return;
    }

    // Ctrl+T - Toggle sticky scroll (T for Top context)
    if (event.ctrl && !event.shift && event.name === "t") {
      setShowStickyScroll((v) => !v);
      return;
    }

    // Ctrl+I - Toggle git gutter (I for Inline diff)
    if (event.ctrl && !event.shift && event.name === "i") {
      setShowGitGutter((v) => !v);
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

    // Ctrl+D = Select word and find occurrences (VSCode-style)
    if (event.ctrl && event.name === "d") {
      handleSelectWord();
      return;
    }

    // Alt+Shift+D = Duplicate line(s)
    if (event.alt && event.shift && (event.name === "d" || event.name === "D")) {
      duplicateLines();
      return;
    }

    // Ctrl+Shift+K or dd = Delete line(s)
    if (event.ctrl && event.shift && event.name === "k") {
      deleteLines();
      return;
    }

    // Escape = Clear selection and word highlight
    if (event.name === "escape") {
      if (highlightedWord) {
        setHighlightedWord(null);
        setWordOccurrences([]);
        setCurrentOccurrenceIndex(0);
        return;
      }
      if (selectionStart !== null) {
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }
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
    // OpenTUI scroll events have type "scroll" and scroll.direction
    if (event.type === "scroll" && event.scroll) {
      if (event.scroll.direction === "up") {
        const newOffset = Math.max(0, scrollOffset - 3);
        setScrollOffset(newOffset);
        if (cursorLine >= newOffset + viewHeight) {
          setCursorLine(newOffset + viewHeight - 1);
        }
      } else if (event.scroll.direction === "down") {
        const maxOffset = Math.max(0, content.length - viewHeight);
        const newOffset = Math.min(maxOffset, scrollOffset + 3);
        setScrollOffset(newOffset);
        if (cursorLine < newOffset) {
          setCursorLine(newOffset);
        }
      }
    }
    // Also support wheel action format for compatibility
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
      onMouseScroll={handleMouseScroll}
    >
      {/* Header with Breadcrumbs and status indicators */}
      <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1, flexShrink: 1 }}>
          {focused && <text style={{ fg: "black", bg: "cyan", bold: true }}> FOCUS </text>}
          {selectionStart !== null && <text style={{ fg: "black", bg: "yellow", bold: true }}> VISUAL </text>}
          {filePath ? (
            <box style={{ flexShrink: 1 }}><Breadcrumbs filePath={filePath} rootPath={rootPath} /></box>
          ) : (
            <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
          )}
          <box style={{ flexDirection: "row", flexShrink: 0 }}>
            {langIndicator && <text style={{ fg: "#d4a800", dim: true }}> [{langIndicator}]</text>}
            {wordWrap && <text style={{ fg: "#d4a800", dim: true }}> [wrap]</text>}
            {showIndentGuides && <text style={{ fg: "gray", dim: true }}> [guides]</text>}
            {showMinimap && <text style={{ fg: "#90EE90", dim: true }}> [map]</text>}
            {relativeLineNumbers && <text style={{ fg: "yellow", dim: true }}> [rel]</text>}
            {!showLineNumbers && <text style={{ fg: "gray", dim: true }}> [noln]</text>}
            {foldedRegions.size > 0 && <text style={{ fg: "cyan", dim: true }}> [{foldedRegions.size} folded]</text>}
            {showBlame && <text style={{ fg: "magenta", dim: true }}> [blame]</text>}
            {showGitGutter && lineDiffs.size > 0 && <text style={{ fg: "#4ec9b0", dim: true }}> [git]</text>}
            {showStickyScroll && <text style={{ fg: "#c586c0", dim: true }}> [sticky]</text>}
            {highlightedWord && <text style={{ fg: "#569cd6", dim: false }}> [{currentOccurrenceIndex + 1}/{wordOccurrences.length}]</text>}
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
          onMouseScroll={handleMouseScroll}
        >
          <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1, flexGrow: 1, height: viewHeight, overflow: "hidden" }} onMouse={handleMouseScroll} onMouseScroll={handleMouseScroll}>
            {/* Sticky Scroll Context - shows parent function/class headers */}
            {filePath && stickyScrollContext.length > 0 && (
              <box style={{ flexDirection: "column", bg: "#1e1e2e", borderBottom: true, borderColor: "gray" }}>
                {stickyScrollContext.map((ctx, idx) => {
                  const indent = "  ".repeat(idx);
                  const kindColor = ctx.kind === "class" ? "#4ec9b0" : ctx.kind === "function" || ctx.kind === "method" ? "#dcdcaa" : "#9cdcfe";
                  return (
                    <box key={`${ctx.line}-${idx}`} style={{ flexDirection: "row", paddingX: 1, bg: "#252530" }}>
                      <text style={{ fg: "gray", dim: true }}>{String(ctx.line + 1).padStart(lineNumWidth, " ")}  </text>
                      <text style={{ fg: "gray", dim: true }}>{indent}</text>
                      <text style={{ fg: kindColor as any }}>{ctx.text}</text>
                    </box>
                  );
                })}
              </box>
            )}
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

                // Get word highlight occurrences for this line
                const lineWordOccurrences = highlightedWord
                  ? wordOccurrences
                    .filter(occ => occ.line === actualLineNum)
                    .map(occ => occ.column)
                  : [];
                const currentOccurrence = wordOccurrences[currentOccurrenceIndex];
                const currentOccurrenceCol = currentOccurrence && currentOccurrence.line === actualLineNum
                  ? currentOccurrence.column
                  : null;

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
                          {showLineNumbers && (
                            <text style={{ fg: lineNumFg as any, bold: isCurrentLine && wrapIdx === 0, flexShrink: 0 }}>
                              {wrapIdx === 0
                                ? `${String(wrapDisplayNum).padStart(lineNumWidth, " ")}${isCurrentLine ? " ▸ " : "   "}`
                                : `${" ".repeat(lineNumWidth)}   ↪ `}
                            </text>
                          )}
                          <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden" }}>
                            <HighlightedLine
                              line={wrappedLine}
                              lang={language}
                              showGuides={showIndentGuides}
                              tabSize={tabSize}
                              bracketHighlight={bracketHighlightCol}
                              wordHighlight={highlightedWord}
                              wordHighlightOccurrences={lineWordOccurrences}
                              currentWordOccurrence={currentOccurrenceCol}
                            />
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

                // Get git gutter indicator for this line (1-indexed)
                const lineDiff = lineDiffs.get(lineNum);
                const gutterIndicator = lineDiff ? getLineDiffIndicator(lineDiff.status) : null;

                return (
                  <box key={index} style={{ flexDirection: "row", bg: lineBg as any, overflow: "hidden" }}>
                    {/* Git gutter indicator */}
                    {showGitGutter && (
                      <text style={{ fg: gutterIndicator?.color as any || "transparent", flexShrink: 0 }}>
                        {gutterIndicator?.char || " "}
                      </text>
                    )}
                    <text style={{ fg: foldColor as any, flexShrink: 0 }}>{foldIndicator}</text>
                    {showBlame && (
                      <text style={{ fg: blameColor as any, dim: true, flexShrink: 0 }}>
                        {blameAnnotation ? blameAnnotation.padEnd(12) : "            "}
                      </text>
                    )}
                    {showLineNumbers && (
                      <text style={{ fg: lineNumFg as any, bold: isCurrentLine, flexShrink: 0 }}>
                        {String(displayLineNum).padStart(lineNumWidth, " ")}{isCurrentLine ? " ▸ " : "   "}
                      </text>
                    )}
                    <box style={{ flexGrow: 1, flexShrink: 1, width: 0, flexDirection: "row", overflow: "hidden", paddingRight: 1 }}>
                      <HighlightedLine
                        line={line}
                        lang={language}
                        showGuides={showIndentGuides}
                        tabSize={tabSize}
                        bracketHighlight={bracketHighlightCol}
                        wordHighlight={highlightedWord}
                        wordHighlightOccurrences={lineWordOccurrences}
                        currentWordOccurrence={currentOccurrenceCol}
                      />
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
            <box style={{ width: 1, height: viewHeight, flexDirection: "column", bg: "#050505", borderLeft: true, borderColor: "gray", dim: true }} onMouse={handleMouseScroll} onMouseScroll={handleMouseScroll}>
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

      {/* Symbol Picker (Ctrl+Shift+O or @) */}
      <SymbolPicker
        symbols={fileSymbols}
        isOpen={showSymbolPicker}
        onClose={() => setShowSymbolPicker(false)}
        onSelect={handleSymbolSelect}
      />
    </box>
  );
}
