/**
 * File references in terminal output ("src/app.ts:42:7", "./README.md",
 * "/abs/path.py(12)") so a double-click can open them in the editor.
 */
import * as fs from "fs";
import * as path from "path";

export interface PathRef {
  /** As written in the output. */
  text: string;
  file: string;
  line?: number;
  column?: number;
  /** Column span in the line, end exclusive. */
  start: number;
  end: number;
}

// A path-ish token: optional ./ ../ ~/ or /, segments, and a file name with an
// extension or a well-known extensionless name; then :line[:col] or (line).
const PATH_RE =
  /(?:~\/|\.{1,2}\/|\/)?(?:[\w@.+-]+\/)*(?:[\w@+-][\w@.+-]*\.[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*|Makefile|Dockerfile|LICENSE|README)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/g;

/** All file references in a line of output. */
export function findPathRefs(line: string): PathRef[] {
  const out: PathRef[] = [];
  // Anything inside a URL (https://host/a/b.html) is not a local file.
  const urls = [...line.matchAll(/\b[a-z][\w+.-]*:\/\/\S+/gi)].map((u) => [u.index!, u.index! + u[0].length] as const);
  for (const m of line.matchAll(PATH_RE)) {
    const text = m[0];
    const idx = m.index ?? 0;
    if (urls.some(([a, b]) => idx < b && idx + text.length > a)) continue;
    const file = text.replace(/(?::\d+(?::\d+)?|\(\d+(?:,\s*\d+)?\))$/, "");
    if (/^\d+(\.\d+)+$/.test(file)) continue; // version numbers like 1.2.3
    const lineNo = m[1] ?? m[3];
    const colNo = m[2] ?? m[4];
    out.push({
      text,
      file,
      line: lineNo ? Number(lineNo) : undefined,
      column: colNo ? Number(colNo) : undefined,
      start: idx,
      end: idx + text.length,
    });
  }
  return out;
}

/** The reference under `col`, if any. */
export function pathRefAt(line: string, col: number): PathRef | null {
  return findPathRefs(line).find((r) => col >= r.start && col < r.end) ?? null;
}

/** First existing file for `ref` among the candidate base directories. */
export function resolvePathRef(ref: PathRef, bases: string[]): string | null {
  const home = process.env.HOME ?? "";
  const raw = ref.file.startsWith("~/") ? path.join(home, ref.file.slice(2)) : ref.file;
  const candidates = path.isAbsolute(raw) ? [raw] : bases.map((b) => path.resolve(b, raw));
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}
