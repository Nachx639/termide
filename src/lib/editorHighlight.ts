/**
 * Syntax highlighting for the editor (a native <textarea>, which has no highlighter
 * of its own — files were shown as plain text).
 *
 * Tree-sitter (bundled with OpenTUI) is used where it has a grammar (TypeScript,
 * JavaScript, Markdown, Zig); everything else falls back to the regex tokenizer in
 * SyntaxHighlighter. Both produce per-line column ranges with a style name that the
 * editor applies with textarea.addHighlight().
 */
import { getTreeSitterClient, pathToFiletype } from "@opentui/core";
import { detectLanguage, tokenizeLine } from "./SyntaxHighlighter";

export interface LineRange {
  line: number;
  start: number;
  end: number;
  name: string;
}

type SimpleHighlight = [number, number, string, Record<string, unknown>?];

const specificity = (group: string) => group.split(".").length;

/**
 * Flatten overlapping tree-sitter captures into non-overlapping segments, choosing
 * the same winner OpenTUI's own code renderer does (most specific name, then the
 * latest capture), and split them into per-line ranges.
 */
export function rangesFromTreeSitter(content: string, highlights: SimpleHighlight[]): LineRange[] {
  const bounds: { offset: number; start: boolean; i: number }[] = [];
  highlights.forEach(([s, e], i) => {
    if (e > s) bounds.push({ offset: s, start: true, i }, { offset: e, start: false, i });
  });
  bounds.sort((a, b) => a.offset - b.offset || (a.start === b.start ? 0 : a.start ? 1 : -1));

  const segments: { start: number; end: number; name: string }[] = [];
  const active = new Set<number>();
  let cur = 0;
  for (const b of bounds) {
    if (b.offset > cur && active.size) {
      let best = -1;
      for (const i of active) {
        if (best === -1) { best = i; continue; }
        const d = specificity(highlights[i]![2]) - specificity(highlights[best]![2]);
        if (d > 0 || (d === 0 && i > best)) best = i;
      }
      const name = highlights[best]![2];
      const last = segments[segments.length - 1];
      if (last && last.end === cur && last.name === name) last.end = b.offset;
      else segments.push({ start: cur, end: b.offset, name });
    }
    cur = b.offset;
    if (b.start) active.add(b.i);
    else active.delete(b.i);
  }

  // Offsets → (line, column); multi-line captures (comments, strings) are split.
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = (off: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const out: LineRange[] = [];
  for (const seg of segments) {
    let line = lineOf(seg.start);
    let off = seg.start;
    while (off < seg.end) {
      const lineStart = lineStarts[line]!;
      const nextStart = lineStarts[line + 1] ?? content.length + 1;
      const lineEnd = nextStart - 1; // position of "\n"
      const end = Math.min(seg.end, lineEnd);
      if (end > off) out.push({ line, start: off - lineStart, end: end - lineStart, name: seg.name });
      off = nextStart;
      line++;
    }
  }
  return out;
}

/** Regex tokenizer fallback (no multi-line state). */
export function rangesFromTokenizer(content: string, lang: string): LineRange[] {
  const out: LineRange[] = [];
  content.split("\n").forEach((text, line) => {
    let col = 0;
    for (const tok of tokenizeLine(text, lang)) {
      const end = col + tok.text.length;
      if (tok.type !== "default" && tok.text.trim()) out.push({ line, start: col, end, name: tok.type });
      col = end;
    }
  });
  return out;
}

let tsReady: Promise<boolean> | null = null;
function treeSitter() {
  tsReady ??= getTreeSitterClient()
    .initialize()
    .then(() => true)
    .catch(() => false);
  return tsReady;
}

/** Highlight ranges for a file's content; [] for unknown or very large files. */
export async function highlightRanges(filePath: string, content: string): Promise<LineRange[]> {
  if (content.length > 2_000_000) return [];
  const ft = pathToFiletype(filePath);
  if (ft && (await treeSitter())) {
    try {
      const r = await getTreeSitterClient().highlightOnce(content, ft);
      if (r.highlights?.length) return rangesFromTreeSitter(content, r.highlights as SimpleHighlight[]);
    } catch {}
  }
  const lang = detectLanguage(filePath);
  return lang ? rangesFromTokenizer(content, lang) : [];
}
