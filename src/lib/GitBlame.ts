/**
 * Git blame utilities
 */

import { execSync } from "child_process";
import * as path from "path";

export interface BlameLine {
  sha: string;
  author: string;
  authorMail: string;
  date: Date;
  line: number;
  content: string;
  isOwnCode: boolean;
}

export interface BlameInfo {
  lines: BlameLine[];
  loading: boolean;
  error: string | null;
}

/**
 * Get git blame information for a file
 */
export function getGitBlame(filePath: string, currentUser?: string): BlameLine[] {
  try {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // Run git blame with porcelain output for parsing
    const output = execSync(`git blame -l --porcelain "${fileName}"`, {
      cwd: dir,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large files
    });

    return parseBlameOutput(output, currentUser);
  } catch {
    return [];
  }
}

/**
 * Parse porcelain git blame output
 */
function parseBlameOutput(output: string, currentUser?: string): BlameLine[] {
  const lines = output.split("\n");
  const result: BlameLine[] = [];

  let currentEntry: Partial<BlameLine> = {};
  let lineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("\t")) {
      // Content line - finalize entry
      currentEntry.content = line.slice(1);
      currentEntry.line = lineNum;

      // Check if this is the current user's code
      const isOwn = currentUser
        ? currentEntry.author === currentUser || currentEntry.authorMail?.includes(currentUser)
        : false;
      currentEntry.isOwnCode = isOwn;

      result.push(currentEntry as BlameLine);
      currentEntry = {};
      lineNum++;
    } else if (line.match(/^[0-9a-f]{40}/)) {
      // SHA line
      currentEntry.sha = line.split(" ")[0]!;
    } else if (line.startsWith("author ")) {
      currentEntry.author = line.slice(7);
    } else if (line.startsWith("author-mail ")) {
      currentEntry.authorMail = line.slice(12);
    } else if (line.startsWith("author-time ")) {
      const timestamp = parseInt(line.slice(12), 10);
      currentEntry.date = new Date(timestamp * 1000);
    }
  }

  return result;
}

/**
 * Get short SHA for display
 */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Format date for blame display
 */
export function formatBlameDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "today";
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years}y ago`;
  }
}

/**
 * Format author name for display (truncate to maxLen)
 */
export function formatAuthor(author: string, maxLen: number = 12): string {
  if (author.length <= maxLen) return author.padEnd(maxLen);
  return author.slice(0, maxLen - 1) + "…";
}

/**
 * Get blame annotation for a line
 */
export function getBlameAnnotation(blameLine: BlameLine, showDetails: boolean = false): string {
  const sha = shortSha(blameLine.sha);
  const author = formatAuthor(blameLine.author, 10);
  const date = formatBlameDate(blameLine.date);

  if (showDetails) {
    return `${sha} ${author} ${date.padEnd(10)}`;
  }
  return `${author}`;
}

/**
 * Get color for blame annotation based on age
 */
export function getBlameColor(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Recent changes are brighter, older ones are dimmer
  if (diffDays < 1) return "green";
  if (diffDays < 7) return "yellow";
  if (diffDays < 30) return "cyan";
  if (diffDays < 90) return "blue";
  return "gray";
}

/**
 * Check if a line is unchanged (not committed yet)
 */
export function isUncommitted(sha: string): boolean {
  return sha.startsWith("00000000");
}
