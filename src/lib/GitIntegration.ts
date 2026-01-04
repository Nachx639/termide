import * as path from "path";

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
  stashed: number;
  clean: boolean;
}

export interface FileGitStatus {
  status: "M" | "A" | "D" | "R" | "C" | "U" | "?" | "!" | " ";
  staged: boolean;
}

// Cache for git status to avoid too many shell calls
let gitStatusCache: { status: GitStatus; timestamp: number } | null = null;
let fileStatusCache: Map<string, FileGitStatus> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL = 2000; // 2 seconds cache

async function runGitCommand(args: string[], cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output;
  } catch {
    return null;
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const now = Date.now();

  // Return cached if fresh
  if (gitStatusCache && now - gitStatusCache.timestamp < CACHE_TTL) {
    return gitStatusCache.status;
  }

  const defaultStatus: GitStatus = {
    isRepo: false,
    branch: null,
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicts: 0,
    stashed: 0,
    clean: true,
  };

  // Check if it's a git repo
  const isRepo = await runGitCommand(["rev-parse", "--is-inside-work-tree"], cwd);
  if (isRepo !== "true") {
    gitStatusCache = { status: defaultStatus, timestamp: now };
    return defaultStatus;
  }

  // Get branch name
  const branch = await runGitCommand(["branch", "--show-current"], cwd) ||
    await runGitCommand(["rev-parse", "--short", "HEAD"], cwd);

  // Get ahead/behind
  let ahead = 0;
  let behind = 0;
  const aheadBehind = await runGitCommand(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], cwd);
  if (aheadBehind) {
    const parts = aheadBehind.split(/\s+/);
    if (parts.length === 2) {
      behind = parseInt(parts[0] || "0") || 0;
      ahead = parseInt(parts[1] || "0") || 0;
    }
  }

  // Get status counts
  const statusOutput = await runGitCommand(["status", "--porcelain=v1"], cwd);
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let conflicts = 0;

  if (statusOutput) {
    const lines = statusOutput.split("\n").filter(Boolean);
    for (const line of lines) {
      const x = line[0]; // staged status
      const y = line[1]; // working tree status

      // Conflicts
      if (x === "U" || y === "U" || (x === "D" && y === "D") || (x === "A" && y === "A")) {
        conflicts++;
        continue;
      }

      // Staged changes
      if (x !== " " && x !== "?") {
        staged++;
      }

      // Modified in working tree
      if (y !== " " && y !== "?") {
        modified++;
      }

      // Untracked
      if (x === "?") {
        untracked++;
      }
    }
  }

  // Get stash count
  const stashList = await runGitCommand(["stash", "list"], cwd);
  const stashed = stashList ? stashList.split("\n").filter(Boolean).length : 0;

  const status: GitStatus = {
    isRepo: true,
    branch,
    ahead,
    behind,
    staged,
    modified,
    untracked,
    conflicts,
    stashed,
    clean: staged === 0 && modified === 0 && untracked === 0 && conflicts === 0,
  };

  gitStatusCache = { status, timestamp: now };
  return status;
}

export async function getFileGitStatus(filePath: string, cwd: string): Promise<FileGitStatus | null> {
  const now = Date.now();

  // Refresh cache if stale
  if (now - cacheTimestamp > CACHE_TTL) {
    fileStatusCache.clear();
    cacheTimestamp = now;

    try {
      const statusOutput = await runGitCommand(["status", "--porcelain=v1", "-uall"], cwd);
      if (statusOutput) {
        const lines = statusOutput.split("\n");
        for (const line of lines) {
          if (line.length < 4) continue;
          const x = line[0] || " ";
          const y = line[1] || " ";

          // Git porcelain v1: XY PATH (where XY are status codes)
          // The path starts at index 3. If there's an extra space, it's safer to trim starting spaces.
          const file = line.slice(3).trimStart();
          const fullPath = path.resolve(cwd, file);

          // Staged entry
          if (x !== " " && x !== "?") {
            fileStatusCache.set(`${fullPath}:staged`, { status: x as any, staged: true });
          }
          // Unstaged entry
          if (y !== " " && y !== "?") {
            fileStatusCache.set(`${fullPath}:unstaged`, { status: y as any, staged: false });
          }
          // Untracked/Other
          if (x === "?" || y === "?") {
            fileStatusCache.set(`${fullPath}:unstaged`, { status: "?", staged: false });
          }
        }
      }
    } catch {
      // Failed to run git status
    }
  }

  return fileStatusCache.get(filePath) || null;
}

