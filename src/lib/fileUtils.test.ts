import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  fileExists,
  isDirectory,
  isBinaryFile,
  isBinaryContent,
  shouldIgnore,
  getFileSize,
  isFileTooLarge,
  formatFileSize,
  getRelativePath,
  getExtension,
  getBasename,
  readFileSafe,
  writeFileSafe,
  ensureDirectory,
  deleteFileSafe,
  renameFileSafe,
  copyFileSafe,
  listDirectory,
  getModificationTime,
  isModifiedAfter,
  getUniqueFilename,
  normalizePath,
  joinPaths,
  getParentDir,
} from "./fileUtils";
import { LIMITS } from "./config";

let dir: string;

beforeEach(() => {
  // A directory name with spaces and unicode to catch quoting bugs
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide fileUtils ñ "));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const p = (...parts: string[]) => path.join(dir, ...parts);

describe("existence checks", () => {
  test("fileExists / isDirectory", () => {
    fs.writeFileSync(p("a file.txt"), "x");
    expect(fileExists(p("a file.txt"))).toBe(true);
    expect(fileExists(dir)).toBe(true);
    expect(fileExists(p("missing"))).toBe(false);
    expect(fileExists("")).toBe(false);
    expect(isDirectory(dir)).toBe(true);
    expect(isDirectory(p("a file.txt"))).toBe(false);
    expect(isDirectory(p("missing"))).toBe(false);
  });
});

describe("isBinaryFile", () => {
  test("by extension, case-insensitive", () => {
    expect(isBinaryFile("/x/photo.PNG")).toBe(true);
    expect(isBinaryFile("archive.tar.gz")).toBe(true);
    expect(isBinaryFile("font.woff2")).toBe(true);
    expect(isBinaryFile("main.ts")).toBe(false);
    expect(isBinaryFile("Makefile")).toBe(false);
    expect(isBinaryFile(".png")).toBe(false); // a dotfile named ".png" has no extension
  });

  test("svg is text, not binary", () => {
    expect(isBinaryFile("icon.svg")).toBe(false);
  });
});

describe("isBinaryContent", () => {
  test("detects NUL bytes, accepts text including unicode", async () => {
    fs.writeFileSync(p("bin"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01]));
    fs.writeFileSync(p("text"), "héllo 🐜\r\nworld");
    fs.writeFileSync(p("empty"), "");
    expect(await isBinaryContent(p("bin"))).toBe(true);
    expect(await isBinaryContent(p("text"))).toBe(false);
    expect(await isBinaryContent(p("empty"))).toBe(false);
    expect(await isBinaryContent(p("missing"))).toBe(false);
  });
});

describe("shouldIgnore", () => {
  test("matches exact names only", () => {
    expect(shouldIgnore("node_modules")).toBe(true);
    expect(shouldIgnore(".git")).toBe(true);
    expect(shouldIgnore(".DS_Store")).toBe(true);
    expect(shouldIgnore("node_modules_backup")).toBe(false);
    expect(shouldIgnore(".github")).toBe(false);
    expect(shouldIgnore("")).toBe(false);
  });
});

describe("sizes", () => {
  test("getFileSize counts bytes, not characters", () => {
    fs.writeFileSync(p("u.txt"), "ñ🐜");
    expect(getFileSize(p("u.txt"))).toBe(2 + 4);
    expect(getFileSize(p("missing"))).toBe(0);
  });

  test("isFileTooLarge uses the preview limit", () => {
    const big = p("big.log");
    const fd = fs.openSync(big, "w");
    fs.ftruncateSync(fd, LIMITS.MAX_FILE_SIZE_PREVIEW + 1); // sparse, cheap
    fs.closeSync(fd);
    fs.writeFileSync(p("small.log"), "x");
    expect(isFileTooLarge(big)).toBe(true);
    expect(isFileTooLarge(p("small.log"))).toBe(false);
    expect(isFileTooLarge(p("missing"))).toBe(false);
  });

  test("formatFileSize", () => {
    expect(formatFileSize(0)).toBe("0B");
    expect(formatFileSize(1023)).toBe("1023B");
    expect(formatFileSize(1024)).toBe("1.0KB");
    expect(formatFileSize(1536)).toBe("1.5KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0MB");
    expect(formatFileSize(5.25 * 1024 * 1024 * 1024)).toBe("5.3GB");
  });
});

describe("path helpers", () => {
  test("getExtension / getBasename", () => {
    expect(getExtension("/a/b/File.TSX")).toBe("tsx");
    expect(getExtension("archive.tar.gz")).toBe("gz");
    expect(getExtension("Makefile")).toBe("");
    expect(getExtension(".gitignore")).toBe("");
    expect(getBasename("/a/my file.test.ts")).toBe("my file.test");
    expect(getBasename(".env")).toBe(".env");
  });

  test("getRelativePath / normalizePath / joinPaths / getParentDir", () => {
    expect(getRelativePath("/root/src/a b.ts", "/root")).toBe(path.join("src", "a b.ts"));
    expect(getRelativePath("/root", "/root")).toBe("");
    expect(normalizePath("/a//b/../c/./d")).toBe("/a/c/d");
    expect(joinPaths("/a", "b c", "../d")).toBe("/a/d");
    expect(getParentDir("/a/b/c.txt")).toBe("/a/b");
    expect(getParentDir("/")).toBe("/");
  });
});

describe("readFileSafe / writeFileSafe", () => {
  test("round-trips unicode and preserves CRLF", async () => {
    const f = p("dir with space", "note.md");
    const content = "línea 1\r\nline 2 🐜\r\n";
    expect(await writeFileSafe(f, content)).toBe(true); // creates parent dirs
    expect(await readFileSafe(f)).toBe(content);
  });

  test("empty file reads as empty string", async () => {
    fs.writeFileSync(p("empty.txt"), "");
    expect(await readFileSafe(p("empty.txt"))).toBe("");
  });

  test("returns null for missing files, binary extensions, binary content and huge files", async () => {
    expect(await readFileSafe(p("missing.txt"))).toBeNull();

    fs.writeFileSync(p("image.png"), "not really an image");
    expect(await readFileSafe(p("image.png"))).toBeNull();

    fs.writeFileSync(p("a.out"), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 1]));
    expect(await readFileSafe(p("a.out"))).toBeNull();

    const fd = fs.openSync(p("huge.txt"), "w");
    fs.ftruncateSync(fd, LIMITS.MAX_FILE_SIZE_PREVIEW + 10);
    fs.closeSync(fd);
    expect(await readFileSafe(p("huge.txt"))).toBeNull();
  });

  test("writeFileSafe fails gracefully when the target is a directory", async () => {
    fs.mkdirSync(p("adir"));
    expect(await writeFileSafe(p("adir"), "x")).toBe(false);
  });
});

