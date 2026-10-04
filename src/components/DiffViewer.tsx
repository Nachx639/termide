import React, { useRef } from "react";
import { useTheme } from "../lib/themeContext";
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
  const theme = useTheme();
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
  // A commit (git show) holds several files: render each with its own filetype.
  const { preamble, files } = splitPatch(diff);

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor: focused ? theme.borderFocused : theme.border, height: "100%", backgroundColor: "#0b0b0b" }}
      onMouseDown={onFocus}
    >
      {/* Header */}
      <box style={{ paddingX: 1, height: 1, backgroundColor: "#1a1a1a", flexDirection: "row", justifyContent: "space-between", flexShrink: 0 }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          {focused && <text style={{ fg: "black", bg: theme.accent, attributes: TextAttributes.BOLD }}> FOCUS </text>}
          <text style={{ fg: "#d4a800", attributes: TextAttributes.BOLD }}>📊 Diff</text>
          <text style={{ fg: "white" }}>{fileName}</text>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>
            ({viewMode}{files.length > 1 ? ` · ${files.length} files` : ""})
          </text>
        </box>
        <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>v:toggle view | q/Esc:close</text>
      </box>

      <scrollbox ref={scrollBoxRef} focused={focused} style={{ flexGrow: 1 }} scrollY>
        {preamble && (
          <box style={{ flexDirection: "column", paddingX: 1, marginBottom: 1 }}>
            {preamble.split("\n").map((l, i) => (
              <text key={i} style={{ fg: i === 0 ? "#d4a800" : "white", attributes: i === 0 ? TextAttributes.BOLD : 0 }}>
                {l || " "}
              </text>
            ))}
          </box>
        )}
        {files.map((f, i) => (
          <box key={`${f.path}-${i}`} style={{ flexDirection: "column", marginBottom: 1 }}>
            {files.length > 1 && (
              <box style={{ paddingX: 1, height: 1, backgroundColor: "#1a1a1a", flexShrink: 0 }}>
                <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}>{f.path}</text>
              </box>
            )}
            <diff
              diff={f.patch}
              view={viewMode}
              syncScroll
              filetype={filetypeFor(f.path)}
              syntaxStyle={getTermideSyntaxStyle()}
              conceal
              showLineNumbers
              wrapMode="word"
              style={{ width: "100%" }}
              addedBg="#1e3a1e"
              removedBg="#3a1e1e"
              contextBg="#0b0b0b"
              addedSignColor="#4ec9b0"
              removedSignColor="#f14c4c"
              lineNumberFg="#4a4a4a"
              lineNumberBg="#111111"
            />
          </box>
        ))}
      </scrollbox>
    </box>
  );
}

/** Split a patch (possibly `git show` output) into its commit header and per-file diffs. */
export function splitPatch(diff: string): { preamble: string; files: { path: string; patch: string }[] } {
  const start = diff.search(/^diff --git /m);
  if (start === -1) return { preamble: "", files: [{ path: "", patch: diff }] };
  const preamble = diff.slice(0, start).trim();
  const files = diff
    .slice(start)
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith("diff --git "))
    .map((patch) => {
      const plus = patch.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1];
      const header = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
      const p = plus && plus !== "/dev/null" ? plus : header?.[2] ?? "";
      return { path: p.trim(), patch };
    });
  return { preamble, files };
}

function filetypeFor(filePath: string): string {
  const fileName = filePath.split("/").pop() || filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const filetypeMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", rb: "ruby", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    css: "css", html: "html", sql: "sql", sh: "bash", zsh: "bash",
    swift: "swift", kt: "kotlin", java: "java", c: "c", cpp: "cpp",
    zig: "zig",
  };
  return filetypeMap[ext] || ext;
}
