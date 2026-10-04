/**
 * One file-system watcher per project, shared by every panel that shows file or
 * git state. Panels used to poll on their own timers (git status every 3-10 s,
 * from four places), which cost CPU while idle and showed an agent's changes
 * up to 10 s late. Now a change under the project (including .git/index, HEAD,
 * refs) notifies subscribers after a short debounce; a slow safety poll covers
 * platforms without recursive fs.watch.
 */
import * as fs from "fs";

type Listener = () => void;

interface Watcher {
  listeners: Set<Listener>;
  watcher: fs.FSWatcher | null;
  timer: ReturnType<typeof setTimeout> | null;
  poll: ReturnType<typeof setInterval>;
}

const watchers = new Map<string, Watcher>();
// node_modules, git's object store / logs, and index.lock (written by every
// git command that refreshes the index; the index itself still notifies).
const IGNORED = /(^|[\\/])(node_modules|\.git[\\/]objects|\.git[\\/]logs)([\\/]|$)|\.git[\\/]index\.lock$/;
const DEBOUNCE_MS = 250;
const SAFETY_POLL_MS = 30_000;

function fire(w: Watcher) {
  w.timer = null;
  for (const l of w.listeners) {
    try {
      l();
    } catch {}
  }
}

function schedule(w: Watcher) {
  if (w.timer) clearTimeout(w.timer);
  w.timer = setTimeout(() => fire(w), DEBOUNCE_MS);
}

/** Call `listener` whenever something under `root` changes. Returns an unsubscribe. */
export function onRepoChange(root: string, listener: Listener): () => void {
  let w = watchers.get(root);
  if (!w) {
    const created: Watcher = { listeners: new Set(), watcher: null, timer: null, poll: setInterval(() => fire(created), SAFETY_POLL_MS) };
    try {
      created.watcher = fs.watch(root, { recursive: true }, (_event, file) => {
        if (file && IGNORED.test(file.toString())) return;
        schedule(created);
      });
    } catch {
      // No recursive watch here: the safety poll still refreshes.
    }
    w = created;
    watchers.set(root, w);
  }
  w.listeners.add(listener);
  const owner = w;
  return () => {
    owner.listeners.delete(listener);
    if (owner.listeners.size === 0) {
      owner.watcher?.close();
      clearInterval(owner.poll);
      if (owner.timer) clearTimeout(owner.timer);
      watchers.delete(root);
    }
  };
}

/** Notify subscribers now (e.g. after the IDE itself staged or committed). */
export function notifyRepoChange(root: string) {
  const w = watchers.get(root);
  if (w) schedule(w);
}
