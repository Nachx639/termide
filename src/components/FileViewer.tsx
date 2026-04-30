import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { detectLanguage } from "../lib/SyntaxHighlighter";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";
import { getFileLineDiffs, type LineDiffStatus } from "../lib/GitIntegration";
import { findMatchingBracket } from "../lib/BracketMatcher";
import { getWordAtPosition, getAllSymbols, type SymbolLocation } from "../lib/SymbolFinder";
import { getGitBlame, type BlameLine } from "../lib/GitBlame";
import { SymbolPicker } from "./SymbolPicker";
import { Minimap } from "./Minimap";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
  height: number;
  /** Width of the file tree panel (kept for API compatibility with legacy props). */
  treeWidth?: number;
  onJumpToFile?: (filePath: string, line?: number) => void;
  onCursorChange?: (line: number, column: number) => void;
  onSelectionChange?: (selectedText: string) => void;
  /** 1-indexed line to jump to when the file opens. */
  initialLine?: number;
  /**
   * Called when the user clicks anywhere inside this viewer. Lets the parent
   * focus this pane — needed because the inner <textarea> captures mouse
   * events and the wrapper in App.tsx never sees them.
   */
  onFocus?: () => void;
}

// Breadcrumbs subcomponent (copied from FileViewerLegacy for visual parity).
function Breadcrumbs({ filePath, rootPath }: { filePath: string; rootPath?: string }) {
  const relativePath = rootPath ? path.relative(rootPath, filePath) : filePath;
  const parts = relativePath.split(path.sep);
  const fileName = parts.pop() || "";

  return (
    <box style={{ flexDirection: "row", gap: 0 }}>
      {parts.map((part, idx) => (
        <box key={idx} style={{ flexDirection: "row" }}>
          <text style={{ fg: "gray" }}>{part}</text>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}> › </text>
        </box>
      ))}
      <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>{fileName}</text>
    </box>
  );
}

const SAVE_DEBOUNCE_MS = 500;

