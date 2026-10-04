import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";

/**
 * Session state to persist between sessions
 */
export interface SessionState {
  version: number;
  openTabs: string[]; // File paths of open tabs
  activeTab: string | null; // Currently active tab
  focusedPanel: string; // Which panel has focus
  treeWidth: number; // Sidebar width
  showAgent: boolean; // Whether agent panel is visible
  recentFiles: string[]; // Recently opened files
  terminalHeight?: number; // Terminal panel height ratio
  lastOpened: number; // Timestamp of last session
}

const SESSION_VERSION = 1;
const DEFAULT_SESSION_DIR = path.join(os.homedir(), ".termide");
const SESSION_FILE = "session.json";

// Overridable for tests (and TERMIDE_SESSION_DIR); defaults to ~/.termide.
let sessionDirOverride: string | null = null;

/**
 * Directory where session files live.
 */
export function getSessionDir(): string {
  return sessionDirOverride ?? process.env.TERMIDE_SESSION_DIR ?? DEFAULT_SESSION_DIR;
}

/**
 * Point session storage somewhere else (null restores the default).
 */
export function setSessionDir(dir: string | null): void {
  sessionDirOverride = dir;
}

/**
 * Get session file path for a project
 */
export function getSessionPath(projectPath: string): string {
  // 2026-10-04: this used a base64 prefix of the path truncated to 32 chars
  // (= the first 24 bytes of the path), so every project under the same
  // parent directory (e.g. /Users/<name>/projects/...) shared one session
  // file and restored each other's tabs. Use a real hash of the full path.
  const hash = createHash("sha256").update(path.resolve(projectPath)).digest("hex").slice(0, 32);
  return path.join(getSessionDir(), `${hash}_${SESSION_FILE}`);
}

/**
 * Ensure session directory exists
 */
function ensureSessionDir(): void {
  const dir = getSessionDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Parse a stored session, filling any missing/invalid fields with defaults.
 * Returns null if the data is not a session object at all.
 */
function parseStoredSession(data: string): SessionState | null {
  const parsed: unknown = JSON.parse(data);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = parsed as Partial<SessionState>;
  const session: SessionState = { ...createDefaultSession(), ...raw };
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  session.openTabs = strings(raw.openTabs);
  session.recentFiles = strings(raw.recentFiles);
  if (typeof session.activeTab !== "string") session.activeTab = null;
  return session;
}

/**
 * Create default session state
 */
export function createDefaultSession(): SessionState {
  return {
    version: SESSION_VERSION,
    openTabs: [],
    activeTab: null,
    focusedPanel: "tree",
    treeWidth: 30,
    showAgent: false,
    recentFiles: [],
    lastOpened: Date.now(),
  };
}

/**
 * Load session state for a project
 */
export function loadSession(projectPath: string): SessionState {
  try {
    ensureSessionDir();
    const sessionPath = getSessionPath(projectPath);

    if (!fs.existsSync(sessionPath)) {
      return createDefaultSession();
    }

    const data = fs.readFileSync(sessionPath, "utf-8");
    const session = parseStoredSession(data);

    // Validate version
    if (!session || session.version !== SESSION_VERSION) {
      // In future, could migrate old sessions
      return createDefaultSession();
    }

    // Validate that files still exist
    session.openTabs = session.openTabs.filter((file) => {
      try {
        return fs.existsSync(file);
      } catch {
        return false;
      }
    });

    session.recentFiles = session.recentFiles.filter((file) => {
      try {
        return fs.existsSync(file);
      } catch {
        return false;
      }
    });

    // Update active tab if it no longer exists
    if (session.activeTab && !session.openTabs.includes(session.activeTab)) {
      session.activeTab = session.openTabs[0] || null;
    }

    return session;
  } catch (e) {
    console.error("Failed to load session:", e);
    return createDefaultSession();
  }
}

/**
 * Save session state for a project
 */
export function saveSession(projectPath: string, state: Partial<SessionState>): void {
  try {
    ensureSessionDir();
    const sessionPath = getSessionPath(projectPath);

    // Load existing or create new.
    // 2026-10-04: a stored file missing fields (e.g. `{"version":1}`) made
    // `updated.recentFiles.length` throw, so every later save failed and the
    // broken file was never replaced. Missing fields now fall back to defaults.
    let session = createDefaultSession();
    try {
      if (fs.existsSync(sessionPath)) {
        const data = fs.readFileSync(sessionPath, "utf-8");
        session = parseStoredSession(data) ?? session;
      }
    } catch {}

    // Merge in new state
    const updated: SessionState = {
      ...session,
      ...state,
      version: SESSION_VERSION,
      lastOpened: Date.now(),
    };

    // Limit recent files to 20
    if (updated.recentFiles.length > 20) {
      updated.recentFiles = updated.recentFiles.slice(0, 20);
    }

    // Limit open tabs to 50
    if (updated.openTabs.length > 50) {
      updated.openTabs = updated.openTabs.slice(0, 50);
    }

    fs.writeFileSync(sessionPath, JSON.stringify(updated, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

/**
 * Add a file to recent files list
 */
export function addRecentFile(projectPath: string, filePath: string): void {
  try {
    const session = loadSession(projectPath);
    const recentFiles = session.recentFiles.filter((f) => f !== filePath);
    recentFiles.unshift(filePath);
    saveSession(projectPath, { recentFiles });
  } catch (e) {
    console.error("Failed to add recent file:", e);
  }
}

/**
 * Clear session for a project
 */
export function clearSession(projectPath: string): void {
  try {
    const sessionPath = getSessionPath(projectPath);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  } catch (e) {
    console.error("Failed to clear session:", e);
  }
}

/**
 * List all saved sessions
 */
export function listSessions(): { path: string; lastOpened: number }[] {
  try {
    ensureSessionDir();
    const files = fs.readdirSync(getSessionDir());
    const sessions: { path: string; lastOpened: number }[] = [];

    for (const file of files) {
      if (file.endsWith(`_${SESSION_FILE}`)) {
        try {
          const data = fs.readFileSync(path.join(getSessionDir(), file), "utf-8");
          const session = JSON.parse(data) as SessionState;
          sessions.push({ path: file, lastOpened: session.lastOpened });
        } catch {}
      }
    }

    return sessions.sort((a, b) => b.lastOpened - a.lastOpened);
  } catch {
    return [];
  }
}
