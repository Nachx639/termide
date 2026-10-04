import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "../lib/themeContext";
import { TextAttributes } from "@opentui/core";
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";
import { detectLanguage } from "../lib/SyntaxHighlighter";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";
import { highlightRanges } from "../lib/editorHighlight";
import { readEditorText, looksComplete } from "../lib/editorText";
import { onBeforeQuit } from "../lib/quit";
import { onEditorCommand } from "../lib/editorCommands";
import { copyToClipboard } from "../hooks/useClipboard";
import type { Theme } from "../lib/ThemeSystem";
import { getFileLineDiffs, type LineDiffStatus } from "../lib/GitIntegration";
import { findMatchingBracket } from "../lib/BracketMatcher";
import { getWordAtPosition, getAllSymbols, findDefinition, type SymbolLocation } from "../lib/SymbolFinder";
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
  wordWrap?: boolean;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
  /** Off: save with Ctrl+S, or when switching files / unmounting. */
  autoSave?: boolean;
  /** Colour theme for syntax highlighting (default: Termide dark). */
  syntaxTheme?: Theme;
  /**
   * Called when the user clicks anywhere inside this viewer. Lets the parent
   * focus this pane — needed because the inner <textarea> captures mouse
   * events and the wrapper in App.tsx never sees them.
   */
  onFocus?: () => void;
}

// Breadcrumbs subcomponent.
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
// The textarea's emacs-style defaults collide with IDE shortcuts: Ctrl+K deleted
// to the end of the line while opening the palette, Ctrl+W deleted a word while
// closing the tab, Ctrl+D deleted a character while highlighting... and the
// change was autosaved. Those keys do nothing in the buffer now; Ctrl+Z undoes.
const EDITOR_KEY_BINDINGS: any[] = [
  ...["k", "w", "d", "f", "b", "p", "g", "s", "r", "x", "q", "t", "n", "o"].map((name) => ({ name, ctrl: true, action: "termide-ide-shortcut" })),
  { name: "z", ctrl: true, action: "undo" },
  { name: "z", ctrl: true, shift: true, action: "redo" },
];

// Highlight ref for syntax colours (decorations use their own refs, priority 10).
const SYNTAX_HL_REF = 0x51a7;

