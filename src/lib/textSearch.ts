/**
 * Search in files for the global search panel. Uses ripgrep when available
 * (fast, respects .gitignore), then `git grep`, then a plain directory walk.
 * Everything runs off the UI thread's critical path (subprocess or chunked
 * async walk) and can be cancelled.
 */
import * as fs from "fs";
import * as path from "path";

export interface TextMatch {
  filePath: string;
  relativePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchOptions {
  maxResults?: number;
  maxPerFile?: number;
  signal?: AbortSignal;
}

const TRIM = 100;

/** Trim leading whitespace and long lines, keeping the match offsets right. */
function toMatch(root: string, file: string, lineNumber: number, line: string, start: number, end: number): TextMatch {
  const lead = line.length - line.trimStart().length;
  const text = line.trim();
  let s = Math.max(0, start - lead);
  let e = Math.max(s, end - lead);
  let shown = text;
  if (text.length > TRIM) {
    const from = Math.max(0, Math.min(s - 20, text.length - TRIM));
    shown = text.slice(from, from + TRIM);
    s -= from;
    e -= from;
  }
  return {
    filePath: path.resolve(root, file),
    relativePath: path.relative(root, path.resolve(root, file)),
    lineNumber,
    lineContent: shown,
    matchStart: Math.max(0, s),
    matchEnd: Math.min(shown.length, Math.max(0, e)),
  };
}

async function viaRipgrep(root: string, query: string, o: Required<Omit<SearchOptions, "signal">> & SearchOptions): Promise<TextMatch[] | null> {
  const rg = Bun.which("rg");
  if (!rg) return null;
  const proc = Bun.spawn(
    [rg, "--json", "--fixed-strings", "--ignore-case", "--max-count", String(o.maxPerFile), "--max-columns", "500", "--", query, "."],
    { cwd: root, stdout: "pipe", stderr: "ignore" },
  );
  const out: TextMatch[] = [];
  o.signal?.addEventListener("abort", () => proc.kill());
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const lineJson = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!lineJson.includes('"type":"match"')) continue;
        try {
          const ev = JSON.parse(lineJson);
          const d = ev.data;
          const file = d.path?.text;
          const text: string = (d.lines?.text ?? "").replace(/\r?\n$/, "");
          const sub = d.submatches?.[0];
          if (!file || !sub) continue;
          // ripgrep offsets are bytes; convert to string indices.
          const bytes = Buffer.from(text);
          const start = bytes.subarray(0, sub.start).toString().length;
          const end = bytes.subarray(0, sub.end).toString().length;
          out.push(toMatch(root, file, d.line_number, text, start, end));
          if (out.length >= o.maxResults) {
            proc.kill();
            return out;
          }
        } catch {}
      }
    }
  } catch {}
  await proc.exited;
  return out;
}

async function viaGitGrep(root: string, query: string, o: Required<Omit<SearchOptions, "signal">> & SearchOptions): Promise<TextMatch[] | null> {
  const inRepo = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], { cwd: root, stdout: "pipe", stderr: "ignore" });
  if (inRepo.exitCode !== 0) return null;
  const proc = Bun.spawn(
    ["git", "grep", "-n", "-I", "-i", "-F", "--untracked", "--max-count", String(o.maxPerFile), "-z", "-e", query],
    { cwd: root, stdout: "pipe", stderr: "ignore" },
  );
  o.signal?.addEventListener("abort", () => proc.kill());
  const text = await new Response(proc.stdout).text();
  const out: TextMatch[] = [];
  const q = query.toLowerCase();
  for (const rec of text.split("\n")) {
    // -z: path\0line\0content
    const [file, ln, ...rest] = rec.split("\0");
    if (!file || !ln) continue;
    const line = rest.join("\0");
    const idx = line.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    out.push(toMatch(root, file, Number(ln), line, idx, idx + query.length));
    if (out.length >= o.maxResults) break;
  }
  return out;
}

async function viaWalk(root: string, query: string, o: Required<Omit<SearchOptions, "signal">> & SearchOptions): Promise<TextMatch[]> {
  const out: TextMatch[] = [];
  const q = query.toLowerCase();
  const stack = [root];
  let visited = 0;
  while (stack.length && out.length < o.maxResults) {
    if (o.signal?.aborted) break;
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      let content: string;
      try {
        if (fs.statSync(full).size > 2_000_000) continue;
        const buf = fs.readFileSync(full);
        if (buf.subarray(0, 8000).includes(0)) continue; // binary
        content = buf.toString("utf8");
      } catch {
        continue;
      }
      let perFile = 0;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && perFile < o.maxPerFile; i++) {
        const idx = lines[i]!.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        out.push(toMatch(root, full, i + 1, lines[i]!, idx, idx + query.length));
        perFile++;
        if (out.length >= o.maxResults) break;
      }
      // Yield to the event loop now and then so the UI stays responsive.
      if (++visited % 50 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
  return out;
}

/** Case-insensitive literal search under `root`. */
export async function searchInFiles(root: string, query: string, opts: SearchOptions = {}): Promise<TextMatch[]> {
  if (!query) return [];
  const o = { maxResults: 100, maxPerFile: 10, ...opts };
  return (await viaRipgrep(root, query, o)) ?? (await viaGitGrep(root, query, o)) ?? (await viaWalk(root, query, o));
}

/**
 * Files of the project for the file finder, honouring .gitignore (build output,
 * virtualenvs, target/ ... used to be listed and walked synchronously).
 * Absolute paths, at most `max`.
 */
export async function listProjectFiles(root: string, max = 50_000): Promise<string[]> {
  const take = (text: string, sep: string) =>
    text
      .split(sep)
      .filter(Boolean)
      .slice(0, max)
      .map((f) => path.resolve(root, f));

  const rg = Bun.which("rg");
  if (rg) {
    const p = Bun.spawn([rg, "--files", "--hidden", "-g", "!.git"], { cwd: root, stdout: "pipe", stderr: "ignore" });
    const out = await new Response(p.stdout).text();
    if ((await p.exited) === 0 || out) return take(out, "\n");
  }
  const git = Bun.spawn(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, stdout: "pipe", stderr: "ignore" });
  const gitOut = await new Response(git.stdout).text();
  if ((await git.exited) === 0) return take(gitOut, "\0").filter((f) => fs.existsSync(f));

  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < max) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else files.push(full);
    }
    if (files.length % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return files;
}

export const __test = { viaRipgrep, viaGitGrep, viaWalk };
