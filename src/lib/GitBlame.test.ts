import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getGitBlame,
  shortSha,
  formatBlameDate,
  formatAuthor,
  getBlameAnnotation,
  getBlameColor,
  isUncommitted,
  type BlameLine,
} from "./GitBlame";

// Isolate git from the user's global/system config (hooks, signing, ...).
const GIT_ENV: Record<string, string> = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const savedEnv: Record<string, string | undefined> = {};

let repo: string;

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, ...env }, stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

function commitAs(cwd: string, name: string, email: string, message: string, when: string) {
  git(cwd, ["commit", "-q", "-m", message], {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_DATE: when,
  });
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY - 60_000);

beforeAll(() => {
  for (const [k, v] of Object.entries(GIT_ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "termide blame "));
  git(repo, ["init", "-q"]);

  // alice writes three lines, bob later changes only the middle one, so
  // alice's commit owns two non-adjacent hunks.
  fs.writeFileSync(path.join(repo, "my file.txt"), "one\ntwo\nthree\n");
  git(repo, ["add", "."]);
  commitAs(repo, "Alice", "alice@example.com", "first", "2020-01-01T00:00:00Z");
  fs.writeFileSync(path.join(repo, "my file.txt"), "one\nTWO\nthree\n");
  git(repo, ["add", "."]);
  commitAs(repo, "Bob", "bob@example.com", "second", "2021-06-01T00:00:00Z");

  // A file whose name would break a shell command line
  fs.writeFileSync(path.join(repo, 'we"ird $name`x`.txt'), "a\n");
  git(repo, ["add", "."]);
  commitAs(repo, "Alice", "alice@example.com", "weird", "2022-01-01T00:00:00Z");
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getGitBlame", () => {
  test("returns one entry per line with author, mail, date and content", () => {
    const blame = getGitBlame(path.join(repo, "my file.txt"));
    expect(blame).toHaveLength(3);
    expect(blame.map((b) => b.content)).toEqual(["one", "TWO", "three"]);
    expect(blame.map((b) => b.line)).toEqual([0, 1, 2]);
    expect(blame[1]!.author).toBe("Bob");
    expect(blame[1]!.authorMail).toBe("<bob@example.com>");
    expect(blame[1]!.date.toISOString()).toBe("2021-06-01T00:00:00.000Z");
    for (const b of blame) expect(b.sha).toMatch(/^[0-9a-f]{40,64}$/);
  });

  test("lines from a commit seen earlier still carry its author and date", () => {
    const blame = getGitBlame(path.join(repo, "my file.txt"));
    expect(blame[0]!.author).toBe("Alice");
    expect(blame[2]!.author).toBe("Alice");
    expect(blame[2]!.authorMail).toBe("<alice@example.com>");
    expect(blame[2]!.date.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(blame[2]!.sha).toBe(blame[0]!.sha);
    // and the annotation helpers work on every line
    for (const b of blame) expect(() => getBlameAnnotation(b, true)).not.toThrow();
  });

  test("marks own code by name or email", () => {
    const byName = getGitBlame(path.join(repo, "my file.txt"), "Alice");
    expect(byName.map((b) => b.isOwnCode)).toEqual([true, false, true]);
    const byMail = getGitBlame(path.join(repo, "my file.txt"), "bob@example.com");
    expect(byMail.map((b) => b.isOwnCode)).toEqual([false, true, false]);
    expect(getGitBlame(path.join(repo, "my file.txt")).every((b) => b.isOwnCode === false)).toBe(true);
  });

  test("handles file names with quotes, $ and backticks", () => {
    const blame = getGitBlame(path.join(repo, 'we"ird $name`x`.txt'));
    expect(blame).toHaveLength(1);
    expect(blame[0]!.content).toBe("a");
  });

  test("uncommitted lines are reported with a zero sha", () => {
    const f = path.join(repo, "my file.txt");
    const original = fs.readFileSync(f, "utf-8");
    try {
      fs.writeFileSync(f, original + "four\n");
      const blame = getGitBlame(f);
      expect(blame).toHaveLength(4);
      expect(isUncommitted(blame[3]!.sha)).toBe(true);
      expect(isUncommitted(blame[0]!.sha)).toBe(false);
    } finally {
      fs.writeFileSync(f, original);
    }
  });

  test("returns [] for untracked, missing and non-repo files", () => {
    fs.writeFileSync(path.join(repo, "untracked.txt"), "x\n");
    expect(getGitBlame(path.join(repo, "untracked.txt"))).toEqual([]);
    expect(getGitBlame(path.join(repo, "missing.txt"))).toEqual([]);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "termide noblame "));
    try {
      fs.writeFileSync(path.join(outside, "f.txt"), "x\n");
      expect(getGitBlame(path.join(outside, "f.txt"))).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("formatting helpers", () => {
  test("shortSha", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha("abc")).toBe("abc");
  });

  test("formatBlameDate buckets", () => {
    expect(formatBlameDate(new Date())).toBe("today");
    expect(formatBlameDate(daysAgo(1))).toBe("yesterday");
    expect(formatBlameDate(daysAgo(3))).toBe("3d ago");
    expect(formatBlameDate(daysAgo(14))).toBe("2w ago");
    expect(formatBlameDate(daysAgo(65))).toBe("2mo ago");
    expect(formatBlameDate(daysAgo(800))).toBe("2y ago");
  });

  test("formatBlameDate treats future dates (clock skew) as today", () => {
    expect(formatBlameDate(new Date(Date.now() + 5_000))).toBe("today");
    expect(formatBlameDate(new Date(Date.now() + 3 * DAY))).toBe("today");
  });

  test("formatAuthor pads short names and truncates long ones", () => {
    expect(formatAuthor("Bob", 6)).toBe("Bob   ");
    expect(formatAuthor("Bartholomew", 6)).toBe("Barth…");
    expect(formatAuthor("Bartholomew", 6)).toHaveLength(6);
    expect(formatAuthor("")).toHaveLength(12);
  });

  test("getBlameAnnotation short and detailed", () => {
    const line: BlameLine = {
      sha: "abcdef1234567890",
      author: "Alice",
      authorMail: "<a@x>",
      date: new Date(),
      line: 0,
      content: "",
      isOwnCode: false,
    };
    expect(getBlameAnnotation(line)).toBe("Alice     ");
    expect(getBlameAnnotation(line, true)).toBe("abcdef1 Alice      today     ");
  });

  test("getBlameColor by age", () => {
    expect(getBlameColor(new Date())).toBe("green");
    expect(getBlameColor(daysAgo(3))).toBe("yellow");
    expect(getBlameColor(daysAgo(10))).toBe("cyan");
    expect(getBlameColor(daysAgo(60))).toBe("blue");
    expect(getBlameColor(daysAgo(400))).toBe("gray");
  });

  test("isUncommitted", () => {
    expect(isUncommitted("0".repeat(40))).toBe(true);
    expect(isUncommitted("1" + "0".repeat(39))).toBe(false);
  });
});
