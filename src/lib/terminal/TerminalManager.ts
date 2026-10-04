/**
 * TerminalManager - owns the terminal tabs of a project for the life of the app.
 *
 * Sessions used to live inside the <Terminal> component, so anything that unmounted
 * it (Zen mode, maximizing the viewer, opening the agent panel, shrinking the window
 * into mini mode) killed the shell and whatever ran in it. Components now only attach
 * to sessions held here.
 */
import { TerminalSession } from "./TerminalSession";

export interface TerminalTab {
  id: number;
  session: TerminalSession;
}

export interface TerminalManagerState {
  tabs: TerminalTab[];
  activeId: number | null;
}

export class TerminalManager {
  private state: TerminalManagerState = { tabs: [], activeId: null };
  private listeners = new Set<() => void>();
  private seq = 0;
  /** Last size a view reported; new tabs start at it. */
  private size = { cols: 80, rows: 24 };

  constructor(private cwd: string, private command?: string[]) {}

  getState = () => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(patch: Partial<TerminalManagerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  get active(): TerminalSession | null {
    return this.state.tabs.find((t) => t.id === this.state.activeId)?.session ?? null;
  }

  setSize(cols: number, rows: number) {
    this.size = { cols, rows };
  }

  /** Create the first tab if there is none (called once a view knows its size). */
  ensureTab() {
    if (this.state.tabs.length === 0) this.newTab();
  }

  newTab(command = this.command): TerminalSession {
    const session = new TerminalSession({ cwd: this.cwd, cols: this.size.cols, rows: this.size.rows, command });
    const tab = { id: ++this.seq, session };
    // A tab whose program exits closes itself, unless it is the last one
    // (that one offers "Enter to restart" instead).
    session.onExit(() => {
      if (this.state.tabs.length > 1) this.close(tab.id);
    });
    // Titles and running/exited state are shown on the tab strip.
    session.onTitle(() => this.set({}));
    session.onStatus(() => this.set({}));
    this.set({ tabs: [...this.state.tabs, tab], activeId: tab.id });
    return session;
  }

  close(id: number) {
    const i = this.state.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    const tab = this.state.tabs[i]!;
    const tabs = this.state.tabs.filter((t) => t.id !== id);
    let activeId = this.state.activeId;
    if (activeId === id) activeId = (tabs[Math.min(i, tabs.length - 1)] ?? null)?.id ?? null;
    this.set({ tabs, activeId });
    tab.session.dispose();
  }

  closeActive() {
    if (this.state.activeId !== null) this.close(this.state.activeId);
  }

  activate(id: number) {
    if (this.state.tabs.some((t) => t.id === id)) this.set({ activeId: id });
  }

  cycle(delta: number) {
    const { tabs, activeId } = this.state;
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    this.set({ activeId: tabs[(i + delta + tabs.length) % tabs.length]!.id });
  }

  disposeAll() {
    for (const t of this.state.tabs) t.session.dispose();
    this.set({ tabs: [], activeId: null });
  }
}

const managers = new Map<string, TerminalManager>();

/** The app-wide manager for a project directory. */
export function getTerminalManager(cwd: string): TerminalManager {
  let m = managers.get(cwd);
  if (!m) {
    m = new TerminalManager(cwd);
    managers.set(cwd, m);
  }
  return m;
}

export function disposeAllTerminals() {
  for (const m of managers.values()) m.disposeAll();
}
