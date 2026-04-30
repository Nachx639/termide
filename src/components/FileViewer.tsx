import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core";
import * as fs from "fs";
import * as path from "path";
import { detectLanguage } from "../lib/SyntaxHighlighter";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";

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