describe("file operations", () => {
  test("ensureDirectory creates nested directories and is idempotent", () => {
    const nested = p("a", "b c", "d");
    expect(ensureDirectory(nested)).toBe(true);
    expect(isDirectory(nested)).toBe(true);
    expect(ensureDirectory(nested)).toBe(true);
  });

  test("ensureDirectory fails when a file is in the way", () => {
    fs.writeFileSync(p("f"), "x");
    expect(ensureDirectory(p("f", "sub"))).toBe(false);
  });

  test("delete / rename / copy", () => {
    fs.writeFileSync(p("a b.txt"), "data");
    expect(copyFileSafe(p("a b.txt"), p("copy.txt"))).toBe(true);
    expect(fs.readFileSync(p("copy.txt"), "utf-8")).toBe("data");
    expect(renameFileSafe(p("copy.txt"), p("renamed é.txt"))).toBe(true);
    expect(fileExists(p("copy.txt"))).toBe(false);
    expect(fileExists(p("renamed é.txt"))).toBe(true);
    expect(deleteFileSafe(p("renamed é.txt"))).toBe(true);
    expect(fileExists(p("renamed é.txt"))).toBe(false);

    expect(deleteFileSafe(p("missing"))).toBe(false);
    expect(renameFileSafe(p("missing"), p("x"))).toBe(false);
    expect(copyFileSafe(p("missing"), p("x"))).toBe(false);
  });
});

describe("listDirectory", () => {
  beforeEach(() => {
    fs.mkdirSync(p("src", "nested"), { recursive: true });
    fs.mkdirSync(p("node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(p("src", "a.ts"), "");
    fs.writeFileSync(p("src", "nested", "b c.ts"), "");
    fs.writeFileSync(p("node_modules", "pkg", "index.js"), "");
    fs.writeFileSync(p(".hidden"), "");
    fs.writeFileSync(p("root.txt"), "");
  });

  test("non-recursive lists files and directories, skipping hidden and ignored", () => {
    const entries = listDirectory(dir).sort();
    expect(entries).toEqual([p("root.txt"), p("src")].sort());
  });

  test("includeHidden", () => {
    expect(listDirectory(dir, { includeHidden: true })).toContain(p(".hidden"));
  });

  test("recursive lists files only, skipping node_modules", () => {
    const entries = listDirectory(dir, { recursive: true }).sort();
    expect(entries).toEqual([p("root.txt"), p("src", "a.ts"), p("src", "nested", "b c.ts")].sort());
  });

  test("missing directory returns empty list", () => {
    expect(listDirectory(p("nope"))).toEqual([]);
  });
});

describe("modification time", () => {
  test("getModificationTime / isModifiedAfter", () => {
    fs.writeFileSync(p("m.txt"), "x");
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(p("m.txt"), new Date(), new Date());
    expect(getModificationTime(p("m.txt"))).toBeInstanceOf(Date);
    expect(isModifiedAfter(p("m.txt"), past)).toBe(true);
    expect(isModifiedAfter(p("m.txt"), new Date(Date.now() + 60_000))).toBe(false);
    expect(getModificationTime(p("missing"))).toBeNull();
    expect(isModifiedAfter(p("missing"), past)).toBe(false);
  });
});

describe("getUniqueFilename", () => {
  test("returns the same path when free, otherwise numbered copies", () => {
    expect(getUniqueFilename(p("new file.txt"))).toBe(p("new file.txt"));
    fs.writeFileSync(p("new file.txt"), "");
    expect(getUniqueFilename(p("new file.txt"))).toBe(p("new file (1).txt"));
    fs.writeFileSync(p("new file (1).txt"), "");
    expect(getUniqueFilename(p("new file.txt"))).toBe(p("new file (2).txt"));
  });

  test("files without extension", () => {
    fs.writeFileSync(p("Makefile"), "");
    expect(getUniqueFilename(p("Makefile"))).toBe(p("Makefile (1)"));
  });
});
