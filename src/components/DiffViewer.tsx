import React, { useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";

interface DiffViewerProps {
  diff: string;
  filePath: string;
  focused: boolean;
  onClose: () => void;
  onFocus?: () => void;
}

/**
 * DiffViewer — Powered by OpenTUI's native DiffRenderable.
 * 
 * Features:
 * - Split and unified diff views with `syncScroll`
 * - Syntax-highlighted code in both panels
 * - Line highlighting API for marking specific changes
 * - Automatic line number display
 * - Configurable colors for added/removed/context lines
 */
export function DiffViewer({ diff, filePath, focused, onClose, onFocus }: DiffViewerProps) {
  const scrollBoxRef = useRef<any>(null);
  const [viewMode, setViewMode] = React.useState<"split" | "unified">("split");

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "escape" || event.name === "q") {
      onClose();
      return;
    }

    // Toggle split/unified view
    if (event.name === "v") {
      setViewMode(prev => prev === "split" ? "unified" : "split");
      return;
    }

    // Scrolling
    if (scrollBoxRef.current) {
      if (event.name === "up" || event.name === "k") {
        scrollBoxRef.current.scrollBy(-1);
      } else if (event.name === "down" || event.name === "j") {
        scrollBoxRef.current.scrollBy(1);
      } else if (event.name === "pageup") {
        scrollBoxRef.current.scrollBy(-20);
      } else if (event.name === "pagedown") {
        scrollBoxRef.current.scrollBy(20);
      }
    }
  });

  const fileName = filePath.split("/").pop() || filePath;
  // Detect filetype from extension
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const filetypeMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", rb: "ruby", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    css: "css", html: "html", sql: "sql", sh: "bash", zsh: "bash",
    swift: "swift", kt: "kotlin", java: "java", c: "c", cpp: "cpp",
    zig: "zig",
  };
  const filetype = filetypeMap[ext] || ext;

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor: focused ? "cyan" : "gray", height: "100%", backgroundColor: "#0b0b0b" }}
      onMouseDown={onFocus}
    >
      {/* Header */}
      <box style={{ paddingX: 1, height: 1, backgroundColor: "#1a1a1a", flexDirection: "row", justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          {focused && <text style={{ fg: "black", bg: "cyan", attributes: TextAttributes.BOLD }}> FOCUS </text>}
          <text style={{ fg: "#d4a800", attributes: TextAttributes.BOLD }}>📊 Diff</text>
          <text style={{ fg: "white" }}>{fileName}</text>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>({viewMode})</text>
        </box>
        <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>v:toggle view | q/Esc:close</text>
      </box>

      {/* Native Diff Renderable */}
      <scrollbox ref={scrollBoxRef} focused={focused} style={{ flexGrow: 1 }} scrollY>
        <diff
          diff={diff}
          view={viewMode}
          syncScroll
          filetype={filetype}
          syntaxStyle={getTermideSyntaxStyle()}
          conceal
          showLineNumbers
          wrapMode="word"
          style={{
            width: "100%",
            flexGrow: 1,
          }}
          addedBg="#1e3a1e"
          removedBg="#3a1e1e"
          contextBg="#0b0b0b"
          addedSignColor="#4ec9b0"
          removedSignColor="#f14c4c"
          lineNumberFg="#4a4a4a"
          lineNumberBg="#111111"
        />
      </scrollbox>
    </box>
  );
}
