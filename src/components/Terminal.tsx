import React, { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { TerminalSession } from "../lib/terminal/TerminalSession";
import { isTerminalHostKey } from "../lib/terminal/keyRouting";
import "./TerminalView";

interface TerminalProps {
  cwd: string;
  focused: boolean;
  onFocusRequest: () => void;
  height?: number;
  onPasteReady?: (pasteFn: (text: string) => void) => void;
  onCopyReady?: (copyFn: () => string) => void;
  /** Raw input to the PTY (control keys), unlike paste which may be bracketed. */
  onWriteReady?: (writeFn: (data: string) => void) => void;
  selectMode?: boolean; // When true, disable mouse tracking for native terminal selection
  /** argv to run instead of the login shell (tests, custom commands). */
  command?: string[];
}

export function Terminal({ cwd, focused, onFocusRequest, onPasteReady, onCopyReady, onWriteReady, selectMode = false, command }: TerminalProps) {
  const renderer = useRenderer();
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [title, setTitle] = useState("");
  const [exited, setExited] = useState<number | null | false>(false);
  const sessionRef = useRef<TerminalSession | null>(null);
  // First layout size; the shell is only started once we know it so its first
  // prompt is drawn for the real width (later resizes go through the view).
  const [initialSize, setInitialSize] = useState<{ cols: number; rows: number } | null>(null);
  const onTerminalSize = useCallback((cols: number, rows: number) => {
    setInitialSize((cur) => cur ?? { cols, rows });
  }, []);

  // One PTY per mounted terminal.
  useEffect(() => {
    if (!initialSize) return;
    const s = new TerminalSession({ cwd, cols: initialSize.cols, rows: initialSize.rows, command });
    sessionRef.current = s;
    setSession(s);
    const offTitle = s.onTitle(setTitle);
    const offExit = s.onExit((code) => setExited(code));
    const offUpdate = s.onUpdate(() => {
      if (!s.exited) setExited(false);
    });
    return () => {
      offTitle();
      offExit();
      offUpdate();
      s.dispose();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, initialSize !== null]);

  useEffect(() => {
    if (!session) return;
    onPasteReady?.((text) => session.paste(text));
    onCopyReady?.(() => session.getVisibleText());
    onWriteReady?.((data) => session.write(data));
  }, [session, onPasteReady, onCopyReady, onWriteReady]);

  // Bracketed paste from the host terminal (Cmd+V in most emulators).
  useEffect(() => {
    if (!renderer || !focused) return;
    const handlePaste = (event: any) => {
      const s = sessionRef.current;
      if (!s) return;
      const text = event.bytes instanceof Uint8Array ? new TextDecoder().decode(event.bytes) : String(event.bytes ?? "");
      s.paste(text);
      event.preventDefault?.();
    };
    renderer.keyInput.on("paste", handlePaste);
    return () => {
      renderer.keyInput.off("paste", handlePaste);
    };
  }, [renderer, focused]);

  // selectMode ON hands the mouse to the host terminal for native drag-to-select.
  useEffect(() => {
    if (!session) return;
    if (selectMode) {
      process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
    } else {
      process.stdout.write("\x1b[?1000h\x1b[?1006h");
    }
  }, [selectMode, session]);

  useKeyboard((event) => {
    const s = sessionRef.current;
    if (!focused || !s) return;
    if (isTerminalHostKey(event)) return;

    // Scrollback: Shift+PageUp/PageDown, Shift+Up/Down, Alt+Up/Down.
    const page = Math.max(1, s.rows - 1);
    if (event.shift && event.name === "pageup") return s.scrollBy(page);
    if (event.shift && event.name === "pagedown") return s.scrollBy(-page);
    if (!s.isAlternateScreen) {
      if ((event.shift || event.meta) && !event.ctrl && event.name === "up") return s.scrollBy(event.meta ? page : 1);
      if ((event.shift || event.meta) && !event.ctrl && event.name === "down") return s.scrollBy(event.meta ? -page : -1);
    }

    // Cmd+V where the host forwards it as a key instead of a bracketed paste.
    if (event.super && event.name === "v") {
      (async () => {
        try {
          const proc = Bun.spawn(["pbpaste"], { stdout: "pipe" });
          const text = await new Response(proc.stdout).text();
          sessionRef.current?.paste(text);
        } catch {}
      })();
      return;
    }

    if (s.sendKey(event)) event.preventDefault();
  });

  const borderColor = focused ? "cyan" : "gray";
  const shellName = (process.env.SHELL || "/bin/zsh").split("/").pop() || "zsh";
  const cwdShort = cwd.replace(process.env.HOME || "", "~");
  const status = exited !== false ? ` exited${exited !== null ? ` (${exited})` : ""} · Enter to restart ` : "";
  const bottomTitle = ` ${status || `${title || shellName} · ${cwdShort}`} `;

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}
      bottomTitle={bottomTitle}
      bottomTitleAlignment="right"
      onMouseDown={onFocusRequest}
    >
      {focused && (
        <box style={{ paddingX: 1, height: 1, flexDirection: "row" }}>
          <text style={{ fg: "black", bg: "cyan", attributes: TextAttributes.BOLD }}> FOCUS </text>
          <text style={{ fg: "cyan", attributes: TextAttributes.BOLD }}> Terminal</text>
          <text style={{ fg: "gray" }}>  Ctrl+X Tab: leave · Shift+PgUp: scroll</text>
        </box>
      )}
      <box style={{ flexGrow: 1, paddingX: 1 }}>
        <terminal-view session={session} terminalFocused={focused} onTerminalSize={onTerminalSize} style={{ flexGrow: 1 }} />
      </box>
    </box>
  );
}
