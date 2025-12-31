import React, { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import * as fs from "fs";
import * as path from "path";

interface FileViewerProps {
  filePath: string | null;
  focused: boolean;
}

export function FileViewer({ filePath, focused }: FileViewerProps) {
  const [content, setContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const viewHeight = 20;

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
      // Fallback if watch fails (some OS or file systems)
      console.error("Watcher error:", e);
    }
  }, [filePath]);


  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "up" || event.name === "k") {
      setScrollOffset((o) => Math.max(0, o - 1));
    } else if (event.name === "down" || event.name === "j") {
      setScrollOffset((o) => Math.min(Math.max(0, content.length - viewHeight), o + 1));
    } else if (event.name === "pageup") {
      setScrollOffset((o) => Math.max(0, o - viewHeight));
    } else if (event.name === "pagedown") {
      setScrollOffset((o) => Math.min(Math.max(0, content.length - viewHeight), o + viewHeight));
    } else if (event.name === "g") {
      setScrollOffset(0);
    } else if (event.name === "G") {
      setScrollOffset(Math.max(0, content.length - viewHeight));
    }
  });

  const visibleLines = content.slice(scrollOffset, scrollOffset + viewHeight);
  const fileName = filePath ? path.basename(filePath) : "No file selected";
  const borderColor = focused ? "cyan" : "gray";

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      <box style={{ paddingX: 1, justifyContent: "space-between" }}>
        <text style={{ fg: "cyan", bold: true }}>{fileName}</text>
        <text style={{ fg: "gray" }}>
          {filePath ? `${scrollOffset + 1}-${Math.min(scrollOffset + viewHeight, content.length)}/${content.length}` : ""}
        </text>
      </box>
      <scrollbox style={{ flexDirection: "column", paddingX: 1, flexGrow: 1 }}>
        {filePath ? (
          visibleLines.map((line, index) => {
            const lineNum = scrollOffset + index + 1;
            return (
              <box key={index} style={{ flexDirection: "row" }}>
                <text style={{ fg: "gray" }}>{String(lineNum).padStart(4, " ")} </text>
                <text>{line}</text>
              </box>
            );
          })
        ) : (
          <box style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <text style={{ fg: "gray" }}>Select a file from the explorer</text>
            <text style={{ fg: "gray", dim: true }}>Use j/k to navigate, Enter to open</text>
          </box>
        )}
      </scrollbox>
    </box>
  );
}
