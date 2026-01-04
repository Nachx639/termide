import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
const SESSION_DIR = path.join(os.homedir(), ".termide");
const SESSION_FILE = "session.json";

/**
 * Get session file path for a project
 */
function getSessionPath(projectPath: string): string {
  // Create a hash of the project path for the session file name
  const hash = Buffer.from(projectPath).toString("base64").replace(/[/+=]/g, "_").slice(0, 32);
  return path.join(SESSION_DIR, `${hash}_${SESSION_FILE}`);
}

/**
 * Ensure session directory exists
 */
function ensureSessionDir(): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
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
    const session = JSON.parse(data) as SessionState;

    // Validate version
    if (session.version !== SESSION_VERSION) {
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

    // Load existing or create new
    let session = createDefaultSession();
    try {
      if (fs.existsSync(sessionPath)) {
        const data = fs.readFileSync(sessionPath, "utf-8");
        session = JSON.parse(data) as SessionState;
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
    const files = fs.readdirSync(SESSION_DIR);
    const sessions: { path: string; lastOpened: number }[] = [];

    for (const file of files) {
      if (file.endsWith(`_${SESSION_FILE}`)) {
        try {
          const data = fs.readFileSync(path.join(SESSION_DIR, file), "utf-8");
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
