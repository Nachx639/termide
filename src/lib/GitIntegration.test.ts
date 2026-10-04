import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getGitStatus,
  getFileGitStatus,
  formatGitBranch,
  formatGitStatus,
  getFileStatusColor,
  getFileStatusIcon,
  invalidateGitCache,
  stageFile,
  unstageFile,
  stageAllFiles,
  unstageAllFiles,
  createCommit,
  getFileDiff,
  discardFileChanges,
  getGitChanges,
  getFileLineDiffs,
  getLineDiffIndicator,
  getGitLog,
  type GitStatus,
} from "./GitIntegration";

// Isolate git from the user's global/system config (hooks, signing, ...).
const GIT_ENV: Record<string, string> = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
const savedEnv: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: process.env, stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

function tmp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

/** New repo on branch "main" with one commit containing `files`. */
function makeRepo(files: Record<string, string> = { "README.md": "hello\n" }): string {
  const dir = tmp("termide git ");
  git(dir, "init", "-q");
  git(dir, "symbolic-ref", "HEAD", "refs/heads/main");
  write(dir, files);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "initial");
  return dir;
}

function write(dir: string, files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
}

beforeAll(() => {
  for (const [k, v] of Object.entries(GIT_ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
});

afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

beforeEach(() => invalidateGitCache());

describe("getGitStatus", () => {
  test("a non-repository directory", async () => {
    const dir = tmp("termide nogit ");
    const s = await getGitStatus(dir);
    expect(s.isRepo).toBe(false);
    expect(s.branch).toBeNull();
    expect(formatGitBranch(s)).toBe("");
    expect(formatGitStatus(s)).toBe("");
  });

  test("a clean repository reports isRepo and a trimmed branch name", async () => {
    const repo = makeRepo();
    const s = await getGitStatus(repo);
    expect(s.isRepo).toBe(true);
    expect(s.branch).toBe("main");
    expect(s.clean).toBe(true);
    expect(formatGitBranch(s)).toBe(" main");
    expect(formatGitStatus(s)).toBe("✓");
  });

  test("also works from a subdirectory", async () => {
    const repo = makeRepo({ "src/a.ts": "x\n" });
    expect((await getGitStatus(path.join(repo, "src"))).isRepo).toBe(true);
  });

  test("counts staged, modified, untracked and stashed changes", async () => {
    const repo = makeRepo({ "a.txt": "a\n", "b.txt": "b\n", "c.txt": "c\n" });
    write(repo, { "stash.txt": "s\n" });
    git(repo, "add", "stash.txt");
    git(repo, "stash", "-q");
    write(repo, { "a.txt": "A\n", "b.txt": "B\n", "new file ñ.txt": "n\n" });
    git(repo, "add", "a.txt");
    const s = await getGitStatus(repo);
    expect(s).toMatchObject({ staged: 1, modified: 1, untracked: 1, conflicts: 0, stashed: 1, clean: false });
    expect(formatGitStatus(s)).toBe("+1 ~1 ?1 ⚑1");
  });

  test("reports ahead/behind relative to the upstream branch", async () => {
    const repo = makeRepo();
    git(repo, "checkout", "-q", "-b", "feature");
    git(repo, "branch", "-q", "--set-upstream-to=main");
    write(repo, { "f1.txt": "1\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "f1");
    write(repo, { "f2.txt": "2\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "f2");
    git(repo, "checkout", "-q", "main");
    write(repo, { "m.txt": "m\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "m");
    git(repo, "checkout", "-q", "feature");

    const s = await getGitStatus(repo);
    expect(s.branch).toBe("feature");
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(1);
    expect(formatGitBranch(s)).toBe(" feature↑2↓1");
  });

  test("detached HEAD falls back to the short sha", async () => {
    const repo = makeRepo();
    const sha = git(repo, "rev-parse", "--short", "HEAD").trim();
    git(repo, "checkout", "-q", "--detach");
    expect((await getGitStatus(repo)).branch).toBe(sha);
  });

  test("counts merge conflicts", async () => {
    const repo = makeRepo({ "c.txt": "base\n" });
    git(repo, "checkout", "-q", "-b", "other");
    write(repo, { "c.txt": "other\n" });
    git(repo, "commit", "-q", "-am", "other");
    git(repo, "checkout", "-q", "main");
    write(repo, { "c.txt": "main\n" });
    git(repo, "commit", "-q", "-am", "main");
    Bun.spawnSync(["git", "merge", "-q", "other"], { cwd: repo, env: process.env, stdout: "ignore", stderr: "ignore" });
    const s = await getGitStatus(repo);
    expect(s.conflicts).toBe(1);
    expect(formatGitStatus(s)).toContain("!1");
  });

  test("the cache is per directory", async () => {
    const repo = makeRepo();
    const plain = tmp("termide nogit ");
    expect((await getGitStatus(repo)).isRepo).toBe(true);
    expect((await getGitStatus(plain)).isRepo).toBe(false);
    expect((await getGitStatus(repo)).isRepo).toBe(true);
  });
});

describe("getFileGitStatus", () => {
  test("looks files up by absolute path, including spaces and unicode", async () => {
    const repo = makeRepo({ "mod.txt": "a\n", "staged.txt": "s\n", "both.txt": "b\n" });
    write(repo, { "mod.txt": "A\n", "dir x/new ñ.txt": "n\n", "staged.txt": "S\n", "both.txt": "B\n" });
    git(repo, "add", "staged.txt", "both.txt");
    write(repo, { "both.txt": "BB\n" });

    expect(await getFileGitStatus(path.join(repo, "mod.txt"), repo)).toEqual({ status: "M", staged: false });
    expect(await getFileGitStatus(path.join(repo, "dir x", "new ñ.txt"), repo)).toEqual({ status: "?", staged: false });
    expect(await getFileGitStatus(path.join(repo, "staged.txt"), repo)).toEqual({ status: "M", staged: true });
    // working tree status wins over the staged one; explicit keys select either
    expect(await getFileGitStatus(path.join(repo, "both.txt"), repo)).toEqual({ status: "M", staged: false });
    expect(await getFileGitStatus(`${path.join(repo, "both.txt")}:staged`, repo)).toEqual({ status: "M", staged: true });
    expect(await getFileGitStatus(path.join(repo, "README.md"), repo)).toBeNull();
    expect(await getFileGitStatus(path.join(repo, "nope.txt"), repo)).toBeNull();
  });

  test("relative paths and subdirectory cwd", async () => {
    const repo = makeRepo({ "pkg/a.ts": "a\n" });
    write(repo, { "pkg/a.ts": "A\n" });
    const pkg = path.join(repo, "pkg");
    expect(await getFileGitStatus(path.join(pkg, "a.ts"), pkg)).toEqual({ status: "M", staged: false });
    invalidateGitCache();
    expect(await getFileGitStatus("pkg/a.ts", repo)).toEqual({ status: "M", staged: false });
  });

  test("renamed and deleted files", async () => {
    const repo = makeRepo({ "old.txt": "o\n", "gone.txt": "g\n" });
    git(repo, "mv", "old.txt", "new name.txt");
    fs.rmSync(path.join(repo, "gone.txt"));
    expect(await getFileGitStatus(path.join(repo, "new name.txt"), repo)).toEqual({ status: "R", staged: true });
    expect(await getFileGitStatus(path.join(repo, "gone.txt"), repo)).toEqual({ status: "D", staged: false });
  });

  test("non-repository returns null", async () => {
    const dir = tmp("termide nogit ");
    fs.writeFileSync(path.join(dir, "f.txt"), "x");
    expect(await getFileGitStatus(path.join(dir, "f.txt"), dir)).toBeNull();
  });
});

describe("getGitChanges", () => {
  test("lists staged, unstaged and untracked files with unquoted paths", async () => {
    const repo = makeRepo({ "a b.txt": "1\n", "old.txt": "o\n" });
    write(repo, { "a b.txt": "2\n", "ñandú.txt": "n\n" });
    git(repo, "mv", "old.txt", "renamed.txt");
    const changes = await getGitChanges(repo);
    expect(changes).toContainEqual({ path: "a b.txt", status: { status: "M", staged: false } });
    expect(changes).toContainEqual({ path: "ñandú.txt", status: { status: "?", staged: false } });
    expect(changes).toContainEqual({ path: "renamed.txt", status: { status: "R", staged: true } });
    expect(changes).toHaveLength(3);
  });

  test("a file both staged and modified appears twice", async () => {
    const repo = makeRepo({ "f.txt": "1\n" });
    write(repo, { "f.txt": "2\n" });
    git(repo, "add", "f.txt");
    write(repo, { "f.txt": "3\n" });
    expect(await getGitChanges(repo)).toEqual([
      { path: "f.txt", status: { status: "M", staged: true } },
      { path: "f.txt", status: { status: "M", staged: false } },
    ]);
  });

  test("paths are relative to cwd so they can be fed back to stageFile", async () => {
    const repo = makeRepo({ "sub/x.txt": "1\n" });
    write(repo, { "sub/x.txt": "2\n" });
    const sub = path.join(repo, "sub");
    const changes = await getGitChanges(sub);
    expect(changes).toEqual([{ path: "x.txt", status: { status: "M", staged: false } }]);
    expect(await stageFile(changes[0]!.path, sub)).toBe(true);
    expect(await getGitChanges(sub)).toEqual([{ path: "x.txt", status: { status: "M", staged: true } }]);
  });

  test("clean repo and non-repo give an empty list", async () => {
    expect(await getGitChanges(makeRepo())).toEqual([]);
    expect(await getGitChanges(tmp("termide nogit "))).toEqual([]);
  });
});

describe("staging and committing", () => {
  test("stage, unstage, stage all, unstage all, commit", async () => {
    const repo = makeRepo({ "a.txt": "a\n" });
    write(repo, { "a.txt": "A\n", "b c.txt": "b\n" });

    expect(await stageFile("b c.txt", repo)).toBe(true);
    expect(await getFileGitStatus(path.join(repo, "b c.txt"), repo)).toEqual({ status: "A", staged: true });
    expect(await unstageFile("b c.txt", repo)).toBe(true);
    expect(await getFileGitStatus(path.join(repo, "b c.txt"), repo)).toEqual({ status: "?", staged: false });

    expect(await stageAllFiles(repo)).toBe(true);
    expect((await getGitStatus(repo)).staged).toBe(2);
    expect(await unstageAllFiles(repo)).toBe(true);
    expect((await getGitStatus(repo)).staged).toBe(0);

    expect(await stageAllFiles(repo)).toBe(true);
    expect(await createCommit('msg with "quotes" and $vars', repo)).toBe(true);
    expect((await getGitStatus(repo)).clean).toBe(true);
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe('msg with "quotes" and $vars');
  });

  test("failures are reported as false", async () => {
    const repo = makeRepo();
    expect(await createCommit("nothing to commit", repo)).toBe(false);
    expect(await stageFile("does-not-exist.txt", repo)).toBe(false);
    expect(await stageAllFiles(tmp("termide nogit "))).toBe(false);
  });
});

describe("diffs", () => {
  test("getFileDiff for unstaged and staged changes; discardFileChanges", async () => {
    const repo = makeRepo({ "d.txt": "one\n" });
    write(repo, { "d.txt": "two\n" });
    const diff = await getFileDiff("d.txt", repo);
    expect(diff).toContain("-one");
    expect(diff).toContain("+two");
    expect(await getFileDiff("d.txt", repo, true)).toBe("");
    git(repo, "add", "d.txt");
    expect(await getFileDiff("d.txt", repo, true)).toContain("+two");

    git(repo, "reset", "-q");
    expect(await discardFileChanges("d.txt", repo)).toBe(true);
    expect(fs.readFileSync(path.join(repo, "d.txt"), "utf-8")).toBe("one\n");
    expect(await getFileDiff("d.txt", repo)).toBe("");
  });

  test("discardFileChanges keeps staged changes", async () => {
    const repo = makeRepo({ "s.txt": "base\n" });
    write(repo, { "s.txt": "staged\n" });
    git(repo, "add", "s.txt");
    write(repo, { "s.txt": "staged + later edit\n" });
    expect(await discardFileChanges("s.txt", repo)).toBe(true);
    expect(fs.readFileSync(path.join(repo, "s.txt"), "utf-8")).toBe("staged\n");
    expect(await getFileDiff("s.txt", repo, true)).toContain("+staged");
  });

  test("getFileLineDiffs outside a repository marks nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-norepo-"));
    fs.writeFileSync(path.join(dir, "x.txt"), "a\nb\nc\n");
    expect(await getFileLineDiffs(path.join(dir, "x.txt"), dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("getFileLineDiffs reports added, modified and deleted lines (1-based)", async () => {
    const repo = makeRepo({ "f.txt": "1\n2\n3\n4\n5\n" });
    // modify line 2, delete line 4, add a line after 5
    write(repo, { "f.txt": "1\nTWO\n3\n5\n6\n" });
    const diffs = await getFileLineDiffs(path.join(repo, "f.txt"), repo);
    expect(diffs).toContainEqual({ lineNumber: 2, status: "modified" });
    expect(diffs).toContainEqual({ lineNumber: 3, status: "deleted" });
    expect(diffs).toContainEqual({ lineNumber: 5, status: "added" });
    expect(diffs).toHaveLength(3);
  });

  test("getFileLineDiffs: untracked file is all added; unchanged file has none", async () => {
    const repo = makeRepo({ "same.txt": "x\n" });
    write(repo, { "new file.txt": "a\nb" });
    expect(await getFileLineDiffs(path.join(repo, "new file.txt"), repo)).toEqual([
      { lineNumber: 1, status: "added" },
      { lineNumber: 2, status: "added" },
    ]);
    expect(await getFileLineDiffs(path.join(repo, "same.txt"), repo)).toEqual([]);
  });

  test("getFileLineDiffs works when the file path is not under a prefix-sharing cwd", async () => {
    const repo = makeRepo({ "x.txt": "1\n" });
    write(repo, { "x.txt": "2\n" });
    // relative path input
    expect(await getFileLineDiffs("x.txt", repo)).toEqual([{ lineNumber: 1, status: "modified" }]);
  });

  test("getLineDiffIndicator", () => {
    expect(getLineDiffIndicator("added").char).toBe("┃");
    expect(getLineDiffIndicator("modified").color).toBe("#569cd6");
    expect(getLineDiffIndicator("deleted").char).toBe("▼");
    expect(getLineDiffIndicator(null)).toEqual({ char: " ", color: "gray" });
  });
});

describe("getGitLog", () => {
  test("returns graph lines with unit-separated fields", async () => {
    const repo = makeRepo();
    write(repo, { "x.txt": "x\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "second commit");
    const log = await getGitLog(repo, 10);
    expect(log).toHaveLength(2);
    const fields = log[0]!.replace(/^[*|\\/ ]+/, "").split("\x1f");
    expect(fields[2]).toBe("second commit");
    expect(fields[4]).toBe("Test");
    expect(fields[1]).toContain("main");
  });

  test("respects the count and returns [] outside a repo or with no commits", async () => {
    const repo = makeRepo();
    expect(await getGitLog(repo, 1)).toHaveLength(1);
    expect(await getGitLog(tmp("termide nogit "))).toEqual([]);
    const empty = tmp("termide empty ");
    git(empty, "init", "-q");
    expect(await getGitLog(empty)).toEqual([]);
  });
});

describe("status formatting", () => {
  const base: GitStatus = {
    isRepo: true, branch: "main", ahead: 0, behind: 0, staged: 0, modified: 0,
    untracked: 0, conflicts: 0, stashed: 0, clean: true,
  };

  test("formatGitBranch", () => {
    expect(formatGitBranch(base)).toBe(" main");
    expect(formatGitBranch({ ...base, ahead: 3 })).toBe(" main↑3");
    expect(formatGitBranch({ ...base, behind: 2 })).toBe(" main↓2");
    expect(formatGitBranch({ ...base, branch: null })).toBe("");
  });

  test("formatGitStatus", () => {
    expect(formatGitStatus({ ...base, clean: false, conflicts: 2 })).toBe("!2");
    expect(formatGitStatus({ ...base, isRepo: false })).toBe("");
  });

  test("file status colors and icons", () => {
    expect(getFileStatusColor(null)).toBe("white");
    expect(getFileStatusColor({ status: "M", staged: true })).toBe("green");
    expect(getFileStatusColor({ status: "M", staged: false })).toBe("#d4a800");
    expect(getFileStatusColor({ status: "D", staged: false })).toBe("red");
    expect(getFileStatusColor({ status: "?", staged: false })).toBe("gray");
    expect(getFileStatusIcon(null)).toBe("  ");
    expect(getFileStatusIcon({ status: "M", staged: true })).toBe("● ");
    expect(getFileStatusIcon({ status: "M", staged: false })).toBe("○ ");
    expect(getFileStatusIcon({ status: "A", staged: true })).toBe("+ ");
    expect(getFileStatusIcon({ status: "R", staged: true })).toBe("→ ");
    expect(getFileStatusIcon({ status: "U", staged: false })).toBe("! ");
    for (const s of ["M", "A", "D", "R", "C", "U", "?", "!", " "] as const) {
      expect(getFileStatusIcon({ status: s, staged: false })).toHaveLength(2);
    }
  });
});

describe("untracked diff", () => {
  test("getFileDiff shows an untracked file as all added", async () => {
    const repo = makeRepo({ "a.txt": "a\n" });
    write(repo, { "new.txt": "line1\nline2\n" });
    const diff = await getFileDiff("new.txt", repo);
    expect(diff).toContain("+line1");
    expect(diff).toContain("+line2");
  });
});
