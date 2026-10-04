import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { getTerminalManager, TerminalManager } from "../lib/terminal/TerminalManager";
import { isTerminalHostKey } from "../lib/terminal/keyRouting";
import { resolvePathRef, type PathRef } from "../lib/terminal/pathLinks";
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
  /** argv to run instead of the login shell (tests); gets its own private manager. */
  command?: string[];
  /** Double-click on "path/to/file.ts:12" in the output. */
  onOpenFile?: (filePath: string, line?: number) => void;
}

export function Terminal({ cwd, focused, onFocusRequest, onPasteReady, onCopyReady, onWriteReady, selectMode = false, command, onOpenFile }: TerminalProps) {
  const renderer = useRenderer();
  // Shared, app-lifetime sessions: unmounting this component must not kill the shell.
  const [manager] = useState(() => (command ? new TerminalManager(cwd, command) : getTerminalManager(cwd)));
  const { tabs, activeId } = useSyncExternalStore(manager.subscribe, manager.getState);
  const active = tabs.find((t) => t.id === activeId)?.session ?? null;

  // A private (test) manager dies with the component; the shared one lives on.
  useEffect(() => () => {
    if (command) manager.disposeAll();
  }, [manager, command]);

  // While the terminal is on screen and focused, its active tab is "seen".
  useEffect(() => {
    manager.setWatching(focused);
    return () => manager.setWatching(false);
  }, [manager, focused]);

  // The first shell starts once layout tells us the real size, so its first
  // prompt is drawn for the right width (later resizes go through the view).
  const onTerminalSize = useCallback(
    (cols: number, rows: number) => {
      manager.setSize(cols, rows);
      manager.ensureTab();
    },
    [manager],
  );

  const onOpenPath = useCallback(
    async (ref: PathRef) => {
      const s = manager.active;
      if (!s || !onOpenFile) return;
      const shellDir = await s.currentDir();
      const file = resolvePathRef(ref, [shellDir, cwd].filter((d): d is string => !!d));
      if (file) onOpenFile(file, ref.line);
    },
    [manager, cwd, onOpenFile],
  );

  useEffect(() => {
    onPasteReady?.((text) => manager.active?.paste(text));
    // Copy / copy panel get the scrollback too (agent output rarely fits one screen).
    onCopyReady?.(() => manager.active?.getAllText().split("\n").slice(-5000).join("\n") ?? "");
    onWriteReady?.((data) => manager.active?.write(data));
  }, [manager, onPasteReady, onCopyReady, onWriteReady]);

  // Bracketed paste from the host terminal (Cmd+V in most emulators).
  useEffect(() => {
    if (!renderer || !focused) return;
    const handlePaste = (event: any) => {
      const s = manager.active;
      if (!s) return;
      const text = event.bytes instanceof Uint8Array ? new TextDecoder().decode(event.bytes) : String(event.bytes ?? "");
      s.paste(text);
      event.preventDefault?.();
    };
    renderer.keyInput.on("paste", handlePaste);
    return () => {
      renderer.keyInput.off("paste", handlePaste);
    };
  }, [renderer, focused, manager]);

  // selectMode ON hands the mouse to the host terminal for native drag-to-select.
  const hasSession = active !== null;
  useEffect(() => {
    if (!hasSession) return;
    if (selectMode) {
      process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
    } else {
      process.stdout.write("\x1b[?1000h\x1b[?1006h");
    }
  }, [selectMode, hasSession]);

  useKeyboard((event) => {
    const s = manager.active;
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
          manager.active?.paste(text);
        } catch {}
      })();
      return;
    }

    if (s.sendKey(event)) event.preventDefault();
  });

  const borderColor = focused ? "cyan" : "gray";
  const shellName = (process.env.SHELL || "/bin/zsh").split("/").pop() || "zsh";
  const cwdShort = cwd.replace(process.env.HOME || "", "~");
  const tabLabel = (title: string) => (title || shellName).slice(0, 24);
  const status = active?.exited ? ` exited${active.exitCode !== null ? ` (${active.exitCode})` : ""} · Enter to restart ` : "";
  const bottomTitle = ` ${status || `${tabLabel(active?.title ?? "")} · ${cwdShort}`} `;

  return (
    <box
      style={{ flexDirection: "column", border: true, borderColor, height: "100%" }}
      bottomTitle={bottomTitle}
      bottomTitleAlignment="right"
      onMouseDown={onFocusRequest}
    >
      {(focused || tabs.length > 1) && (
        <box style={{ paddingX: 1, height: 1, flexDirection: "row", flexShrink: 0 }}>
          {focused && <text style={{ fg: "black", bg: "cyan", attributes: TextAttributes.BOLD, flexShrink: 0 }}> FOCUS </text>}
          {tabs.length > 1 ? (
            tabs.map((t, i) => {
              const on = t.id === activeId;
              return (
                <text
                  key={t.id}
                  onMouseDown={() => manager.activate(t.id)}
                  style={{ fg: on ? "black" : t.session.exited ? "gray" : "white", bg: on ? "#d4a800" : undefined, attributes: on ? TextAttributes.BOLD : 0, flexShrink: 0 }}
                >
                  {` ${i + 1} ${tabLabel(t.session.title)}${t.bell ? " 🔔" : t.activity ? " •" : ""} `}
                </text>
              );
            })
          ) : (
            <text style={{ fg: "cyan", attributes: TextAttributes.BOLD, flexShrink: 0 }}> Terminal</text>
          )}
          {focused && (
            <text wrapMode="none" style={{ fg: "gray", flexShrink: 1 }}>
              {"  Ctrl+X: Tab leave · T new · ]/[ switch · W close"}
            </text>
          )}
        </box>
      )}
      <box style={{ flexGrow: 1, paddingX: 1 }}>
        <terminal-view session={active} terminalFocused={focused} onTerminalSize={onTerminalSize} onOpenPath={onOpenPath} style={{ flexGrow: 1 }} />
      </box>
    </box>
  );
}
