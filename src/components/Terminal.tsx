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
  const [scrollOffset, setScrollOffset] = useState(0);

  // Fixed dimensions for stable PTY
  // Default to larger width to utilize space better if dimensions are pending
  const cols = dimensions?.width || 120;
  const treeWidth = 30; // Approximation if we don't know state, but ideally should be passed via props
  // Terminal panel is about 2/3 of screen width (after tree panel of ~30 cols)
  // Give it more space: -2 instead of -4 for margin
  const termCols = Math.max(40, cols - treeWidth - 2);
  const safeHeight = typeof height === 'number' && !isNaN(height) ? Math.floor(height) : 30;
  // Subtract terminal chrome: top border (1) + bottom border (1) = 2
  // We remove the internal header to gain more space for CLI tools like Claude Code
  const termRows = Math.max(5, safeHeight - 2);

  const vtRef = useRef<VirtualTerminal | null>(null);
  const terminalRef = useRef<TerminalRef | null>(null);
  const procRef = useRef<{ kill: () => void } | null>(null);
  const initRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const scheduleUpdate = useCallback(() => {
    // Prevent updates after unmount
    if (!isMountedRef.current) return;
    // If we are scrolling, don't auto-scroll to bottom unless offset is 0
    if (pendingUpdateRef.current) return;
    pendingUpdateRef.current = true;

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return; // Double-check before setState
      pendingUpdateRef.current = false;
      setRenderCount((n) => n + 1);
      // Optional: Auto-reset scroll if new data comes? 
      // Typically terminals stay scrolled unless at bottom. 
      // Implementation: We let the user manually scroll back.
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



    // Enable Mouse Tracking (Send to stdout so real terminal sees it)

    process.stdout.write("\x1b[?1000h");

    // Also enable SGR mouse mode for better coordinate handling

    process.stdout.write("\x1b[?1006h");



    const shell = process.env.SHELL || "/bin/zsh";



    try {

      const proc = Bun.spawn([shell], {

        terminal: {

          data(terminal: TerminalRef, data: Uint8Array) {

            terminalRef.current = terminal;

            const text = new TextDecoder().decode(data);

            // Handle Cursor Position Report (CPR) query: ESC [ 6 n

            // DISABLED to prevent echo artifacts

            /* if (text.includes("\x1b[6n") && vtRef.current) {

              const { row, col } = vtRef.current.getCursor();

              // Respond with ESC [ row ; col R (1-indexed)

              terminal.write(`\x1b[${row + 1};${col + 1}R`);

            } */



            if (vtRef.current) {

              vtRef.current.write(text);

              // Reset scroll if we were at the bottom (offset 0)

              // If user is scrolled up, we might want to keep it, but standard behavior 

              // often jumps to bottom on output or keeps view. 

              // Let's keep view for now to allow reading history while outputting.

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

          if (terminalRef.current && isMountedRef.current) {

            terminalRef.current.write(text);

            setScrollOffset(0); // Jump to bottom on input

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
      // Mark as unmounted FIRST to prevent any state updates
      isMountedRef.current = false;

      // Disable Mouse Tracking on cleanup
      process.stdout.write("\x1b[?1000l");
      process.stdout.write("\x1b[?1006l");

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Kill the PTY process
      procRef.current?.kill();
    };

  }, [cwd, scheduleUpdate, onPasteReady, onCopyReady]);



  // Debounce resize to prevent infinite loop crashes in Yoga/OpenTUI

  useEffect(() => {

    const timer = setTimeout(() => {

      if (terminalRef.current && vtRef.current && initialized && termCols > 5 && termRows > 3) {

        try {

          // Only resize if dimensions actually changed significantly

          const currentRows = vtRef.current.getRows();

          const currentCols = vtRef.current.getCols();

          if (Math.abs(currentRows - termRows) > 0 || Math.abs(currentCols - termCols) > 1) {

            terminalRef.current.resize(termCols, termRows);

            vtRef.current.resize(termRows, termCols);

          }

        } catch { }

      }

    }, 100); // 100ms debounce

    return () => clearTimeout(timer);

  }, [termCols, termRows, initialized]);





  // Handle keyboard input

  useKeyboard((event) => {

    if (!focused || !terminalRef.current) return;



    // Alt + Arrows for scrolling (Minimalist Keyboard friendly)



    // Also support Ctrl + Shift + Arrows as a robust alternative



    if ((event.meta && event.name === "up") || (event.ctrl && event.shift && event.name === "up")) {



      setScrollOffset(prev => Math.min(prev + 15, vtRef.current?.getHistorySize() || 0));



      return;



    }



    if ((event.meta && event.name === "down") || (event.ctrl && event.shift && event.name === "down")) {



      setScrollOffset(prev => Math.max(prev - 15, 0));



      return;



    }



    if (event.meta) return;

    if (event.shift && event.name === "tab") return;

    // Scroll Handling

    if (event.name === "pageup") {


      setScrollOffset(prev => Math.min(prev + termRows, vtRef.current?.getHistorySize() || 0));
      return;
    }
    if (event.name === "pagedown") {
      setScrollOffset(prev => Math.max(prev - termRows, 0));
      return;
    }
    if (event.shift && event.name === "up") {
      setScrollOffset(prev => Math.min(prev + 1, vtRef.current?.getHistorySize() || 0));
      return;
    }
    if (event.shift && event.name === "down") {
      setScrollOffset(prev => Math.max(prev - 1, 0));
      return;
    }

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
      setScrollOffset(0); // Jump to bottom on enter
    } else if (event.name === "backspace") {
      data = "\x7f";
      setScrollOffset(0);
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
    } else if (event.name === "delete") {
      data = "\x1b[3~";
    } else if (event.name === "insert") {
      data = "\x1b[2~";
    } else if (event.name === "space") {
      data = " ";
      setScrollOffset(0);
    } else if (event.name && event.name.length === 1 && !event.ctrl && !event.meta) {
      data = event.name;
      setScrollOffset(0); // Jump to bottom on typing
    }

    if (data) {
      terminalRef.current.write(data);
    }
  });

  // Use getView to support scrolling
  const buffer = vtRef.current?.getView(scrollOffset, termRows) || [];
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
        const isCursor = cursorVisible && focused && cursor?.row === r && cursor?.col === c;
        const isInverse = cell?.style?.inverse || false;

        // Handle inverse mode (swap fg/bg) - used by Claude Code for user messages
        let cellFg = cell?.style?.fg || "white";
        let cellBg = cell?.style?.bg || "transparent";

        if (isInverse) {
          // User messages use inverse - show as white text on transparent bg
          cellFg = "white";
          cellBg = "transparent";
        }

        if (isCursor) {
          cellFg = "black";
          cellBg = "#d4a800";
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
        {renderRows.map((rowSegments, rowIdx) => {
          // Concatenate all segments into a single string per row
          // This avoids Yoga "measure functions cannot have children" errors
          const rowText = rowSegments.map(seg => seg.text || "").join("");
          return (
            <text key={rowIdx} style={{ fg: "white" as any }}>
              {rowText || " "}
            </text>
          );
        })}
      </box>
    </box>
  );

}