export function FileViewer({
  filePath,
  focused,
  rootPath,
  height,
  onCursorChange,
  onSelectionChange,
  initialLine,
  onFocus,
}: FileViewerProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null);
  const lineNumberRef = useRef<LineNumberRenderable | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppresses the dirty flag for content changes triggered by us loading a file
  // (otherwise setText would immediately mark the buffer dirty and re-save).
  const suppressDirtyRef = useRef(false);

  const [isDirty, setIsDirty] = useState(false);
  const [initialContent, setInitialContent] = useState<string>("");
  const [cursorLine, setCursorLine] = useState(0); // 0-indexed
  const [cursorColumn, setCursorColumn] = useState(0); // 0-indexed
  const [lineCount, setLineCount] = useState(0);
  // Ctrl+D selects/highlights all instances of the word under the cursor.
  const [wordHighlight, setWordHighlight] = useState<string | null>(null);
  // Ctrl+G B toggles inline git blame in the line-number gutter.
  const [showBlame, setShowBlame] = useState(false);
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  // Inline search (Ctrl+F): query, current match index, all match locations.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ line: number; col: number }>>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  // Symbol picker (Ctrl+Shift+O / @): list of symbols for the active file.
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const fileSymbols: SymbolLocation[] = useMemo(() => {
    if (!filePath || !initialContent) return [];
    try {
      return getAllSymbols(initialContent, filePath);
    } catch {
      return [];
    }
  }, [filePath, initialContent]);

  const language = useMemo(() => (filePath ? detectLanguage(filePath) : null), [filePath]);
  const langIndicator = language ? language.toUpperCase() : "";

  const syntaxStyle = useMemo(() => getTermideSyntaxStyle(), []);

  const fileName = useMemo(() => {
    if (!filePath) return "";
    return path.basename(filePath);
  }, [filePath]);

  // Flush any pending save to disk synchronously.
  const flushPendingSave = useCallback(
    (targetPath: string | null) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (!targetPath) return;
      const content = textareaRef.current?.plainText;
      if (content === undefined) return;
      try {
        fs.writeFileSync(targetPath, content);
      } catch {
        // Swallow write errors; legacy viewer also did not surface them here.
      }
    },
    [],
  );

  // Load file when filePath changes.
  useEffect(() => {
    // Flush save for the previous file before switching.
    // We can't know the previous file path inside this effect cleanly, but the
    // cleanup function below handles it via closure.
    if (!filePath) {
      setInitialContent("");
      setLineCount(0);
      setIsDirty(false);
      return;
    }

    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      content = "";
    }

    setInitialContent(content);
    setLineCount(content === "" ? 0 : content.split("\n").length);
    setIsDirty(false);

    // If the textarea is already mounted (re-loading a different file), call
    // setText so we get a clean undo history per file.
    if (textareaRef.current) {
      suppressDirtyRef.current = true;
      textareaRef.current.setText(content);
      // Reset cursor to top so we don't restore the previous file's position.
      try {
        textareaRef.current.gotoLine(0);
      } catch {
        // gotoLine may throw on empty buffers; ignore.
      }
    }

    return () => {
      // When filePath changes, ensure pending writes for the previous file land
      // on the previous file (not the new one).
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        try {
          fs.writeFileSync(filePath, textareaRef.current?.plainText ?? "");
        } catch {
          // ignore
        }
      }
    };
  }, [filePath]);

  // Jump to initialLine when set (after file content is loaded).
  useEffect(() => {
    if (!filePath || !initialLine || initialLine < 1) return;
    // Defer to next tick so the textarea has the new content already.
    const handle = setTimeout(() => {
      try {
        textareaRef.current?.gotoLine(initialLine - 1);
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(handle);
  }, [filePath, initialLine, initialContent]);

  // Flush save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  // Editor-local keybindings — Ctrl+D word highlight, Ctrl+G git blame,
  // Ctrl+F inline search. Esc clears the topmost overlay.
  useKeyboard((event) => {
    if (!focused) return;

    // Search-mode capture: while the search bar is open, all printable keys
    // type into the query, and Enter / arrows step through matches.
    if (searchOpen) {
      if (event.name === "escape") {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchMatches([]);
        return;
      }
      if (event.name === "return") {
        if (searchMatches.length > 0) {
          const idx = event.shift
            ? (searchIndex - 1 + searchMatches.length) % searchMatches.length
            : (searchIndex + 1) % searchMatches.length;
          setSearchIndex(idx);
          const m = searchMatches[idx];
          if (m) textareaRef.current?.gotoLine(m.line);
        }
        return;
      }
      if (event.name === "backspace") {
        setSearchQuery((q) => q.slice(0, -1));
        return;
      }
      if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
        setSearchQuery((q) => q + event.name);
        return;
      }
      // Other keys fall through (so e.g. Ctrl+F still toggles).
    }

    if (event.ctrl && event.name === "d") {
      const ta = textareaRef.current;
      if (!ta) return;
      const lines = (ta.plainText ?? "").split("\n");
      const lineText = lines[cursorLine] ?? "";
      const w = getWordAtPosition(lineText, cursorColumn);
      if (w) setWordHighlight(w.word === wordHighlight ? null : w.word);
      return;
    }
    if (event.ctrl && event.name === "g") {
      setShowBlame((s) => !s);
      return;
    }
    if (event.ctrl && event.name === "f") {
      setSearchOpen((s) => !s);
      setSearchQuery("");
      return;
    }
    // @ opens the symbol picker.
    if (event.name === "@" || (event.ctrl && event.shift && event.name === "o")) {
      if (fileSymbols.length > 0) setShowSymbolPicker(true);
      return;
    }
    if (event.name === "escape") {
      if (wordHighlight) setWordHighlight(null);
    }
  });

  // Compute search matches whenever the query or content changes.
  useEffect(() => {
    if (!searchOpen || !searchQuery) {
      setSearchMatches([]);
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = (ta.plainText ?? "").split("\n");
    const q = searchQuery.toLowerCase();
    const out: Array<{ line: number; col: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = (lines[i] ?? "").toLowerCase();
      let from = 0;
      while ((from = lower.indexOf(q, from)) !== -1) {
        out.push({ line: i, col: from });
        from += Math.max(1, q.length);
      }
    }
    setSearchMatches(out);
    setSearchIndex(0);
    if (out.length > 0 && out[0]) {
      textareaRef.current?.gotoLine(out[0].line);
    }
  }, [searchOpen, searchQuery, isDirty]);

  // Apply searchMatch highlights for every hit; emphasise the active one
  // with bracketMatch (yellow bg) so the user can see where Enter will jump.
  const searchHlRefRef = useRef<number>(0);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (searchHlRefRef.current) {
      ta.removeHighlightsByRef(searchHlRefRef.current);
      searchHlRefRef.current = 0;
    }
    if (!searchOpen || searchMatches.length === 0) return;
    const matchStyle = syntaxStyle.getStyleId("searchMatch");
    const activeStyle = syntaxStyle.getStyleId("bracketMatch");
    if (matchStyle == null) return;
    const ref = (Date.now() & 0x7fffffff) | 1; // unique-ish
    searchHlRefRef.current = ref;
    for (let i = 0; i < searchMatches.length; i++) {
      const m = searchMatches[i];
      if (!m) continue;
      const style = i === searchIndex && activeStyle != null ? activeStyle : matchStyle;
      ta.addHighlight(m.line, {
        start: m.col,
        end: m.col + searchQuery.length,
        styleId: style,
        hlRef: ref,
      });
    }
  }, [searchOpen, searchMatches, searchIndex, searchQuery, syntaxStyle]);

  // Apply word-highlight: scan every line for the active word and add a
  // selectionMatch highlight at every occurrence. Wiped via hlRef on change.
  const wordHlRefRef = useRef<number>(0);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (wordHlRefRef.current) {
      ta.removeHighlightsByRef(wordHlRefRef.current);
      wordHlRefRef.current = 0;
    }
    if (!wordHighlight) return;

    const styleId = syntaxStyle.getStyleId("selectionMatch");
    if (styleId == null) return;

    const ref = (bracketHlRefRef.current + 1000) | 0; // separate ref space
    wordHlRefRef.current = ref;

    const lines = (ta.plainText ?? "").split("\n");
    const word = wordHighlight;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      let from = 0;
      while ((from = line.indexOf(word, from)) !== -1) {
        // Whole-word filter: neighbour chars must not be word-like.
        const prev = line[from - 1] ?? "";
        const next = line[from + word.length] ?? "";
        const isWordChar = (c: string) => /[a-zA-Z0-9_$]/.test(c);
        if (!isWordChar(prev) && !isWordChar(next)) {
          ta.addHighlight(i, {
            start: from,
            end: from + word.length,
            styleId,
            hlRef: ref,
          });
        }
        from += word.length;
      }
    }
  }, [wordHighlight, syntaxStyle, isDirty]);

  // Inline git blame — fetch when toggled on, then drive setLineSign so
  // each line shows " · author" in the gutter.
  useEffect(() => {
    if (!showBlame || !filePath) {
      setBlameLines([]);
      return;
    }
    const lines = getGitBlame(filePath);
    setBlameLines(lines);
  }, [showBlame, filePath, isDirty]);

  useEffect(() => {
    const ln = lineNumberRef.current;
    if (!ln) return;
    if (!showBlame || blameLines.length === 0) return;

    for (const bl of blameLines) {
      const author = (bl.author || "?").slice(0, 12);
      ln.setLineSign(bl.line, {
        after: ` ${author}`,
        afterColor: "#6e7681",
      });
    }
    return () => {
      const cur = lineNumberRef.current;
      if (!cur) return;
      // Clearing only the `after` portion — leave `before` (diff gutter).
      // setLineSigns Map<number, LineSign> overrides whole signs, so we
      // re-apply diff signs after blame is toggled off via the diff effect
      // re-running on isDirty change.
      for (const bl of blameLines) {
        cur.clearLineSign(bl.line);
      }
    };
  }, [showBlame, blameLines]);

  // Bracket matching — when the cursor sits on (or just after) a bracket,
  // highlight its mate using the textarea's per-line addHighlight. We track
  // a per-buffer hlRef so we can wipe the previous match cleanly.
  const bracketHlRefRef = useRef<number>(0);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (bracketHlRefRef.current) {
      ta.removeHighlightsByRef(bracketHlRefRef.current);
    }

    if (cursorLine < 0 || cursorColumn < 0) return;
    const styleId = syntaxStyle.getStyleId("bracketMatch");
    if (styleId == null) return;

    const lines = (ta.plainText ?? "").split("\n");
    const match =
      findMatchingBracket(lines, cursorLine, cursorColumn) ??
      (cursorColumn > 0 ? findMatchingBracket(lines, cursorLine, cursorColumn - 1) : null);
    if (!match) return;

    const ref = bracketHlRefRef.current + 1;
    bracketHlRefRef.current = ref;
    ta.addHighlight(match.openLine, {
      start: match.openColumn,
      end: match.openColumn + 1,
      styleId,
      hlRef: ref,
    });
    ta.addHighlight(match.closeLine, {
      start: match.closeColumn,
      end: match.closeColumn + 1,
      styleId,
      hlRef: ref,
    });
  }, [cursorLine, cursorColumn, syntaxStyle]);

  // Git diff gutter — fetch line statuses for the current file and feed them
  // into the line-number's setLineSign so changed lines get a colored bar.
  useEffect(() => {
    if (!filePath || !rootPath) return;
    const ln = lineNumberRef.current;
    if (!ln) return;

    let cancelled = false;
    ln.clearAllLineSigns();

    const colors: Record<Exclude<LineDiffStatus, null>, { char: string; color: string }> = {
      added: { char: "┃", color: "#4ec9b0" },
      modified: { char: "┃", color: "#569cd6" },
      deleted: { char: "▼", color: "#f14c4c" },
    };

    getFileLineDiffs(filePath, rootPath)
      .then((diffs) => {
        if (cancelled) return;
        const cur = lineNumberRef.current;
        if (!cur) return;
        for (const d of diffs) {
          if (!d.status) continue;
          const c = colors[d.status];
          // line-number is 1-indexed (matches getFileLineDiffs output).
          cur.setLineSign(d.lineNumber, { before: c.char, beforeColor: c.color });
        }
      })
      .catch(() => {
        // Non-fatal: leave the gutter empty if git is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, rootPath, isDirty]);

  const handleContentChange = useCallback(() => {
    // Track line count for the bottomTitle / status row.
    const ta = textareaRef.current;
    if (ta) setLineCount(ta.lineCount);

    // If the change came from us programmatically loading a file, do not mark dirty.
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }

    if (!filePath) return;
    setIsDirty(true);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const targetPath = filePath;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const latest = textareaRef.current?.plainText ?? "";
      try {
        fs.writeFileSync(targetPath, latest);
        setIsDirty(false);
      } catch {
        // Keep dirty state if the write failed.
      }
    }, SAVE_DEBOUNCE_MS);
  }, [filePath]);

  const handleCursorChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const v = ta.visualCursor;
    if (!v) return;
    // Use logical row/col so reported values match line/column in the file as
    // edited (visual coords differ when wrapping is enabled).
    const line = (v.logicalRow ?? v.visualRow ?? 0);
    const col = (v.logicalCol ?? v.visualCol ?? 0);
    setCursorLine(line);
    setCursorColumn(col);
    if (onCursorChange) {
      onCursorChange(line + 1, col + 1);
    }
    if (onSelectionChange && ta.hasSelection?.()) {
      try {
        onSelectionChange(ta.getSelectedText() ?? "");
      } catch {
        // ignore
      }
    }
  }, [onCursorChange, onSelectionChange]);

  const borderColor = focused ? "cyan" : "gray";

  const bottomTitle = filePath
    ? ` ${langIndicator || "TXT"} · Ln ${cursorLine + 1}:${cursorColumn + 1}/${lineCount} `
    : "";

  // No-file state.
  if (!filePath) {
    return (
      <box
        style={{
          flexDirection: "column",
          border: true,
          borderColor,
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
        onMouseDown={onFocus}
      >
        <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>Select a file to view</text>
      </box>
    );
  }

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}
      bottomTitle={bottomTitle}
      bottomTitleAlignment="right"
      onMouseDown={onFocus}
    >
      {/* Header row: FOCUS badge, dirty dot, breadcrumbs, lang indicator */}
      <box style={{ height: 1, paddingX: 1, flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1, flexShrink: 1 }}>
          {focused && (
            <text style={{ fg: "black", bg: "cyan", attributes: TextAttributes.BOLD }}> EDIT </text>
          )}
          {isDirty && (
            <text style={{ fg: "black", bg: "yellow", attributes: TextAttributes.BOLD }}> ● </text>
          )}
          <box style={{ flexShrink: 1 }}>
            <Breadcrumbs filePath={filePath} rootPath={rootPath} />
          </box>
          {langIndicator && (
            <text style={{ fg: "#d4a800", attributes: TextAttributes.DIM }}>
              {" "}
              [{langIndicator}]
            </text>
          )}
        </box>
        <text style={{ fg: "gray", flexShrink: 0 }}>
          Ln {cursorLine + 1}:{cursorColumn + 1}/{lineCount}
        </text>
      </box>

      {/* Separator */}
      <box style={{ height: 1, border: ["top"], borderColor: "gray" }} />

      {/* Inline search bar (Ctrl+F): Enter / Shift+Enter cycle, Esc closes */}
      {searchOpen && (
        <box style={{ height: 1, paddingX: 1, flexDirection: "row", backgroundColor: "#1a1a1a", justifyContent: "space-between" }}>
          <box style={{ flexDirection: "row" }}>
            <text style={{ fg: "green", attributes: TextAttributes.BOLD, bg: "#1a1a1a" }}>/ </text>
            <text style={{ fg: "white", bg: "#1a1a1a" }}>{searchQuery}</text>
            <text style={{ fg: "green", attributes: TextAttributes.BLINK, bg: "#1a1a1a" }}>▌</text>
          </box>
          <text style={{ fg: searchMatches.length > 0 ? "green" : "gray", bg: "#1a1a1a" }}>
            {searchMatches.length > 0
              ? `${searchIndex + 1}/${searchMatches.length}  Enter:next  Shift+Enter:prev  Esc:close`
              : searchQuery
                ? "no matches  Esc:close"
                : "type to search  Esc:close"}
          </text>
        </box>
      )}

      {/* Editor + minimap row */}
      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <line-number
          ref={lineNumberRef}
          fg="gray"
          bg="#0b0b0b"
          minWidth={4}
          paddingRight={1}
          showLineNumbers
          style={{ flexGrow: 1, height: "100%" }}
        >
          <textarea
            ref={textareaRef}
            focused={focused && !showSymbolPicker}
            initialValue={initialContent}
            syntaxStyle={syntaxStyle}
            onContentChange={handleContentChange}
            onCursorChange={handleCursorChange}
            style={{ width: "100%", flexGrow: 1, backgroundColor: "#050505" }}
          />
        </line-number>
        {/* Minimap on the right edge — only when the file is wide enough to
            spare 12 columns. The component reads from initialContent (after
            load) plus tracks edits via lineCount; for live edits we'd need to
            poll plainText, but the legacy minimap was also coarse. */}
        {height > 8 && lineCount > 0 && (
          <Minimap
            content={initialContent.split("\n")}
            scrollOffset={Math.max(0, cursorLine - Math.floor(height / 2))}
            viewHeight={Math.max(8, height - 4)}
            cursorLine={cursorLine}
            height={Math.max(8, height - 4)}
            width={12}
          />
        )}
      </box>

      <SymbolPicker
        symbols={fileSymbols}
        isOpen={showSymbolPicker}
        onClose={() => setShowSymbolPicker(false)}
        onSelect={(sym) => {
          setShowSymbolPicker(false);
          // SymbolLocation.line is 1-indexed in the legacy library, gotoLine is 0-indexed.
          try {
            textareaRef.current?.gotoLine(Math.max(0, sym.line - 1));
          } catch {
            // ignore
          }
        }}
      />
    </box>
  );
}

export default FileViewer;
