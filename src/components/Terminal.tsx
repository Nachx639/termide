import React, { useState, useEffect, useRef, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { VirtualTerminal } from "../lib/VirtualTerminal";

interface TerminalProps {
  cwd: string;
  focused: boolean;
  onFocusRequest: () => void;
  height?: number;
  onPasteReady?: (pasteFn: (text: string) => void) => void;
  onCopyReady?: (copyFn: () => string) => void;
}

interface TerminalRef {
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
}

export function Terminal({ cwd, focused, onFocusRequest, height = 30, onPasteReady, onCopyReady }: TerminalProps) {
  const dimensions = useTerminalDimensions();
  const [renderCount, setRenderCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixed dimensions for stable PTY
  const cols = dimensions?.columns || 80;
  // Terminal panel is about 2/3 of screen width (after tree panel of ~30 cols)
  const termCols = Math.max(30, cols - 34);
  const safeHeight = typeof height === 'number' && !isNaN(height) ? height : 30;
  const termRows = Math.max(10, safeHeight - 3);

  const vtRef = useRef<VirtualTerminal | null>(null);
  const terminalRef = useRef<TerminalRef | null>(null);
  const procRef = useRef<{ kill: () => void } | null>(null);
  const initRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleUpdate = useCallback(() => {
    if (pendingUpdateRef.current) return;
    pendingUpdateRef.current = true;

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      pendingUpdateRef.current = false;
      setRenderCount((n) => n + 1);
    }, 16);
  }, []);

  // Initialize PTY only once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Use actual visible size so apps like Claude adapt to it
    const initCols = Math.max(80, termCols);
    const initRows = Math.max(15, termRows);

    vtRef.current = new VirtualTerminal(initRows, initCols);

    const shell = process.env.SHELL || "/bin/zsh";

    try {
      const proc = Bun.spawn([shell], {
        terminal: {
          cols: initCols,
          rows: initRows,
          data(terminal: TerminalRef, data: Uint8Array) {
            if (vtRef.current) {
              const text = new TextDecoder().decode(data);
              vtRef.current.write(text);
              scheduleUpdate();
            }
            terminalRef.current = terminal;
          },
        },
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
        cwd: cwd,
      });

      procRef.current = proc;
      setInitialized(true);
      setError(null);

      if (onPasteReady) {
        onPasteReady((text: string) => {
          if (terminalRef.current) {
            terminalRef.current.write(text);
          }
        });
      }

      if (onCopyReady) {
        onCopyReady(() => {
          if (!vtRef.current) return "";
          const buffer = vtRef.current.getBuffer();
          const lines: string[] = [];
          for (const row of buffer) {
            let line = "";
            for (const cell of row) {
              line += cell?.char || " ";
            }
            lines.push(line.trimEnd());
          }
          while (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop();
          }
          return lines.join("\n");
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to spawn terminal");
    }

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      procRef.current?.kill();
    };
  }, [cwd, scheduleUpdate, onPasteReady, onCopyReady]);

  // Handle resize after init
  useEffect(() => {
    if (terminalRef.current && vtRef.current && initialized && termCols > 5 && termRows > 3) {
      try {
        terminalRef.current.resize(termCols, termRows);
        vtRef.current.resize(termRows, termCols);
      } catch {}
    }
  }, [termCols, termRows, initialized]);

  // Handle keyboard input
  useKeyboard((event) => {
    if (!focused || !terminalRef.current) return;
    if (event.meta) return;
    if (event.shift && event.name === "tab") return;

    let data = "";

    if (event.ctrl && event.name === "c") {
      data = "\x03";
    } else if (event.ctrl && event.name === "d") {
      data = "\x04";
    } else if (event.ctrl && event.name === "z") {
      data = "\x1a";
    } else if (event.ctrl && event.name === "l") {
      data = "\x0c";
    } else if (event.ctrl && event.name === "a") {
      data = "\x01";
    } else if (event.ctrl && event.name === "e") {
      data = "\x05";
    } else if (event.ctrl && event.name === "k") {
      data = "\x0b";
    } else if (event.ctrl && event.name === "u") {
      data = "\x15";
    } else if (event.ctrl && event.name === "w") {
      data = "\x17";
    } else if (event.name === "return") {
      data = "\r";
    } else if (event.name === "backspace") {
      data = "\x7f";
    } else if (event.name === "tab" && !event.shift) {
      data = "\t";
    } else if (event.name === "escape") {
      data = "\x1b";
    } else if (event.name === "up") {
      data = "\x1b[A";
    } else if (event.name === "down") {
      data = "\x1b[B";
    } else if (event.name === "right") {
      data = "\x1b[C";
    } else if (event.name === "left") {
      data = "\x1b[D";
    } else if (event.name === "home") {
      data = "\x1b[H";
    } else if (event.name === "end") {
      data = "\x1b[F";
    } else if (event.name === "pageup") {
      data = "\x1b[5~";
    } else if (event.name === "pagedown") {
      data = "\x1b[6~";
    } else if (event.name === "delete") {
      data = "\x1b[3~";
    } else if (event.name === "insert") {
      data = "\x1b[2~";
    } else if (event.name === "space") {
      data = " ";
    } else if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      data = event.name;
    }

    if (data) {
      terminalRef.current.write(data);
    }
  });

  const buffer = vtRef.current?.getBuffer() || [];
  const borderColor = focused ? "cyan" : "gray";

  if (error) {
    return (
      <box style={{ flexDirection: "column", border: true, borderColor: "red", height: "100%" }}>
        <box style={{ paddingX: 1 }}>
          <text style={{ fg: "red", bold: true }}>Terminal Error</text>
        </box>
        <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
          <text style={{ fg: "red" }}>{error}</text>
        </box>
      </box>
    );
  }

  if (!initialized) {
    return (
      <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
        <box style={{ paddingX: 1, justifyContent: "space-between" }}>
          <text style={{ fg: "cyan", bold: true }}>Terminal</text>
          <text style={{ fg: "gray" }}>Initializing...</text>
        </box>
        <box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
          <text style={{ fg: "yellow" }}>Starting shell...</text>
        </box>
      </box>
    );
  }

  // Render all rows of the buffer (buffer size matches visible area)
  const renderCols = Math.max(termCols, 80);
  const visibleRows = termRows - 2; // -2 for header

  const lines: string[] = [];
  for (let r = 0; r < visibleRows; r++) {
    const row = buffer[r];
    if (!row) {
      lines.push("");
      continue;
    }
    let line = "";
    for (let c = 0; c < Math.min(renderCols, row.length); c++) {
      line += row[c]?.char || " ";
    }
    lines.push(line.trimEnd());
  }

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      <box style={{ paddingX: 1 }}>
        <text style={{ fg: "cyan", bold: true }}>Terminal</text>
      </box>

      <box style={{ flexDirection: "column", flexGrow: 1, overflow: "hidden" }}>
        {lines.map((line, rowIdx) => (
          <text key={rowIdx}>{line}</text>
        ))}
      </box>
    </box>
  );
}
