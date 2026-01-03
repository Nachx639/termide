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
  const [cursorBlink, setCursorBlink] = useState(true);

  // Fixed dimensions for stable PTY
  const cols = dimensions?.width || 80;
  const treeWidth = 30;
  // Terminal panel is about 2/3 of screen width (after tree panel of ~30 cols)
  const termCols = Math.max(30, cols - treeWidth - 4);
  const safeHeight = typeof height === 'number' && !isNaN(height) ? height : 30;
  // Subtract terminal chrome: top border (1) + bottom border (1) = 2
  // We remove the internal header to gain more space for CLI tools like Claude Code
  const termRows = Math.max(10, safeHeight - 2);

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
          data(terminal: TerminalRef, data: Uint8Array) {
            terminalRef.current = terminal;
            const text = new TextDecoder().decode(data);

            // Handle Cursor Position Report (CPR) query: ESC [ 6 n
            if (text.includes("\x1b[6n") && vtRef.current) {
              const { row, col } = vtRef.current.getCursor();
              // Respond with ESC [ row ; col R (1-indexed)
              terminal.write(`\x1b[${row + 1};${col + 1}R`);
            }

            if (vtRef.current) {
              vtRef.current.write(text);
              scheduleUpdate();
            }
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
      } catch { }
    }
  }, [termCols, termRows, initialized]);

  // Cursor blink effect
  useEffect(() => {
    if (!focused) {
      setCursorBlink(true);
      return;
    }
    const blinkInterval = setInterval(() => {
      setCursorBlink((b) => !b);
    }, 530);
    return () => clearInterval(blinkInterval);
  }, [focused]);

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

  // Build styled segments for each row by grouping identical styles
  type StyledSegment = { text: string; fg?: string; bg?: string; dim?: boolean; bold?: boolean; isCursor?: boolean };

  const cursor = vtRef.current?.getCursor();
  const cursorVisible = vtRef.current?.cursorVisible ?? true;
  const renderCols = termCols;
  const visibleRows = termRows;
  const renderRows: StyledSegment[][] = [];
  for (let r = 0; r < visibleRows; r++) {
    const row = buffer[r];
    const segments: StyledSegment[] = [];

    if (row) {
      let currentText = "";
      let currentStyles = { fg: "", bg: "", dim: false, bold: false, isCursor: false };

      for (let c = 0; c < Math.min(renderCols, row.length); c++) {
        const cell = row[c];
        const isCursor = cursorVisible && focused && cursorBlink && cursor?.row === r && cursor?.col === c;
        const isInverse = cell?.style?.inverse || false;

        // Remap magenta-ish colors to yellow for visual harmony
        const remapColor = (color: string): string => {
          if (color === "magenta" || color === "brightMagenta") return "#ffff55";
          if (color === "darkMagenta") return "#aa8800";

          // Check for RGB magenta variants
          if (color.startsWith("rgb(")) {
            const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
            if (match) {
              const r = parseInt(match[1]!);
              const g = parseInt(match[2]!);
              const b = parseInt(match[3]!);
              // Detect magenta-ish colors (high red, low green, high blue)
              if (r > 100 && g < 150 && b > 100 && Math.abs(r - b) < 100) {
                const brightness = Math.max(r, b);
                if (brightness > 200) return "#ffff55";
                if (brightness > 150) return "#dddd00";
                return "#aa8800";
              }
            }
          }

          // Check for hex color magenta variants
          if (color.startsWith("#") && color.length >= 7) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            // Detect magenta-ish colors
            if (r > 100 && g < 150 && b > 100 && Math.abs(r - b) < 100) {
              const brightness = Math.max(r, b);
              if (brightness > 200) return "#ffff55";
              if (brightness > 150) return "#dddd00";
              return "#aa8800";
            }
          }

          return color;
        };

        // Handle inverse style (used by apps like Claude Code for their cursor)
        let cellFg = remapColor(cell?.style?.fg || "white");
        let cellBg = remapColor(cell?.style?.bg || "transparent");

        if (isInverse) {
          // Swap foreground and background
          const tempFg = cellFg;
          cellFg = cellBg === "transparent" ? "black" : cellBg;
          cellBg = tempFg;
        }

        if (isCursor) {
          cellFg = "black";
          cellBg = "white";
        }

        const cellDim = cell?.style?.dim || false;
        const cellBold = cell?.style?.bold || false;
        const char = cell?.char || " ";

        const stylesChanged =
          cellFg !== currentStyles.fg ||
          cellBg !== currentStyles.bg ||
          cellDim !== currentStyles.dim ||
          cellBold !== currentStyles.bold ||
          isCursor !== currentStyles.isCursor;

        if (c > 0 && stylesChanged) {
          segments.push({ text: currentText, ...currentStyles });
          currentText = char;
          currentStyles = { fg: cellFg, bg: cellBg, dim: cellDim, bold: cellBold, isCursor };
        } else {
          if (c === 0) {
            currentStyles = { fg: cellFg, bg: cellBg, dim: cellDim, bold: cellBold, isCursor };
          }
          currentText += char;
        }
      }
      if (currentText) {
        segments.push({ text: currentText, ...currentStyles });
      }

      // Pad the rest of the line with spaces to overwrite previous content
      if (row.length < renderCols) {
        segments.push({
          text: " ".repeat(renderCols - row.length),
          fg: "white",
          bg: "transparent",
          dim: false,
          bold: false,
          isCursor: false
        });
      }
    } else {
      segments.push({ text: " ".repeat(renderCols), fg: "white", bg: "transparent", dim: false, bold: false, isCursor: false });
    }
    renderRows.push(segments);
  }

  return (
    <box style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}>
      <box style={{ flexDirection: "column", flexGrow: 1, overflow: "hidden", paddingX: 1 }}>
        {renderRows.map((rowSegments, rowIdx) => (
          <box key={rowIdx} style={{ flexDirection: "row" }}>
            {rowSegments.map((seg, segIdx) => (
              <text
                key={segIdx}
                style={{
                  fg: seg.fg === "white" && seg.dim ? "#8a8a8a" : seg.fg as any,
                  bg: seg.bg as any,
                  bold: seg.bold,
                  dim: seg.dim && !seg.isCursor
                }}
              >
                {seg.text}
              </text>
            ))}
          </box>
        ))}
      </box>
    </box>
  );

}
