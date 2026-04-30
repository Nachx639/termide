import React, { useState, useEffect, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import * as fs from "fs";
import * as path from "path";
import { getTermideSyntaxStyle } from "../lib/SyntaxStyles";

interface MarkdownPreviewProps {
  filePath: string | null;
  focused: boolean;
  rootPath?: string;
}

/**
 * MarkdownPreview — Now powered by OpenTUI's native MarkdownRenderable.
 * 
 * Features gained from native rendering:
 * - Proper syntax-highlighted code blocks
 * - Selectable, columnar markdown tables (TextTable)
 * - Inline code, bold, italic, links with concealed markers
 * - Streaming support for real-time content
 * - Significantly better performance on large files
 */
export function MarkdownPreview({ filePath, focused, rootPath }: MarkdownPreviewProps) {
  const [content, setContent] = useState<string>("");
  const scrollBoxRef = useRef<any>(null);

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
  }, [filePath]);

  // Keyboard navigation for scroll
  useKeyboard((event) => {
    if (!focused || !scrollBoxRef.current) return;
    const scrollBox = scrollBoxRef.current;

    if (event.name === "up" || event.name === "k") {
      scrollBox.scrollBy(-1);
    } else if (event.name === "down" || event.name === "j") {
      scrollBox.scrollBy(1);
    } else if (event.name === "pageup") {
      scrollBox.scrollBy(-20);
    } else if (event.name === "pagedown") {
      scrollBox.scrollBy(20);
    } else if (event.name === "g") {
      scrollBox.scrollTo(0);
    } else if (event.name === "G") {
      scrollBox.scrollTo(scrollBox.scrollHeight);
    }
  });

  const fileName = filePath ? path.basename(filePath) : "No file selected";
  const borderColor = focused ? "#d4a800" : "gray";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      <box style={{ paddingX: 1, justifyContent: "space-between" }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text style={{ fg: "#d4a800", attributes: TextAttributes.BOLD }}>📖 Markdown Preview</text>
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>- {fileName}</text>
        </box>
      </box>
      <scrollbox
        ref={scrollBoxRef}
        focused={focused}
        style={{ flexGrow: 1, paddingX: 1 }}
        scrollY
      >
        {content ? (
          <markdown
            content={content}
            syntaxStyle={getTermideSyntaxStyle()}
            conceal
            tableOptions={{
              widthMode: "full",
              borders: true,
              borderStyle: "rounded",
              selectable: true,
              cellPadding: 1,
            }}
          />
        ) : (
          <text style={{ fg: "gray", attributes: TextAttributes.DIM }}>No content to preview</text>
        )}
      </scrollbox>
    </box>
  );
}