export function formatGitBranch(status: GitStatus): string {
  if (!status.isRepo || !status.branch) return "";

  let result = ` ${status.branch}`;

  if (status.ahead > 0 || status.behind > 0) {
    if (status.ahead > 0) result += `↑${status.ahead}`;
    if (status.behind > 0) result += `↓${status.behind}`;
  }

  return result;
}

export function formatGitStatus(status: GitStatus): string {
  if (!status.isRepo) return "";
  if (status.clean) return "✓";

  const parts: string[] = [];
  if (status.staged > 0) parts.push(`+${status.staged}`);
  if (status.modified > 0) parts.push(`~${status.modified}`);
  if (status.untracked > 0) parts.push(`?${status.untracked}`);
  if (status.conflicts > 0) parts.push(`!${status.conflicts}`);
  if (status.stashed > 0) parts.push(`⚑${status.stashed}`);

  return parts.join(" ");
}

export function getFileStatusColor(status: FileGitStatus | null): string {
  if (!status) return "white";

  switch (status.status) {
    case "M": return status.staged ? "green" : "#d4a800";
    case "A": return "green";
    case "D": return "red";
    case "R": return "cyan";
    case "C": return "cyan";
    case "U": return "red";
    case "?": return "gray";
    case "!": return "gray";
    default: return "white";
  }
}

export function getFileStatusIcon(status: FileGitStatus | null): string {
  if (!status) return "  ";

  switch (status.status) {
    case "M": return status.staged ? "● " : "○ ";
    case "A": return "+ ";
    case "D": return "- ";
    case "R": return "→ ";
    case "C": return "◇ ";
    case "U": return "! ";
    case "?": return "? ";
    case "!": return "  ";
    default: return "  ";
  }
}

// Force refresh cache
export function invalidateGitCache(): void {
  gitStatusCache = null;
  fileStatusCache.clear();
  cacheTimestamp = 0;
}

// Stage a file
export async function stageFile(filePath: string, cwd: string): Promise<boolean> {
  const result = await runGitCommand(["add", filePath], cwd);
  invalidateGitCache();
  return result !== null;
}

// Unstage a file
export async function unstageFile(filePath: string, cwd: string): Promise<boolean> {
  const result = await runGitCommand(["reset", "HEAD", filePath], cwd);
  invalidateGitCache();
  return result !== null;
}

// Stage all files
export async function stageAllFiles(cwd: string): Promise<boolean> {
  const result = await runGitCommand(["add", "-A"], cwd);
  invalidateGitCache();
  return result !== null;
}

// Unstage all files
export async function unstageAllFiles(cwd: string): Promise<boolean> {
  const result = await runGitCommand(["reset", "HEAD"], cwd);
  invalidateGitCache();
  return result !== null;
}

// Create a commit
export async function createCommit(message: string, cwd: string): Promise<boolean> {
  const result = await runGitCommand(["commit", "-m", message], cwd);
  invalidateGitCache();
  return result !== null;
}

// Get diff for a file
export async function getFileDiff(filePath: string, cwd: string, staged: boolean = false): Promise<string> {
  const args = staged
    ? ["diff", "--cached", "--color=never", "--", filePath]
    : ["diff", "--color=never", "--", filePath];
  const result = await runGitCommand(args, cwd);
  return result || "";
}

// Discard changes to a file (checkout HEAD version)
export async function discardFileChanges(filePath: string, cwd: string): Promise<boolean> {
  const result = await runGitCommand(["checkout", "HEAD", "--", filePath], cwd);
  invalidateGitCache();
  return result !== null;
}

