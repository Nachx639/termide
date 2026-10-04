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
  /** New output since the tab was last active. */
  activity: boolean;
  /** The program rang the bell (e.g. an agent waiting for input) while not watched. */
  bell: boolean;
}

export interface TerminalManagerState {
  tabs: TerminalTab[];
  /** The focused tab (in a split, the focused pane's tab). */
  activeId: number | null;
  /** Side-by-side view: tab ids shown left and right (one of them is activeId). */
  split: { left: number; right: number } | null;
}

export class TerminalManager {
  private state: TerminalManagerState = { tabs: [], activeId: null, split: null };
  private listeners = new Set<() => void>();
  private seq = 0;
  /** Last size a view reported; new tabs start at it. */
  private size = { cols: 80, rows: 24 };
  /** Whether the terminal panel is on screen and focused (then nothing is "unseen"). */
  private watching = false;
  private bellListeners = new Set<(tab: TerminalTab, index: number) => void>();

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
    const tab: TerminalTab = { id: ++this.seq, session, activity: false, bell: false };
    // A tab whose program exits closes itself, unless it is the last one
    // (that one offers "Enter to restart" instead).
    session.onExit(() => {
      if (this.state.tabs.length > 1) this.close(tab.id);
    });
    // Titles and running/exited state are shown on the tab strip.
    session.onTitle(() => this.set({}));
    session.onStatus(() => this.set({}));
    session.onUpdate(() => {
      if (this.isSeen(tab.id)) return;
      // Look up the current tab object: patchTab replaces it, `tab` is the original.
      if (this.state.tabs.find((t) => t.id === tab.id)?.activity !== false) return;
      this.patchTab(tab.id, { activity: true });
    });
    session.onBell(() => {
      if (this.isSeen(tab.id)) return;
      this.patchTab(tab.id, { bell: true });
      const i = this.state.tabs.findIndex((t) => t.id === tab.id);
      const current = this.state.tabs[i];
      if (current) this.bellListeners.forEach((l) => l(current, i));
    });
    this.set({ tabs: [...this.state.tabs, tab] });
    // In a split, the new tab replaces the focused pane's tab.
    this.activate(tab.id);
    return session;
  }

  private isSeen(id: number) {
    return this.watching && this.state.activeId === id;
  }

  private patchTab(id: number, patch: Partial<Pick<TerminalTab, "activity" | "bell">>) {
    this.set({ tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  /** The terminal panel became visible+focused (or stopped being): clears the active tab's marks. */
  setWatching(watching: boolean) {
    this.watching = watching;
    if (watching && this.state.activeId !== null) this.patchTab(this.state.activeId, { activity: false, bell: false });
  }

  /** Called when a tab rings the bell while nobody is looking at it. */
  onBell(l: (tab: TerminalTab, index: number) => void) {
    this.bellListeners.add(l);
    return () => this.bellListeners.delete(l);
  }

  close(id: number) {
    const i = this.state.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    const tab = this.state.tabs[i]!;
    const tabs = this.state.tabs.filter((t) => t.id !== id);
    let activeId = this.state.activeId;
    let split = this.state.split;
    if (split && (split.left === id || split.right === id)) {
      // Closing one side of a split leaves the other side, unsplit.
      const other = split.left === id ? split.right : split.left;
      split = null;
      if (activeId === id) activeId = other;
    }
    if (activeId === id) activeId = (tabs[Math.min(i, tabs.length - 1)] ?? null)?.id ?? null;
    this.set({ tabs, activeId, split });
    tab.session.dispose();
  }

  closeActive() {
    if (this.state.activeId !== null) this.close(this.state.activeId);
  }

  activate(id: number) {
    if (!this.state.tabs.some((t) => t.id === id)) return;
    const split = this.state.split;
    if (split && split.left !== id && split.right !== id && this.state.activeId !== null) {
      // Show the tab in the focused pane.
      const focusedLeft = split.left === this.state.activeId;
      this.set({ activeId: id, split: focusedLeft ? { left: id, right: split.right } : { left: split.left, right: id } });
    } else {
      this.set({ activeId: id });
    }
    if (this.watching) this.patchTab(id, { activity: false, bell: false });
  }

  /** Toggle the side-by-side view: split opens a new tab on the right. */
  toggleSplit() {
    if (this.state.split) {
      this.set({ split: null });
      return;
    }
    const left = this.state.activeId;
    if (left === null) return;
    const session = this.newTab();
    const right = this.state.tabs.find((t) => t.session === session)!.id;
    this.set({ split: { left, right }, activeId: right });
  }

  /** In a split, move focus to the other pane. */
  focusOtherPane() {
    const split = this.state.split;
    if (!split) return;
    this.activate(this.state.activeId === split.left ? split.right : split.left);
  }

  cycle(delta: number) {
    const { tabs, activeId } = this.state;
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    this.activate(tabs[(i + delta + tabs.length) % tabs.length]!.id);
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
