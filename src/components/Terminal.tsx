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
  /** Receives a function that opens the scrollback search bar (Ctrl+X /). */
  onSearchReady?: (openSearch: () => void) => void;
}

export function Terminal({ cwd, focused, onFocusRequest, onPasteReady, onCopyReady, onWriteReady, selectMode = false, command, onOpenFile, onSearchReady }: TerminalProps) {
  const renderer = useRenderer();
  // Shared, app-lifetime sessions: unmounting this component must not kill the shell.
  const [manager] = useState(() => (command ? new TerminalManager(cwd, command) : getTerminalManager(cwd)));
  const { tabs, activeId, split } = useSyncExternalStore(manager.subscribe, manager.getState);
  const active = tabs.find((t) => t.id === activeId)?.session ?? null;

  // A private (test) manager dies with the component; the shared one lives on.
  useEffect(() => () => {
    if (command) manager.disposeAll();
  }, [manager, command]);

  // Scrollback search (Ctrl+X /).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ line: number; col: number; len: number }[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);

  useEffect(() => {
    onSearchReady?.(() => setSearchOpen(true));
  }, [onSearchReady]);

  const runSearch = useCallback(
    (q: string) => {
      setQuery(q);
      const s = manager.active;
      const found = s ? s.find(q) : [];
      setMatches(found);
      // Start from the most recent occurrence, like scrolling up from the prompt.
      const idx = found.length - 1;
      setMatchIndex(idx);
      if (s && idx >= 0) s.revealLine(found[idx]!.line);
    },
    [manager],
  );

  const stepMatch = (delta: number) => {
    const s = manager.active;
    if (!s || matches.length === 0) return;
    const idx = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(idx);
    s.revealLine(matches[idx]!.line);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    setMatches([]);
    setMatchIndex(-1);
    manager.active?.scrollToBottom();
  };

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

    // Search bar open: typing goes to its <input>; Enter = older match,
    // Shift+Enter = newer, Esc closes.
    if (searchOpen) {
      if (event.name === "escape") closeSearch();
      else if (event.name === "return") stepMatch(event.shift ? 1 : -1);
      else if (event.name === "up") stepMatch(-1);
      else if (event.name === "down") stepMatch(1);
      return;
    }

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
              {split ? "  Ctrl+X: O other pane · \\ unsplit · T new · W close" : "  Ctrl+X: Tab leave · T new · \\ split · ]/[ switch · W close"}
            </text>
          )}
        </box>
      )}
      {searchOpen && (
        <box style={{ paddingX: 1, height: 1, flexDirection: "row", flexShrink: 0, backgroundColor: "#1a1a1a" }}>
          <text style={{ fg: "green", bg: "#1a1a1a", attributes: TextAttributes.BOLD, flexShrink: 0 }}>{"/ "}</text>
          <input
            focused={focused && searchOpen}
            value={query}
            placeholder="search output…"
            onInput={(v: string) => runSearch(v)}
            onSubmit={() => {}}
            style={{ flexGrow: 1, backgroundColor: "#1a1a1a", textColor: "white", placeholderColor: "gray", cursorColor: "green" }}
          />
          <text wrapMode="none" style={{ fg: matches.length ? "green" : "gray", bg: "#1a1a1a", flexShrink: 0 }}>
            {matches.length
              ? `  ${matchIndex + 1}/${matches.length}${matches.length >= 2000 ? "+" : ""}  Enter:older Shift+Enter:newer Esc:close`
              : query
                ? "  no matches  Esc:close"
                : "  Esc:close"}
          </text>
        </box>
      )}
      {split ? (
        // Side by side: the focused pane gets the cursor, keys, search and links.
        <box style={{ flexGrow: 1, flexDirection: "row", paddingX: 1 }}>
          {[split.left, split.right].map((id, i) => {
            const session = tabs.find((t) => t.id === id)?.session ?? null;
            const isActive = id === activeId;
            return (
              <React.Fragment key={id}>
                {i === 1 && <box style={{ width: 1, border: ["left"], borderColor: focused ? "cyan" : "gray", flexShrink: 0 }} />}
                <box style={{ flexGrow: 1, flexBasis: 0 }} onMouseDown={() => manager.activate(id)}>
                  <terminal-view
                    session={session}
                    terminalFocused={focused && isActive}
                    onTerminalSize={isActive ? onTerminalSize : undefined}
                    onOpenPath={isActive ? onOpenPath : undefined}
                    matches={isActive && searchOpen ? matches.map((m, j) => ({ ...m, active: j === matchIndex })) : undefined}
                    style={{ flexGrow: 1 }}
                  />
                </box>
              </React.Fragment>
            );
          })}
        </box>
      ) : (
        <box style={{ flexGrow: 1, paddingX: 1 }}>
          <terminal-view session={active} terminalFocused={focused} onTerminalSize={onTerminalSize} onOpenPath={onOpenPath}
            matches={searchOpen ? matches.map((m, i) => ({ ...m, active: i === matchIndex })) : undefined}
            style={{ flexGrow: 1 }}
          />
        </box>
      )}
    </box>
  );
}