export async function getGitChanges(cwd: string): Promise<{ path: string; status: FileGitStatus }[]> {
  const statusOutput = await runGitCommand(["status", "--porcelain=v1", "-uall"], cwd);
  if (!statusOutput) return [];

  const changes: { path: string; status: FileGitStatus }[] = [];
  const lines = statusOutput.split("\n").filter(Boolean);

  for (const line of lines) {
    if (line.length < 4) continue;

    // Porcelain v1 format: XY PATH
    const x = line[0] || " ";
    const y = line[1] || " ";
    const file = line.slice(3).trimStart();

    // Untracked
    if (x === "?" || y === "?") {
      changes.push({ path: file, status: { status: "?", staged: false } });
      continue;
    }

    // Handle staged
    if (x !== " ") {
      changes.push({ path: file, status: { status: x as any, staged: true } });
    }

    // Handle unstaged
    if (y !== " ") {
      changes.push({ path: file, status: { status: y as any, staged: false } });
    }
  }

  return changes;
}

// Line diff status for inline gutter
export type LineDiffStatus = "added" | "modified" | "deleted" | null;

export interface LineDiffInfo {
  lineNumber: number;
  status: LineDiffStatus;
}

// Cache for line diffs
const lineDiffCache: Map<string, { diffs: LineDiffInfo[]; timestamp: number }> = new Map();
const LINE_DIFF_CACHE_TTL = 3000; // 3 seconds

export async function getFileLineDiffs(filePath: string, cwd: string): Promise<LineDiffInfo[]> {
  const now = Date.now();
  const cacheKey = filePath;

  // Return cached if fresh
  const cached = lineDiffCache.get(cacheKey);
  if (cached && now - cached.timestamp < LINE_DIFF_CACHE_TTL) {
    return cached.diffs;
  }

  const diffs: LineDiffInfo[] = [];

  try {
    // Get the relative path from cwd
    const relativePath = filePath.startsWith(cwd)
      ? filePath.slice(cwd.length + 1)
      : filePath;

    // First check if file is tracked
    const lsFiles = await runGitCommand(["ls-files", relativePath], cwd);
    const isTracked = lsFiles && lsFiles.trim().length > 0;

    if (!isTracked) {
      // Untracked file - all lines are "added"
      try {
        const content = await Bun.file(filePath).text();
        const lineCount = content.split("\n").length;
        for (let i = 1; i <= lineCount; i++) {
          diffs.push({ lineNumber: i, status: "added" });
        }
      } catch {
        // File doesn't exist or can't be read
      }
    } else {
      // Get diff output with line numbers
      // --unified=0 gives us just the changed lines without context
      const diffOutput = await runGitCommand(
        ["diff", "--unified=0", "--no-color", "HEAD", "--", relativePath],
        cwd
      );

      if (diffOutput) {
        // Parse diff output
        // Format: @@ -start,count +start,count @@ ...
        const hunkRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
        let match;

        while ((match = hunkRegex.exec(diffOutput)) !== null) {
          const oldStart = parseInt(match[1] || "0");
          const oldCount = parseInt(match[2] || "1");
          const newStart = parseInt(match[3] || "0");
          const newCount = parseInt(match[4] || "1");

          if (oldCount === 0 && newCount > 0) {
            // Pure addition
            for (let i = 0; i < newCount; i++) {
              diffs.push({ lineNumber: newStart + i, status: "added" });
            }
          } else if (oldCount > 0 && newCount === 0) {
            // Pure deletion - mark the line before as having a deletion
            diffs.push({ lineNumber: newStart, status: "deleted" });
          } else {
            // Modification
            for (let i = 0; i < newCount; i++) {
              diffs.push({ lineNumber: newStart + i, status: "modified" });
            }
          }
        }
      }
    }
  } catch (e) {
    // Failed to get diff
  }

  lineDiffCache.set(cacheKey, { diffs, timestamp: now });
  return diffs;
}

// Get gutter indicator for a line
export function getLineDiffIndicator(status: LineDiffStatus): { char: string; color: string } {
  switch (status) {
    case "added":
      return { char: "┃", color: "#4ec9b0" }; // Green
    case "modified":
      return { char: "┃", color: "#569cd6" }; // Blue
    case "deleted":
      return { char: "▼", color: "#f14c4c" }; // Red triangle pointing down
    default:
      return { char: " ", color: "gray" };
  }
}

export async function getGitLog(cwd: string, count: number = 20): Promise<string[]> {
  const logOutput = await runGitCommand([
    "log",
    `-${count}`,
    "--graph",
    "--oneline",
    "--all",
    "--color=never",
    "--pretty=format:%h %s (%cr)"
  ], cwd);

  if (!logOutput) return [];
  return logOutput.split("\n");
}
