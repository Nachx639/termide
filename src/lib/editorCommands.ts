/**
 * Commands for the focused editor that must also be reachable from the command
 * palette: some of their shortcuts (Ctrl+Shift+O, Ctrl+Shift+Z) cannot be typed
 * in terminals without the kitty keyboard protocol.
 */
export type EditorCommand = "symbols" | "blame" | "undo" | "redo" | "save" | "definition";

const handlers = new Set<(cmd: EditorCommand) => void>();
// A command issued while focus is still moving to the editor (palette closing)
// waits briefly for the editor to register.
let pending: { cmd: EditorCommand; at: number } | null = null;

/** The focused editor registers here. */
export function onEditorCommand(handler: (cmd: EditorCommand) => void): () => void {
  handlers.add(handler);
  if (pending && Date.now() - pending.at < 1000) {
    const { cmd } = pending;
    pending = null;
    handler(cmd);
  }
  return () => {
    handlers.delete(handler);
  };
}

export function runEditorCommand(cmd: EditorCommand) {
  if (handlers.size === 0) {
    pending = { cmd, at: Date.now() };
    return;
  }
  for (const h of handlers) h(cmd);
}
