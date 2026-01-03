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
    return output.trim();
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
        const lines = statusOutput.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const x = line[0];
            const y = line[1];
            const file = line.slice(3);

            let status: FileGitStatus["status"] = " ";
            let staged = false;

            if (x === "?" || y === "?") {
              status = "?";
            } else if (x === "U" || y === "U") {
              status = "U";
            } else if (x !== " ") {
              status = x as FileGitStatus["status"];
              staged = true;
            } else if (y !== " ") {
              status = y as FileGitStatus["status"];
            }

            const fullPath = path.resolve(cwd, file);
            fileStatusCache.set(fullPath, { status, staged });
          } catch {
            // Skip problematic entries
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
    case "M": return status.staged ? "green" : "yellow";
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

export async function getGitChanges(cwd: string): Promise<{ path: string; status: FileGitStatus }[]> {
  const statusOutput = await runGitCommand(["status", "--porcelain=v1", "-uall"], cwd);
  if (!statusOutput) return [];

  const changes: { path: string; status: FileGitStatus }[] = [];
  const lines = statusOutput.split("\n").filter(Boolean);

  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);

    let status: FileGitStatus["status"] = " ";
    let staged = false;

    if (x === "?" || y === "?") {
      status = "?";
    } else if (x === "U" || y === "U") {
      status = "U";
    } else if (x !== " ") {
      status = x as FileGitStatus["status"];
      staged = true;
    } else if (y !== " ") {
      status = y as FileGitStatus["status"];
    }

    changes.push({ path: file, status: { status, staged } });
  }

  return changes;
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
