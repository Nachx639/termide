import { test, expect, describe, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createDefaultSession,
  loadSession,
  saveSession,
  addRecentFile,
  clearSession,
  listSessions,
  getSessionDir,
  setSessionDir,
  getSessionPath,
} from "./SessionManager";

let sessionDir: string;
let projectDir: string;

beforeEach(() => {
  // Never touch ~/.termide from tests
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "termide sessions "));
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "termide project "));
  setSessionDir(sessionDir);
});

afterEach(() => {
  setSessionDir(null);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
});

function touch(name: string): string {
  const f = path.join(projectDir, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "");
  return f;
}

describe("session directory", () => {
  test("defaults to ~/.termide and can be overridden", () => {
    setSessionDir(null);
    const saved = process.env.TERMIDE_SESSION_DIR;
    delete process.env.TERMIDE_SESSION_DIR;
    try {
      expect(getSessionDir()).toBe(path.join(os.homedir(), ".termide"));
    } finally {
      if (saved !== undefined) process.env.TERMIDE_SESSION_DIR = saved;
    }
    setSessionDir(sessionDir);
    expect(getSessionDir()).toBe(sessionDir);
    expect(path.dirname(getSessionPath(projectDir))).toBe(sessionDir);
  });

  test("is created on demand", () => {
    const nested = path.join(sessionDir, "a", "b");
    setSessionDir(nested);
    saveSession(projectDir, { treeWidth: 40 });
    expect(fs.existsSync(getSessionPath(projectDir))).toBe(true);
  });
});

describe("getSessionPath", () => {
  test("projects sharing a long common prefix get different session files", () => {
    const base = "/Users/someone-with-a-long-name/projects/";
    expect(getSessionPath(base + "alpha")).not.toBe(getSessionPath(base + "beta"));
    expect(getSessionPath("/a/b")).toBe(getSessionPath("/a/b"));
  });

  test("file name is filesystem-safe for unicode and spaces", () => {
    const name = path.basename(getSessionPath("/tmp/ñandú project/🐜"));
    expect(name).toMatch(/^[0-9a-f]{32}_session\.json$/);
  });
});

