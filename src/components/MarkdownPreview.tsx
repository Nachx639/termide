import React, { useState, useEffect, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";

interface MarkdownPreviewProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
}

interface RenderedLine {
  text: string;
  style: {
    fg?: string;
    bold?: boolean;
    italic?: boolean;
    dim?: boolean;
  };
  indent?: number;
}

// Simple markdown to TUI renderer
function renderMarkdown(content: string): RenderedLine[] {
  const lines = content.split("\n");
  const rendered: RenderedLine[] = [];

  let inCodeBlock = false;

  for (const line of lines) {
    // Code block
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      rendered.push({
        text: inCodeBlock ? "┌─────────" : "└─────────",
        style: { fg: "gray", dim: true },
      });
      continue;
    }

    if (inCodeBlock) {
      rendered.push({
        text: "│ " + line,
        style: { fg: "green" },
      });
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      rendered.push({
        text: "█ " + line.slice(2),
        style: { fg: "cyan", bold: true },
      });
      continue;
    }
    if (line.startsWith("## ")) {
      rendered.push({
        text: "▓ " + line.slice(3),
        style: { fg: "cyan", bold: true },
      });
      continue;
    }
    if (line.startsWith("### ")) {
      rendered.push({
        text: "▒ " + line.slice(4),
        style: { fg: "cyan" },
      });
      continue;
    }
    if (line.startsWith("#### ")) {
      rendered.push({
        text: "░ " + line.slice(5),
        style: { fg: "white", bold: true },
      });
      continue;
    }

    // Bullet lists
    if (line.match(/^\s*[-*+]\s/)) {
      const indent = line.match(/^\s*/)?.[0].length || 0;
      const content = line.replace(/^\s*[-*+]\s/, "");
      rendered.push({
        text: "• " + content,
        style: { fg: "white" },
        indent: Math.floor(indent / 2),
      });
      continue;
    }

    // Numbered lists
    if (line.match(/^\s*\d+\.\s/)) {
      const indent = line.match(/^\s*/)?.[0].length || 0;
      const content = line.replace(/^\s*\d+\.\s/, "");
      const num = line.match(/^\s*(\d+)\./)?.[1] || "1";
      rendered.push({
        text: `${num}. ${content}`,
        style: { fg: "white" },
        indent: Math.floor(indent / 2),
      });
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      rendered.push({
        text: "┃ " + line.slice(1).trim(),
        style: { fg: "yellow", dim: true },
      });
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      rendered.push({
        text: "─".repeat(40),
        style: { fg: "gray" },
      });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      rendered.push({ text: "", style: {} });
      continue;
    }

    // Process inline formatting
    let text = line;
    const style: RenderedLine["style"] = { fg: "white" };

    // Bold
    if (text.includes("**") || text.includes("__")) {
      text = text.replace(/\*\*(.+?)\*\*/g, "$1");
      text = text.replace(/__(.+?)__/g, "$1");
      style.bold = true;
    }

    // Italic
    if (text.match(/[*_][^*_]+[*_]/)) {
      text = text.replace(/\*([^*]+)\*/g, "$1");
      text = text.replace(/_([^_]+)_/g, "$1");
      style.italic = true;
    }

    // Inline code
    text = text.replace(/`([^`]+)`/g, "⌜$1⌝");

    // Links
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "[$1]");

    rendered.push({ text, style });
  }

  return rendered;
}

export function MarkdownPreview({ filePath, focused, rootPath }: MarkdownPreviewProps) {
  const [content, setContent] = useState<string>("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const viewHeight = 20;

  useEffect(() => {
    if (!filePath || !fs.existsSync(filePath)) {
      setContent("");
      return;
    }

    try {
      const text = fs.readFileSync(filePath, "utf-8");
      setContent(text);
    } catch {
      setContent("Error reading file");
    }
    setScrollOffset(0);
  }, [filePath]);

  const renderedLines = useMemo(() => renderMarkdown(content), [content]);

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "up" || event.name === "k") {
      setScrollOffset((o) => Math.max(0, o - 1));
    } else if (event.name === "down" || event.name === "j") {
      setScrollOffset((o) => Math.min(Math.max(0, renderedLines.length - viewHeight), o + 1));
    } else if (event.name === "pageup") {
      setScrollOffset((o) => Math.max(0, o - viewHeight));
    } else if (event.name === "pagedown") {
      setScrollOffset((o) => Math.min(Math.max(0, renderedLines.length - viewHeight), o + viewHeight));
    } else if (event.name === "g") {
      setScrollOffset(0);
    } else if (event.name === "G") {
      setScrollOffset(Math.max(0, renderedLines.length - viewHeight));
    }
  });

  const visibleLines = renderedLines.slice(scrollOffset, scrollOffset + viewHeight);
  const fileName = filePath ? path.basename(filePath) : "No file selected";
  const borderColor = focused ? "magenta" : "gray";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      <box style={{ paddingX: 1, justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text style={{ fg: "magenta", bold: true }}>📖 Markdown Preview</text>
          <text style={{ fg: "gray", dim: true }}>- {fileName}</text>
        </box>
        <text style={{ fg: "gray" }}>
          {renderedLines.length > 0 ? `${scrollOffset + 1}/${renderedLines.length}` : ""}
        </text>
      </box>
      <scrollbox style={{ flexDirection: "column", paddingX: 1, flexGrow: 1 }}>
        {visibleLines.length > 0 ? (
          visibleLines.map((line, index) => (
            <box key={index} style={{ flexDirection: "row" }}>
              {line.indent && <text>{" ".repeat(line.indent * 2)}</text>}
              <text
                style={{
                  fg: (line.style.fg || "white") as any,
                  bold: line.style.bold,
                  dim: line.style.dim,
                }}
              >
                {line.text}
              </text>
            </box>
          ))
        ) : (
          <text style={{ fg: "gray", dim: true }}>No content to preview</text>
        )}
      </scrollbox>
    </box>
  );
}
