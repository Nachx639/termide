import React, { useState, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { FileTree } from "./components/FileTree";
import { FileViewer } from "./components/FileViewer";
import { Terminal } from "./components/Terminal";
import * as path from "path";

type Panel = "tree" | "viewer" | "terminal";

interface AppProps {
  rootPath: string;
}

// Clipboard utilities - OSC52 for universal support + pbcopy fallback
function copyToClipboardOSC52(text: string): void {
  // OSC52 sequence: \x1b]52;c;<base64>\x07
  // Works in iTerm, Terminal.app, Kitty, Alacritty, tmux, and over SSH
  const base64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${base64}\x07`);
}

async function copyToClipboard(text: string): Promise<void> {
  // Try OSC52 first (works universally)
  copyToClipboardOSC52(text);
  // Also use pbcopy as backup for macOS
  try {
    const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
    proc.stdin.write(text);
    proc.stdin.end();
    await proc.exited;
  } catch {}
}

async function pasteFromClipboard(): Promise<string> {
  const proc = Bun.spawn(["pbpaste"], { stdout: "pipe" });
  const output = await new Response(proc.stdout).text();
  return output;
}

export function App({ rootPath }: AppProps) {
  const [focusedPanel, setFocusedPanel] = useState<Panel>("tree");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [clipboardContent, setClipboardContent] = useState<string>("");
  const dimensions = useTerminalDimensions();
  const terminalPasteRef = useRef<((text: string) => void) | null>(null);
  const terminalCopyRef = useRef<(() => string) | null>(null);

  useKeyboard(async (event) => {
    // Don't intercept Cmd+key - let terminal host handle copy/paste
    // Use Ctrl+Shift+C to copy entire panel content (Linux terminal standard)
    if (event.ctrl && event.shift && event.name === "c") {
      try {
        if (focusedPanel === "viewer" && selectedFile) {
          const content = await Bun.file(selectedFile).text();
          await copyToClipboard(content);
        } else if (focusedPanel === "terminal" && terminalCopyRef.current) {
          const content = terminalCopyRef.current();
          await copyToClipboard(content);
        }
      } catch {}
      return;
    }

    // Ctrl+Shift+V to paste to terminal
    if (event.ctrl && event.shift && event.name === "v") {
      if (focusedPanel === "terminal" && terminalPasteRef.current) {
        const text = await pasteFromClipboard();
        terminalPasteRef.current(text);
      }
      return;
    }

    // Global keybindings
    if (event.ctrl && event.name === "q") {
      process.exit(0);
    }

    // Panel navigation with Tab
    if (event.name === "tab" && !event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = ["tree", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        return order[(currentIndex + 1) % order.length];
      });
    } else if (event.name === "tab" && event.shift) {
      setFocusedPanel((current) => {
        const order: Panel[] = ["tree", "viewer", "terminal"];
        const currentIndex = order.indexOf(current);
        return order[(currentIndex - 1 + order.length) % order.length];
      });
    }

    // Number shortcuts
    if (event.name === "1") setFocusedPanel("tree");
    if (event.name === "2") setFocusedPanel("viewer");
    if (event.name === "3") setFocusedPanel("terminal");
  });

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    setFocusedPanel("viewer");
  };

  const treeWidth = 30;
  const mainWidth = (dimensions.columns || 80) - treeWidth - 4;
  const totalHeight = (dimensions.rows || 40) - 3; // -3 for header and status bar
  const viewerHeight = Math.floor(totalHeight * 0.4); // 40% for viewer
  const terminalHeight = totalHeight - viewerHeight; // 60% for terminal

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      {/* Header */}
      <box style={{ paddingX: 1, flexDirection: "row", gap: 1 }}>
        <text style={{ fg: "cyan", bold: true }}>termide</text>
        <text style={{ fg: "gray" }}>|</text>
        <text style={{ fg: "white" }}>{rootPath}</text>
        <text style={{ fg: "gray" }}>| Tab: switch | ^Q: quit</text>
      </box>

      {/* Main content */}
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        {/* File Tree - Left panel */}
        <box style={{ width: treeWidth }}>
          <FileTree
            rootPath={rootPath}
            onFileSelect={handleFileSelect}
            focused={focusedPanel === "tree"}
          />
        </box>

        {/* Right side - Viewer + Terminal (40/60 split) */}
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {/* File Viewer - Top right (40%) */}
          <box style={{ flexGrow: 2 }}>
            <FileViewer
              filePath={selectedFile}
              focused={focusedPanel === "viewer"}
            />
          </box>

          {/* Terminal - Bottom (60% height) */}
          <box style={{ flexGrow: 3 }}>
            <Terminal
              cwd={rootPath}
              focused={focusedPanel === "terminal"}
              onFocusRequest={() => setFocusedPanel("terminal")}
              onPasteReady={(pasteFn) => { terminalPasteRef.current = pasteFn; }}
              onCopyReady={(copyFn) => { terminalCopyRef.current = copyFn; }}
              height={terminalHeight}
            />
          </box>
        </box>
      </box>

      {/* Status bar */}
      <box style={{ paddingX: 1, bg: "black" }}>
        <text style={{ fg: "yellow" }}>
          {selectedFile ? path.relative(rootPath, selectedFile) : "No file"}
        </text>
        <text style={{ fg: "gray" }}> | </text>
        <text style={{ fg: "cyan" }}>Panel: {focusedPanel}</text>
      </box>
    </box>
  );
}
