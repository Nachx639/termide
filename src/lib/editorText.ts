/**
 * Full text of an OpenTUI textarea.
 *
 * `textarea.plainText` is capped at 1 MiB by OpenTUI (EditBuffer.getText uses a
 * fixed 1024*1024 buffer). Saving it truncated every file larger than that —
 * 2026-10-04: a 2.7 MB file was saved as a few bytes after one keystroke.
 * This reads through the same native call with a buffer that grows until the
 * text fits.
 */
export function readEditorText(ta: any): string {
  const eb = ta?.editBuffer;
  const lib = eb?.lib;
  const ptr = eb?.bufferPtr ?? eb?.ptr;
  if (!lib?.editBufferGetText || !ptr) return ta?.plainText ?? "";
  let size = 1 << 20;
  for (let i = 0; i < 10; i++) {
    const bytes: Uint8Array | null = lib.editBufferGetText(ptr, size);
    if (!bytes) return "";
    if (bytes.length < size) return lib.decoder.decode(bytes);
    size *= 4;
  }
  throw new Error("Editor buffer too large to read");
}

/** True when `text` plausibly is the whole buffer (guards saves against truncation). */
export function looksComplete(ta: any, text: string): boolean {
  const lines = ta?.lineCount;
  if (typeof lines !== "number" || lines <= 0) return true;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n === lines;
}

/**
 * Read a file for editing, refusing binaries. 2026-10-04: images opened in the
 * editor were decoded as UTF-8 (every invalid byte became U+FFFD), and the next
 * autosave wrote that text back — the README screenshot and the logo were
 * destroyed this way. A NUL byte or invalid UTF-8 means "not text".
 */
export function readTextFile(filePath: string): { text: string } | { binary: true; size: number } {
  const fs = require("fs") as typeof import("fs");
  const buf: Buffer = fs.readFileSync(filePath);
  if (buf.subarray(0, 8000).includes(0)) return { binary: true, size: buf.length };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf) };
  } catch {
    return { binary: true, size: buf.length };
  }
}
