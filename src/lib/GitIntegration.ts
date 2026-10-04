import * as fs from "fs";
import * as path from "path";
import { TIMING } from "./config";

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

// Cache for git status to avoid too many shell calls.
// 2026-10-04: caches are keyed by cwd; they used to be global, so asking
// about a second repository within the TTL returned the first one's status.
const gitStatusCache: Map<string, { status: GitStatus; timestamp: number }> = new Map();
const fileStatusCache: Map<string, { entries: Map<string, FileGitStatus>; timestamp: number }> = new Map();
const CACHE_TTL = TIMING.GIT_CACHE_TTL;

/**
 * Run git and return stdout, or null if git could not run or exited non-zero.
 * 2026-10-04: the exit code used to be ignored, so a failed `git add`/`git
 * commit` (nothing staged, bad path, no repo) was reported as success. stderr
 * is discarded instead of piped-but-unread (a full pipe could stall git).
 */
async function runGitCommand(args: string[], cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
      // Read-only commands (status...) must not rewrite .git/index: the project
      // watcher saw that write, refreshed git status, which wrote the index
      // again — a loop costing ~5% CPU while idle.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return exitCode === 0 ? output : null;
  } catch {
    return null;
  }
}

interface PorcelainEntry {
  x: string;
  y: string;
  /** Path relative to the repository root, unquoted */
  path: string;
  /** Source path of a rename/copy */
  origPath?: string;
}

/**
 * Parse `git status --porcelain=v1 -z` output.
 * 2026-10-04: parsing the newline format kept git's C-style quoting
 * (`"a b.txt"`, `"\303\261.txt"`) and rename arrows (`old -> new`) in the
 * path, so files with spaces/unicode and renamed files got bogus paths.
 */
function parsePorcelainZ(output: string): PorcelainEntry[] {
  const parts = output.split("\0");
  const entries: PorcelainEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i]!;
    if (record.length < 4) continue;
    const entry: PorcelainEntry = { x: record[0]!, y: record[1]!, path: record.slice(3) };
    if (entry.x === "R" || entry.x === "C" || entry.y === "R" || entry.y === "C") {
      entry.origPath = parts[++i];
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Porcelain paths are relative to the repository root, not to cwd. Returns a
 * function mapping them to paths relative to `cwd` (identical when cwd is the
 * repository root).
 */
async function repoPathMapper(cwd: string): Promise<(repoPath: string) => string> {
  const top = (await runGitCommand(["rev-parse", "--show-toplevel"], cwd))?.trim();
  if (!top) return (p) => p;
  let realCwd = cwd;
  try {
    realCwd = fs.realpathSync(cwd);
  } catch {}
  let realTop = top;
  try {
    realTop = fs.realpathSync(top);
  } catch {}
  if (realTop === realCwd) return (p) => p;
  return (p) => path.relative(realCwd, path.join(realTop, p));
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const now = Date.now();

  // Return cached if fresh
  const cached = gitStatusCache.get(cwd);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.status;
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

  // Check if it's a git repo.
  // 2026-10-04: git prints "true\n"; comparing the untrimmed output with
  // "true" made every repository look like "not a repo" (and the branch name
  // carried a trailing newline).
  const isRepo = (await runGitCommand(["rev-parse", "--is-inside-work-tree"], cwd))?.trim();
  if (isRepo !== "true") {
    gitStatusCache.set(cwd, { status: defaultStatus, timestamp: now });
    return defaultStatus;
  }

  // Get branch name (short SHA when detached)
  const branch = (await runGitCommand(["branch", "--show-current"], cwd))?.trim() ||
    (await runGitCommand(["rev-parse", "--short", "HEAD"], cwd))?.trim() ||
    null;

  // Get ahead/behind
  let ahead = 0;
  let behind = 0;
  const aheadBehind = (await runGitCommand(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], cwd))?.trim();
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

  gitStatusCache.set(cwd, { status, timestamp: now });
  return status;
}

/**
 * Git status of a single file (absolute path, or relative to cwd).
 * Prefers the working-tree status; falls back to the staged one.
 * A `${path}:staged` / `${path}:unstaged` key selects one explicitly.
 * 2026-10-04: entries were stored under `${path}:staged|unstaged` but looked
 * up by the bare path, so the file tree never showed any git status.
 */