describe("loadSession / saveSession", () => {
  test("missing session returns defaults", () => {
    const s = loadSession(projectDir);
    const d = createDefaultSession();
    expect({ ...s, lastOpened: 0 }).toEqual({ ...d, lastOpened: 0 });
  });

  test("round-trips state and merges partial updates", () => {
    const a = touch("a.ts");
    const b = touch("dir with space/b ñ.ts");
    saveSession(projectDir, { openTabs: [a, b], activeTab: b, treeWidth: 42, showAgent: true });
    saveSession(projectDir, { focusedPanel: "editor" });
    const s = loadSession(projectDir);
    expect(s.openTabs).toEqual([a, b]);
    expect(s.activeTab).toBe(b);
    expect(s.treeWidth).toBe(42);
    expect(s.showAgent).toBe(true);
    expect(s.focusedPanel).toBe("editor");
    expect(s.version).toBe(1);
  });

  test("different projects do not share sessions", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "termide project "));
    try {
      saveSession(projectDir, { treeWidth: 11 });
      saveSession(other, { treeWidth: 22 });
      expect(loadSession(projectDir).treeWidth).toBe(11);
      expect(loadSession(other).treeWidth).toBe(22);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  test("files deleted since the last session are dropped and the active tab is fixed up", () => {
    const keep = touch("keep.ts");
    const gone = touch("gone.ts");
    saveSession(projectDir, { openTabs: [gone, keep], activeTab: gone, recentFiles: [gone, keep] });
    fs.rmSync(gone);
    const s = loadSession(projectDir);
    expect(s.openTabs).toEqual([keep]);
    expect(s.recentFiles).toEqual([keep]);
    expect(s.activeTab).toBe(keep);

    fs.rmSync(keep);
    const s2 = loadSession(projectDir);
    expect(s2.openTabs).toEqual([]);
    expect(s2.activeTab).toBeNull();
  });

  test("limits recent files to 20 and open tabs to 50", () => {
    const many = Array.from({ length: 60 }, (_, i) => `/f${i}`);
    saveSession(projectDir, { openTabs: many, recentFiles: many });
    const raw = JSON.parse(fs.readFileSync(getSessionPath(projectDir), "utf-8"));
    expect(raw.openTabs).toHaveLength(50);
    expect(raw.recentFiles).toHaveLength(20);
    expect(raw.recentFiles[0]).toBe("/f0");
  });

  test("updates lastOpened on save", () => {
    const before = Date.now();
    saveSession(projectDir, {});
    expect(loadSession(projectDir).lastOpened).toBeGreaterThanOrEqual(before);
  });

  test("corrupt or foreign session files fall back to defaults without throwing", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const content of ["{not json", "null", "[]", '"str"', '{"version": 99, "treeWidth": 5}']) {
        fs.writeFileSync(getSessionPath(projectDir), content);
        const s = loadSession(projectDir);
        expect(s.treeWidth, content).toBe(30);
        expect(s.openTabs).toEqual([]);
      }
    } finally {
      errSpy.mockRestore();
    }
  });

  test("a stored session with missing fields can still be loaded and saved over", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      fs.writeFileSync(getSessionPath(projectDir), JSON.stringify({ version: 1, treeWidth: 33 }));
      const loaded = loadSession(projectDir);
      expect(loaded.treeWidth).toBe(33);
      expect(loaded.openTabs).toEqual([]);
      expect(loaded.recentFiles).toEqual([]);

      const f = touch("x.ts");
      saveSession(projectDir, { openTabs: [f] });
      expect(errSpy).not.toHaveBeenCalled();
      const s = loadSession(projectDir);
      expect(s.openTabs).toEqual([f]);
      expect(s.treeWidth).toBe(33);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("non-string entries in stored arrays are ignored", () => {
    const f = touch("ok.ts");
    fs.writeFileSync(
      getSessionPath(projectDir),
      JSON.stringify({ ...createDefaultSession(), openTabs: [f, 42, null], recentFiles: "nope" })
    );
    const s = loadSession(projectDir);
    expect(s.openTabs).toEqual([f]);
    expect(s.recentFiles).toEqual([]);
  });
});

describe("addRecentFile", () => {
  test("moves the file to the front without duplicates", () => {
    const a = touch("a.ts");
    const b = touch("b.ts");
    addRecentFile(projectDir, a);
    addRecentFile(projectDir, b);
    addRecentFile(projectDir, a);
    expect(loadSession(projectDir).recentFiles).toEqual([a, b]);
  });

  test("keeps at most 20 entries", () => {
    const files = Array.from({ length: 25 }, (_, i) => touch(`f${i}.ts`));
    for (const f of files) addRecentFile(projectDir, f);
    const recent = loadSession(projectDir).recentFiles;
    expect(recent).toHaveLength(20);
    expect(recent[0]).toBe(files[24]!);
  });
});

describe("clearSession / listSessions", () => {
  test("clearSession removes only that project's session", () => {
    const other = "/some/other/project";
    saveSession(projectDir, { treeWidth: 44 });
    saveSession(other, { treeWidth: 55 });
    clearSession(projectDir);
    expect(fs.existsSync(getSessionPath(projectDir))).toBe(false);
    expect(fs.existsSync(getSessionPath(other))).toBe(true);
    expect(loadSession(projectDir).treeWidth).toBe(30);
    expect(() => clearSession(projectDir)).not.toThrow();
  });

  test("listSessions lists saved sessions, newest first, skipping junk", async () => {
    saveSession("/p/one", {});
    await Bun.sleep(5);
    saveSession("/p/two", {});
    fs.writeFileSync(path.join(sessionDir, "broken_session.json"), "{");
    fs.writeFileSync(path.join(sessionDir, "unrelated.txt"), "x");
    const sessions = listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.path).toBe(path.basename(getSessionPath("/p/two")));
    expect(sessions[0]!.lastOpened).toBeGreaterThanOrEqual(sessions[1]!.lastOpened);
  });

  test("listSessions on an empty directory", () => {
    expect(listSessions()).toEqual([]);
  });
});
