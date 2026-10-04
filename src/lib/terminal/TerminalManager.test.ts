import { test, expect } from "bun:test";
import { TerminalManager } from "./TerminalManager";

async function waitFor(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await Bun.sleep(20);
  }
  throw new Error("timeout");
}

test("tabs: create, cycle, close keeps a sensible active tab", () => {
  const m = new TerminalManager(process.cwd(), ["/bin/sh", "-c", "sleep 5"]);
  try {
    m.ensureTab();
    m.ensureTab(); // idempotent
    expect(m.getState().tabs.length).toBe(1);
    const a = m.getState().activeId;
    m.newTab();
    m.newTab();
    const ids = m.getState().tabs.map((t) => t.id);
    expect(m.getState().activeId).toBe(ids[2]!);
    m.cycle(1);
    expect(m.getState().activeId).toBe(a);
    m.cycle(-1);
    expect(m.getState().activeId).toBe(ids[2]!);
    m.close(ids[2]!);
    expect(m.getState().activeId).toBe(ids[1]!);
    m.close(ids[0]!);
    expect(m.getState().tabs.map((t) => t.id)).toEqual([ids[1]!]);
  } finally {
    m.disposeAll();
  }
});

test("a tab whose program exits closes itself unless it is the last one", async () => {
  const m = new TerminalManager(process.cwd(), ["/bin/sh", "-c", "sleep 5"]);
  try {
    m.ensureTab();
    m.newTab(["/bin/sh", "-c", "exit 0"]);
    await waitFor(() => m.getState().tabs.length === 1);
    const last = m.getState().tabs[0]!.session;
    expect(m.active).toBe(last);
    const solo = new TerminalManager(process.cwd(), ["/bin/sh", "-c", "exit 0"]);
    solo.ensureTab();
    await waitFor(() => solo.active?.exited === true);
    expect(solo.getState().tabs.length).toBe(1);
    solo.disposeAll();
  } finally {
    m.disposeAll();
  }
});

test("new tabs start at the last reported view size", async () => {
  const m = new TerminalManager(process.cwd(), ["/bin/sh", "-c", "stty size; sleep 5"]);
  try {
    m.setSize(77, 13);
    m.ensureTab();
    await waitFor(() => m.active!.getVisibleText().includes("13 77"));
  } finally {
    m.disposeAll();
  }
});

test("background tabs get activity and bell marks; viewing clears them", async () => {
  const m = new TerminalManager(process.cwd(), ["/bin/sh", "-c", "sleep 5"]);
  const bells: number[] = [];
  m.onBell((_tab, i) => bells.push(i));
  try {
    m.ensureTab();
    const first = m.getState().activeId!;
    m.setWatching(true);
    // Second tab prints and rings the bell, but the user is looking at it → no marks.
    m.newTab(["/bin/sh", "-c", "sleep 0.3; printf 'done\\a'; sleep 5"]);
    m.activate(first); // now the second tab is in the background
    await waitFor(() => m.getState().tabs[1]!.bell);
    expect(m.getState().tabs[1]!.activity).toBe(true);
    expect(bells).toEqual([1]);
    m.cycle(1); // look at it
    expect(m.getState().tabs[1]!.bell).toBe(false);
    expect(m.getState().tabs[1]!.activity).toBe(false);
  } finally {
    m.disposeAll();
  }
});
