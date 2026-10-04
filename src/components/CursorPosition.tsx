import React, { useSyncExternalStore } from "react";

/**
 * Editor cursor position for the status bar. It used to be state in <App>, so
 * every keystroke and cursor move re-rendered the whole IDE; now only this
 * text re-renders.
 */
let position = { line: 1, column: 1 };
const listeners = new Set<() => void>();

export function setCursorPosition(line: number, column: number) {
  if (position.line === line && position.column === column) return;
  position = { line, column };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function CursorPosition() {
  const { line, column } = useSyncExternalStore(subscribe, () => position);
  return (
    <text style={{ fg: "gray" }}>
      Ln {line}, Col {column}
    </text>
  );
}
