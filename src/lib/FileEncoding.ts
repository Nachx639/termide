import * as fs from "fs";

export interface FileInfo {
  encoding: string;
  lineEnding: "LF" | "CRLF" | "CR" | "Mixed";
  hasBOM: boolean;
  indentStyle: "spaces" | "tabs" | "mixed" | "none";
  indentSize: number;
}

/**
 * Detect file encoding and properties
 */
export function detectFileInfo(filePath: string): FileInfo {
  try {
    const buffer = fs.readFileSync(filePath);
    const text = buffer.toString("utf-8");

    return {
      encoding: detectEncoding(buffer),
      lineEnding: detectLineEnding(text),
      hasBOM: hasBOM(buffer),
      ...detectIndentation(text),
    };
  } catch {
    return {
      encoding: "utf-8",
      lineEnding: "LF",
      hasBOM: false,
      indentStyle: "none",
      indentSize: 2,
    };
  }
}

/**
 * Detect encoding from buffer
 */
function detectEncoding(buffer: Buffer): string {
  // Check for BOM markers
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8-bom";
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return "utf-16-be";
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return "utf-16-le";
  }
  if (buffer.length >= 4 && buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 0xfe && buffer[3] === 0xff) {
    return "utf-32-be";
  }

  // Check for binary content (null bytes, control characters)
  let nullCount = 0;
  let highByteCount = 0;
  const sampleSize = Math.min(buffer.length, 1024);

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i]!;
    if (byte === 0) nullCount++;
    if (byte > 127) highByteCount++;
  }

  if (nullCount > sampleSize * 0.1) {
    return "binary";
  }

  // Check for valid UTF-8 sequences
  if (isValidUtf8(buffer)) {
    if (highByteCount > 0) {
      return "utf-8";
    }
    return "ascii";
  }

  // Likely latin1/iso-8859-1
  if (highByteCount > 0) {
    return "latin1";
  }

  return "utf-8";
}

/**
 * Check if buffer is valid UTF-8
 */
function isValidUtf8(buffer: Buffer): boolean {
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i]!;

    if (byte <= 0x7f) {
      // ASCII
      i++;
    } else if ((byte & 0xe0) === 0xc0) {
      // 2-byte sequence
      if (i + 1 >= buffer.length || (buffer[i + 1]! & 0xc0) !== 0x80) {
        return false;
      }
      i += 2;
    } else if ((byte & 0xf0) === 0xe0) {
      // 3-byte sequence
      if (i + 2 >= buffer.length || (buffer[i + 1]! & 0xc0) !== 0x80 || (buffer[i + 2]! & 0xc0) !== 0x80) {
        return false;
      }
      i += 3;
    } else if ((byte & 0xf8) === 0xf0) {
      // 4-byte sequence
      if (
        i + 3 >= buffer.length ||
        (buffer[i + 1]! & 0xc0) !== 0x80 ||
        (buffer[i + 2]! & 0xc0) !== 0x80 ||
        (buffer[i + 3]! & 0xc0) !== 0x80
      ) {
        return false;
      }
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Check if buffer starts with UTF-8 BOM
 */
function hasBOM(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

/**
 * Detect line ending style
 */
function detectLineEnding(text: string): "LF" | "CRLF" | "CR" | "Mixed" {
  const crlfCount = (text.match(/\r\n/g) || []).length;
  const crOnlyCount = (text.match(/\r(?!\n)/g) || []).length;
  const lfOnlyCount = (text.match(/(?<!\r)\n/g) || []).length;

  if (crlfCount > 0 && lfOnlyCount === 0 && crOnlyCount === 0) {
    return "CRLF";
  }
  if (crOnlyCount > 0 && crlfCount === 0 && lfOnlyCount === 0) {
    return "CR";
  }
  if (lfOnlyCount > 0 && crlfCount === 0 && crOnlyCount === 0) {
    return "LF";
  }
  if ((crlfCount > 0 && lfOnlyCount > 0) || (crlfCount > 0 && crOnlyCount > 0) || (lfOnlyCount > 0 && crOnlyCount > 0)) {
    return "Mixed";
  }

  return "LF"; // Default
}

/**
 * Detect indentation style and size
 */
function detectIndentation(text: string): { indentStyle: "spaces" | "tabs" | "mixed" | "none"; indentSize: number } {
  const lines = text.split(/\r?\n/);
  let spaceIndentCounts: Record<number, number> = {};
  let tabCount = 0;
  let spaceCount = 0;

  for (const line of lines) {
    const leadingWhitespace = line.match(/^[\t ]+/);
    if (!leadingWhitespace) continue;

    const ws = leadingWhitespace[0];
    if (ws.includes("\t") && ws.includes(" ")) {
      // Mixed indentation on this line
      tabCount++;
      spaceCount++;
    } else if (ws.startsWith("\t")) {
      tabCount++;
    } else {
      spaceCount++;
      // Count the indent size
      const indent = ws.length;
      if (indent > 0 && indent <= 8) {
        spaceIndentCounts[indent] = (spaceIndentCounts[indent] || 0) + 1;
      }
    }
  }

  if (tabCount === 0 && spaceCount === 0) {
    return { indentStyle: "none", indentSize: 2 };
  }

  if (tabCount > 0 && spaceCount === 0) {
    return { indentStyle: "tabs", indentSize: 4 };
  }

  if (spaceCount > 0 && tabCount === 0) {
    // Determine most common indent size
    let mostCommonSize = 2;
    let maxCount = 0;
    for (const [size, count] of Object.entries(spaceIndentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonSize = parseInt(size);
      }
    }
    // Common indent sizes are typically 2, 4, or 8
    if (mostCommonSize > 4) {
      // Check if it's a multiple of 4 or 2
      if (mostCommonSize % 4 === 0) mostCommonSize = 4;
      else if (mostCommonSize % 2 === 0) mostCommonSize = 2;
    }
    return { indentStyle: "spaces", indentSize: mostCommonSize };
  }

  return { indentStyle: "mixed", indentSize: 2 };
}

/**
 * Get display string for encoding
 */
export function formatEncoding(info: FileInfo): string {
  let result = info.encoding.toUpperCase();
  if (info.hasBOM && !info.encoding.includes("bom")) {
    result += " BOM";
  }
  return result;
}

/**
 * Get display string for line ending
 */
export function formatLineEnding(lineEnding: FileInfo["lineEnding"]): string {
  return lineEnding;
}

/**
 * Get display string for indentation
 */
export function formatIndent(info: FileInfo): string {
  if (info.indentStyle === "none") return "";
  if (info.indentStyle === "tabs") return "Tab";
  if (info.indentStyle === "mixed") return "Mixed";
  return `Spc:${info.indentSize}`;
}