export async function getFileGitStatus(filePath: string, cwd: string): Promise<FileGitStatus | null> {
  const now = Date.now();

  // Refresh cache if stale
  let cache = fileStatusCache.get(cwd);
  if (!cache || now - cache.timestamp > CACHE_TTL) {
    cache = { entries: new Map(), timestamp: now };
    fileStatusCache.set(cwd, cache);

    try {
      const statusOutput = await runGitCommand(["status", "--porcelain=v1", "-z", "-uall"], cwd);
      if (statusOutput) {
        const toCwdRelative = await repoPathMapper(cwd);
        for (const { x, y, path: repoPath } of parsePorcelainZ(statusOutput)) {
          const fullPath = path.resolve(cwd, toCwdRelative(repoPath));

          // Staged entry
          if (x !== " " && x !== "?") {
            cache.entries.set(`${fullPath}:staged`, { status: x as FileGitStatus["status"], staged: true });
          }
          // Unstaged entry
          if (y !== " " && y !== "?") {
            cache.entries.set(`${fullPath}:unstaged`, { status: y as FileGitStatus["status"], staged: false });
          }
          // Untracked/Other
          if (x === "?" || y === "?") {
            cache.entries.set(`${fullPath}:unstaged`, { status: "?", staged: false });
          }
        }
      }
    } catch {
      // Failed to run git status
    }
  }

  if (filePath.endsWith(":staged") || filePath.endsWith(":unstaged")) {
    return cache.entries.get(filePath) || null;
  }
  const fullPath = path.resolve(cwd, filePath);
  return cache.entries.get(`${fullPath}:unstaged`) || cache.entries.get(`${fullPath}:staged`) || null;
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
  gitStatusCache.clear();
  fileStatusCache.clear();
  lineDiffCache.clear();
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
  if (result || staged) return result || "";
  const tracked = await runGitCommand(["ls-files", "--", filePath], cwd);
  if (tracked === null || tracked.trim()) return ""; // not a repo, or tracked and unchanged
  // Untracked files have no diff against the index: show the whole file as
  // added (`--no-index` exits 1 when there are differences, so not runGitCommand).
  try {
    const proc = Bun.spawn(["git", "diff", "--no-index", "--color=never", "--", "/dev/null", filePath], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out;
  } catch {
    return "";
  }
}

// Discard changes to a file (checkout HEAD version)
/**
 * Discard the unstaged changes of a file (restore it from the index). Staged
 * changes are kept — `checkout HEAD --` used to wipe those too.
 */
export async function discardFileChanges(filePath: string, cwd: string): Promise<boolean> {
  const result = await runGitCommand(["checkout", "--", filePath], cwd);
  invalidateGitCache();
  return result !== null;
}

/**
 * Changed files, with paths relative to `cwd` (= repository-relative when cwd
 * is the repository root). Renames report the new path.
 */
export async function getGitChanges(cwd: string): Promise<{ path: string; status: FileGitStatus }[]> {
  const statusOutput = await runGitCommand(["status", "--porcelain=v1", "-z", "-uall"], cwd);
  if (!statusOutput) return [];

  const changes: { path: string; status: FileGitStatus }[] = [];
  const toCwdRelative = await repoPathMapper(cwd);

  for (const { x, y, path: repoPath } of parsePorcelainZ(statusOutput)) {
    const file = toCwdRelative(repoPath);

    // Untracked
    if (x === "?" || y === "?") {
      changes.push({ path: file, status: { status: "?", staged: false } });
      continue;
    }

    // Handle staged
    if (x !== " ") {
      changes.push({ path: file, status: { status: x as FileGitStatus["status"], staged: true } });
    }

    // Handle unstaged
    if (y !== " ") {
      changes.push({ path: file, status: { status: y as FileGitStatus["status"], staged: false } });
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
const LINE_DIFF_CACHE_TTL = TIMING.GIT_LINE_DIFF_CACHE_TTL;

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
    // Get the relative path from cwd.
    // 2026-10-04: a plain startsWith(cwd) prefix check mangled sibling paths
    // (cwd "/a/b" vs file "/a/bc/x") and relative inputs.
    const relativePath = path.relative(cwd, path.resolve(cwd, filePath));

    // First check if file is tracked
    const lsFiles = await runGitCommand(["ls-files", relativePath], cwd);
    // null = git failed (not a repository): no gutter at all, rather than
    // marking every line of the file as added.
    if (lsFiles === null) {
      lineDiffCache.set(cacheKey, { diffs, timestamp: now });
      return diffs;
    }
    const isTracked = lsFiles.trim().length > 0;

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
    "--all",
    "--color=never",
    "--decorate=short",
    "--pretty=format:%h%x1f%D%x1f%s%x1f%ct%x1f%an"
  ], cwd);

  if (!logOutput) return [];
  return logOutput.split("\n");
}

/** A commit's message and full patch (`git show`), or null if it can't be read. */
export async function getCommitPatch(hash: string, cwd: string): Promise<string | null> {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) return null;
  return runGitCommand(["show", "--no-color", "--format=%h %s%n%an · %ar%n%n%b", hash], cwd);
}