export function FileViewer({
  filePath,
  focused,
  rootPath,
  height,
  onJumpToFile,
  onCursorChange,
  onSelectionChange,
  initialLine,
  onFocus,
  wordWrap = false,
  showLineNumbers = true,
  showMinimap = true,
  autoSave = true,
  syntaxTheme,
}: FileViewerProps) {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable | null>(null);
  const lineNumberRef = useRef<LineNumberRenderable | null>(null);
  // Put the cursor on a match / definition (gotoLine alone left it at column 0,
  // so typing after a search went to the start of the line).
  const placeCursor = (line: number, col: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      ta.setCursor(line, Math.max(0, col));
    } catch {
      try {
        ta.gotoLine(line);
      } catch {}
    }
    setTimeout(() => handleCursorChangeRef.current(), 0);
  };
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppresses the dirty flag for content changes triggered by us loading a file
  // (otherwise setText would immediately mark the buffer dirty and re-save).
  const suppressDirtyRef = useRef(false);
  // What we last read from / wrote to disk, to tell our own writes from changes
  // made by other programs (an agent in the terminal, git checkout, a formatter).
  const diskRef = useRef<{ content: string; mtimeMs: number; size: number } | null>(null);
  // Disk changed while we had unsaved edits: autosave is suspended until resolved.
  const [conflict, setConflict] = useState(false);
  // The file existed when loaded but is gone now (deleted, moved, renamed).
  const [missing, setMissing] = useState(false);
  const conflictRef = useRef(false);
  conflictRef.current = conflict;
  const [notice, setNotice] = useState<string | null>(null);
  // Latest buffer text. Cleanups must use this: React detaches textareaRef before
  // effect cleanups run, and reading it there yielded "" — which was then written
  // over the file.
  const latestTextRef = useRef<string | null>(null);
  const missingRef = useRef(false);
  missingRef.current = missing;
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

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
  // Computed when the symbol picker opens: scanning symbols costs ~2 s per 30k
  // lines and used to run on every file open.
  const fileSymbols: SymbolLocation[] = useMemo(() => {
    if (!showSymbolPicker || !filePath || !initialContent) return [];
    try {
      return getAllSymbols(initialContent, filePath);
    } catch {
      return [];
    }
  }, [filePath, initialContent, showSymbolPicker]);

  const language = useMemo(() => (filePath ? detectLanguage(filePath) : null), [filePath]);
  const langIndicator = language ? language.toUpperCase() : "";

  const syntaxStyle = useMemo(() => getTermideSyntaxStyle(syntaxTheme), [syntaxTheme]);
  const editorBg = syntaxTheme && syntaxTheme.id !== "dark" ? syntaxTheme.background : "#050505";
  const editorFg = syntaxTheme && syntaxTheme.id !== "dark" ? syntaxTheme.syntax.default : "#EEFFFF";
  // Bumped on every edit; the syntax highlighter re-runs shortly after typing stops.
  const [editVersion, setEditVersion] = useState(0);

  const fileName = useMemo(() => {
    if (!filePath) return "";
    return path.basename(filePath);
  }, [filePath]);

  const statDisk = (p: string) => {
    try {
      const st = fs.statSync(p);
      return { mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      return null;
    }
  };

  /**
   * Write the buffer to `targetPath` unless the file changed on disk since we last
   * read/wrote it — then flag a conflict instead of clobbering the other change.
   * `force` (Ctrl+S during a conflict) overwrites anyway.
   */
  const saveNow = useCallback((targetPath: string, content: string, force = false): boolean => {
    // Refuse to write a buffer that does not look complete (line count differs
    // from the editor's): a truncated read must never reach the disk.
    const ta = textareaRef.current;
    if (ta && !looksComplete(ta, content)) {
      setNotice("Not saved: could not read the whole buffer safely");
      return false;
    }
    const known = diskRef.current;
    const st = statDisk(targetPath);
    // Never silently bring back a file that was deleted or moved away (renaming
    // an open file used to recreate it under the old name on the next autosave).
    if (!force && known && known.mtimeMs > 0 && !st) {
      setMissing(true);
      return false;
    }
    if (!force && known && st && (st.mtimeMs !== known.mtimeMs || st.size !== known.size)) {
      let onDisk = "";
      try {
        onDisk = fs.readFileSync(targetPath, "utf8");
      } catch {}
      if (onDisk !== known.content && onDisk !== content) {
        setConflict(true);
        return false;
      }
    }
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
      const after = statDisk(targetPath);
      diskRef.current = { content, mtimeMs: after?.mtimeMs ?? 0, size: after?.size ?? 0 };
      setConflict(false);
      setMissing(false);
      return true;
    } catch (err: any) {
      setNotice(`Could not save: ${err?.message ?? err}`);
      return false;
    }
  }, []);

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
    setConflict(false);
    setMissing(false);
    latestTextRef.current = content;
    const st = statDisk(filePath);
    diskRef.current = { content, mtimeMs: st?.mtimeMs ?? 0, size: st?.size ?? 0 };

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
      // When filePath changes (or we unmount), pending edits land on the previous
      // file — never silently dropped, never written over someone else's change.
      const pending = saveTimerRef.current !== null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const text = latestTextRef.current;
      const unsaved = text !== null && diskRef.current !== null && text !== diskRef.current.content;
      if ((pending || unsaved) && !conflictRef.current && text !== null) saveNow(filePath, text);
    };
  }, [filePath, saveNow]);

  // Palette commands for the focused editor (lib/editorCommands).
  useEffect(() => {
    if (!focused || !filePath) return;
    return onEditorCommand((cmd) => {
      const ta = textareaRef.current as any;
      if (cmd === "symbols") setShowSymbolPicker(true);
      else if (cmd === "blame") setShowBlame((b) => !b);
      else if (cmd === "undo" || cmd === "redo") {
        try {
          ta?.[cmd]?.();
        } catch {}
        setTimeout(() => handleContentChangeRef.current(), 0);
      } else if (cmd === "save") {
        if (saveNow(filePath, readEditorText(ta), conflictRef.current || missingRef.current)) {
          setIsDirty(false);
          setNotice("Saved");
        }
      }
    });
  }, [focused, filePath, saveNow]);

  // Flush a pending autosave if termide is quitting.
  useEffect(() => {
    if (!filePath) return;
    return onBeforeQuit(() => {
      // Unresolved conflict: keep the user's version next to the file rather
      // than dropping it (the disk version stays untouched).
      if (conflictRef.current && latestTextRef.current !== null) {
        try {
          fs.writeFileSync(`${filePath}.termide-unsaved`, latestTextRef.current);
        } catch {}
        return;
      }
      if (!saveTimerRef.current || conflictRef.current || missingRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const text = latestTextRef.current;
      if (text !== null) saveNow(filePath, text);
    });
  }, [filePath, saveNow]);

  // Follow changes made on disk by other programs (agents, git, formatters).
  // Polling mtime/size is cheap and, unlike fs.watch on macOS, survives the
  // write-temp-then-rename saves most tools do.
  useEffect(() => {
    if (!filePath) return;
    const timer = setInterval(() => {
      const known = diskRef.current;
      const st = statDisk(filePath);
      if (known && known.mtimeMs > 0 && !st) {
        setMissing(true);
        return;
      }
      if (st) setMissing(false);
      if (!known || !st || (st.mtimeMs === known.mtimeMs && st.size === known.size)) return;
      let onDisk: string;
      try {
        onDisk = fs.readFileSync(filePath, "utf8");
      } catch {
        return;
      }
      diskRef.current = { content: onDisk, mtimeMs: st.mtimeMs, size: st.size };
      const ta = textareaRef.current;
      if (!ta || onDisk === known.content) return;
      const hasLocalEdits = saveTimerRef.current !== null || readEditorText(ta) !== known.content;
      if (hasLocalEdits) {
        // Keep the user's edits; stop autosave from overwriting the other change.
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        setConflict(true);
        return;
      }
      const line = ta.visualCursor?.logicalRow ?? 0;
      const col = ta.visualCursor?.logicalCol ?? 0;
      suppressDirtyRef.current = true;
      ta.setText(onDisk);
      latestTextRef.current = onDisk;
      setInitialContent(onDisk);
      setLineCount(onDisk === "" ? 0 : onDisk.split("\n").length);
      try {
        const lines = onDisk.split("\n");
        const row = Math.min(line, Math.max(0, lines.length - 1));
        ta.setCursor(row, Math.min(col, (lines[row] ?? "").length));
      } catch {}
      setNotice("Reloaded: file changed on disk");
    }, 1000);
    return () => clearInterval(timer);
  }, [filePath]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

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

  // EditorTraits — declare which keys the textarea wants to swallow itself
  // (Tab inserts indent, Esc only clears overlays; we don't want either to
  // bubble up to the global App-level handler and trigger panel-level shortcuts).
  // The `traits` getter/setter is on EditBufferRenderable.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    try {
      ta.traits = { capture: ["tab", "escape"] };
    } catch {
      // older runtimes may not have traits — non-fatal.
    }
  }, []);

  // Editor-local keybindings — Ctrl+D word highlight, Ctrl+G git blame,
  // Ctrl+F inline search. Esc clears the topmost overlay.
  useKeyboard((event) => {
    if (!focused) return;
    // The textarea only reports cursor moves that come with an edit, so arrows,
    // Home/End and PgUp/PgDn left Ln/Col (and Ctrl+D, F12, bracket matching)
    // on a stale position. It handles the key after us: read the cursor next tick.
    setTimeout(() => handleCursorChangeRef.current(), 0);
    // Undo/redo change the buffer without a content-change event, so they were
    // never autosaved (the disk kept the undone text). Treat them as edits.
    const isUndoRedo =
      (event.ctrl && (event.name === "z" || event.name === "-" || event.name === ".")) ||
      (event.super && event.name === "z");
    if (isUndoRedo) setTimeout(() => handleContentChangeRef.current(), 0);

    // Ctrl+C copies the selection (in the editor it must not quit the IDE).
    if (event.ctrl && event.name === "c") {
      const ta = textareaRef.current as any;
      const text = ta?.hasSelection?.() ? ta.getSelectedText?.() : "";
      if (text) {
        copyToClipboard(text).then((ok) => ok && setNotice("Copied"));
      }
      return;
    }

    // Ctrl+S: save now (during a conflict: keep my version and overwrite disk).
    if (event.ctrl && event.name === "s" && filePath) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveNow(filePath, readEditorText(textareaRef.current), conflict || missing)) {
        setIsDirty(false);
        setNotice(conflict ? "Saved your version over the disk copy" : missing ? "Saved (file recreated)" : "Saved");
      }
      return;
    }
    // Ctrl+R during a conflict: drop my edits, load what is on disk.
    if (conflict && event.ctrl && event.name === "r" && filePath) {
      let onDisk = "";
      try {
        onDisk = fs.readFileSync(filePath, "utf8");
      } catch {}
      const st = statDisk(filePath);
      diskRef.current = { content: onDisk, mtimeMs: st?.mtimeMs ?? 0, size: st?.size ?? 0 };
      suppressDirtyRef.current = true;
      textareaRef.current?.setText(onDisk);
      latestTextRef.current = onDisk;
      setInitialContent(onDisk);
      setIsDirty(false);
      setConflict(false);
      setNotice("Loaded the version on disk");
      return;
    }

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
          if (m) placeCursor(m.line, m.col);
        }
        return;
      }
      if (event.name === "backspace") {
        setSearchQuery((q) => q.slice(0, -1));
        return;
      }
      if (event.name === "space") {
        setSearchQuery((q) => q + " ");
        return;
      }
      // `sequence` keeps upper case and non-ASCII (`name` is lower-cased).
      if (event.sequence && !event.ctrl && !event.meta && !/[\x00-\x1f\x7f]/.test(event.sequence)) {
        setSearchQuery((q) => q + event.sequence);
        return;
      }
      // Other keys fall through (so e.g. Ctrl+F still toggles).
    }

    // F12 / Ctrl+Shift+G: go to the definition of the word under the cursor
    // (same file, or the file it is imported from).
    if (event.name === "f12" || (event.ctrl && event.shift && event.name === "g")) {
      const ta = textareaRef.current;
      if (!ta || !filePath) return;
      const text = readEditorText(ta);
      const w = getWordAtPosition(text.split("\n")[cursorLine] ?? "", cursorColumn);
      if (!w) return;
      const def = findDefinition(text, filePath, w.word);
      if (!def) {
        setNotice(`No definition found for ${w.word}`);
      } else if (path.resolve(def.filePath) === path.resolve(filePath)) {
        // SymbolFinder lines are 0-indexed, like gotoLine.
        try {
          placeCursor(Math.max(0, def.line), def.column);
        } catch {}
      } else {
        onJumpToFile?.(def.filePath, def.line + 1); // App's initialLine is 1-indexed
      }
      return;
    }

    if (event.ctrl && event.name === "d") {
      const ta = textareaRef.current;
      if (!ta) return;
      const lines = readEditorText(ta).split("\n");
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
    // Ctrl+Shift+O opens the symbol picker ("@" alone must stay typeable in code).
    if (event.ctrl && event.shift && event.name === "o") {
      setShowSymbolPicker(true);
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
    const lines = readEditorText(ta).split("\n");
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
      placeCursor(out[0].line, out[0].col);
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
    const activeStyle = syntaxStyle.getStyleId("activeSearchMatch");
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
        priority: 10,
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

    const lines = readEditorText(ta).split("\n");
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
            priority: 10,
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

  // Gutter signs: git diff bars (before) and blame authors (after), merged and
  // applied in one setLineSigns call. Setting them one line at a time re-laid
  // out the gutter each time: O(n²), ~5 s of frozen UI after every save of a
  // 30k-line file (every line of an untracked file is "added").
  const diffSignsRef = useRef<Map<number, { before: string; beforeColor: string }>>(new Map());
  const blameSignsRef = useRef<Map<number, { after: string; afterColor: string }>>(new Map());
  const applySigns = useCallback(() => {
    const ln = lineNumberRef.current;
    if (!ln) return;
    const merged = new Map<number, any>();
    for (const [line, sign] of diffSignsRef.current) merged.set(line, { ...sign });
    for (const [line, sign] of blameSignsRef.current) merged.set(line, { ...(merged.get(line) ?? {}), ...sign });
    ln.setLineSigns(merged);
  }, []);

  useEffect(() => {
    blameSignsRef.current = new Map(
      showBlame ? blameLines.map((bl) => [bl.line, { after: ` ${(bl.author || "?").slice(0, 12)}`, afterColor: "#6e7681" }]) : [],
    );
    applySigns();
  }, [showBlame, blameLines, applySigns]);

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

    const lines = readEditorText(ta).split("\n");
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
      priority: 10,
      hlRef: ref,
    });
    ta.addHighlight(match.closeLine, {
      start: match.closeColumn,
      end: match.closeColumn + 1,
      styleId,
      priority: 10,
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

    const colors: Record<Exclude<LineDiffStatus, null>, { char: string; color: string }> = {
      added: { char: "┃", color: "#4ec9b0" },
      modified: { char: "┃", color: "#569cd6" },
      deleted: { char: "▼", color: "#f14c4c" },
    };

    getFileLineDiffs(filePath, rootPath)
      .then((diffs) => {
        if (cancelled) return;
        const signs = new Map<number, { before: string; beforeColor: string }>();
        for (const d of diffs) {
          if (!d.status) continue;
          const c = colors[d.status];
          // line-number is 1-indexed (matches getFileLineDiffs output).
          signs.set(d.lineNumber, { before: c.char, beforeColor: c.color });
        }
        diffSignsRef.current = signs;
        applySigns();
      })
      .catch(() => {
        // Non-fatal: leave the gutter empty if git is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, rootPath, isDirty]);

  // Syntax highlighting: the native textarea has no highlighter, so ranges from
  // tree-sitter (or the regex tokenizer) are applied as textarea highlights.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !filePath) return;
    const text = readEditorText(ta);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ranges = await highlightRanges(filePath, text);
      // Skip stale results: a newer edit will schedule its own run.
      if (cancelled || textareaRef.current !== ta || readEditorText(ta) !== text) return;
      ta.removeHighlightsByRef(SYNTAX_HL_REF);
      for (const r of ranges) {
        const styleId = syntaxStyle.getStyleId(r.name);
        if (styleId != null) ta.addHighlight(r.line, { start: r.start, end: r.end, styleId, priority: 0, hlRef: SYNTAX_HL_REF });
      }
    }, editVersion === 0 ? 0 : 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filePath, initialContent, editVersion, syntaxStyle]);

  const handleContentChangeRef = useRef<() => void>(() => {});
  const handleContentChange = useCallback(() => {
    // Track line count for the bottomTitle / status row.
    const ta = textareaRef.current;
    if (ta) {
      setLineCount(ta.lineCount);
      latestTextRef.current = readEditorText(ta);
    }
    setEditVersion((v) => v + 1);

    // If the change came from us programmatically loading a file, do not mark dirty.
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }

    if (!filePath) return;
    // Same text as on disk (initial load, undo back to saved, reload): nothing to
    // save. Previously opening a file marked it dirty and rewrote it unchanged.
    if (ta && diskRef.current && readEditorText(ta) === diskRef.current.content) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setIsDirty(false);
      return;
    }
    setIsDirty(true);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const targetPath = filePath;
    if (conflictRef.current) return; // resolve the conflict first (Ctrl+S / Ctrl+R)
    if (!autoSaveRef.current) return; // manual mode: Ctrl+S, or flushed on file switch / unmount
    if (missingRef.current) return; // file deleted/moved: only an explicit Ctrl+S recreates it
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const latest = readEditorText(textareaRef.current);
      // Keeps the dirty flag if the write failed or the disk changed underneath.
      if (saveNow(targetPath, latest)) setIsDirty(false);
    }, SAVE_DEBOUNCE_MS);
  }, [filePath, saveNow]);

  handleContentChangeRef.current = handleContentChange;
  const handleCursorChangeRef = useRef<() => void>(() => {});
  const handleCursorChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || (ta as any).isDestroyed) return;
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
  handleCursorChangeRef.current = handleCursorChange;

  const borderColor = focused ? theme.borderFocused : theme.border;

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
      onMouseUp={() => setTimeout(() => handleCursorChangeRef.current(), 0)}
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

      {conflict && (
        <box style={{ height: 1, paddingX: 1, flexDirection: "row", backgroundColor: "#5a1d1d", flexShrink: 0 }}>
          <text wrapMode="none" style={{ fg: "white", bg: "#5a1d1d", attributes: TextAttributes.BOLD }}>
            {"Changed on disk by another program while you were editing — Ctrl+R: load disk version · Ctrl+S: keep yours"}
          </text>
        </box>
      )}
      {missing && !conflict && (
        <box style={{ height: 1, paddingX: 1, flexDirection: "row", backgroundColor: "#5a3d1d", flexShrink: 0 }}>
          <text wrapMode="none" style={{ fg: "white", bg: "#5a3d1d", attributes: TextAttributes.BOLD }}>
            {"Deleted or moved on disk — edits are not saved here (Ctrl+S to save it again)"}
          </text>
        </box>
      )}
      {notice && !conflict && (
        <box style={{ height: 1, paddingX: 1, flexDirection: "row", backgroundColor: "#1d3a2a", flexShrink: 0 }}>
          <text wrapMode="none" style={{ fg: "white", bg: "#1d3a2a" }}>{notice}</text>
        </box>
      )}

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
          bg={syntaxTheme && syntaxTheme.id !== "dark" ? editorBg : "#0b0b0b"}
          minWidth={4}
          paddingRight={1}
          showLineNumbers={showLineNumbers}
          style={{ flexGrow: 1, height: "100%" }}
        >
          <textarea
            ref={textareaRef}
            focused={focused && !showSymbolPicker && !searchOpen}
            initialValue={initialContent}
            syntaxStyle={syntaxStyle}
            onContentChange={handleContentChange}
            onCursorChange={handleCursorChange}
            wrapMode={wordWrap ? "word" : "none"}
            keyBindings={EDITOR_KEY_BINDINGS}
            // Colours are textarea props (style.backgroundColor was ignored, so
            // light themes drew dark-on-dark text).
            backgroundColor={editorBg}
            focusedBackgroundColor={editorBg}
            textColor={editorFg}
            focusedTextColor={editorFg}
            style={{ width: "100%", flexGrow: 1 }}
          />
        </line-number>
        {/* Minimap on the right edge — only when the file is wide enough to
            spare 12 columns. The component reads from initialContent (after
            load) plus tracks edits via lineCount; for live edits we'd need to
            poll plainText, but the legacy minimap was also coarse. */}
        {showMinimap && height > 8 && lineCount > 0 && (
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
          // SymbolLocation.line is 0-indexed, like gotoLine (the old "- 1" landed
          // one line above every symbol).
          try {
            placeCursor(Math.max(0, sym.line), sym.column);
          } catch {
            // ignore
          }
        }}
      />
    </box>
  );
}

export default FileViewer;
