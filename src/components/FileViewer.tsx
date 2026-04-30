import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core";
import * as fs from "fs";
import * as path from "path";
import { detectLanguage } from "../lib/SyntaxHighlighter";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";
import { getFileLineDiffs, type LineDiffStatus } from "../lib/GitIntegration";
import { findMatchingBracket } from "../lib/BracketMatcher";

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

      {/* Editor: line-number gutter wraps the textarea so it provides numbers. */}
      <line-number
        ref={lineNumberRef}
        fg="gray"
        bg="#0b0b0b"
        minWidth={4}
        paddingRight={1}
        showLineNumbers
        style={{ width: "100%", flexGrow: 1 }}
      >
        <textarea
          ref={textareaRef}
          focused={focused}
          initialValue={initialContent}
          syntaxStyle={syntaxStyle}
          onContentChange={handleContentChange}
          onCursorChange={handleCursorChange}
          style={{ width: "100%", flexGrow: 1, backgroundColor: "#050505" }}
        />
      </line-number>
    </box>
  );
}

export default FileViewer;
