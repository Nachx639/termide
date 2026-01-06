import * as path from "path";
import * as fs from "fs";
import { FILE_PATTERNS, LIMITS } from "./config";
import { logger } from "./logger";

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
export function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a file is binary based on extension
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_PATTERNS.BINARY_EXTENSIONS.includes(ext);
}

/**
 * Check if a file/directory should be ignored
 */
export function shouldIgnore(name: string): boolean {
  return FILE_PATTERNS.IGNORED_PATTERNS.includes(name);
}

/**
 * Get file size in bytes
 */
export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Check if file is too large for preview
 */
export function isFileTooLarge(filePath: string): boolean {
  return getFileSize(filePath) > LIMITS.MAX_FILE_SIZE_PREVIEW;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * Get relative path from root
 */
export function getRelativePath(filePath: string, rootPath: string): string {
  return path.relative(rootPath, filePath);
}

/**
 * Get file extension without dot
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

/**
 * Get filename without extension
 */
export function getBasename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Read file content safely
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    if (isBinaryFile(filePath)) {
      logger.debug("file", `Skipping binary file: ${filePath}`);
      return null;
    }

    if (isFileTooLarge(filePath)) {
      logger.warn("file", `File too large: ${filePath}`);
      return null;
    }

    const file = Bun.file(filePath);
    return await file.text();
  } catch (err) {
    logger.error("file", `Failed to read file: ${filePath}`, err);
    return null;
  }
}

/**
 * Write file content safely
 */
export async function writeFileSafe(
  filePath: string,
  content: string
): Promise<boolean> {
  try {
    await Bun.write(filePath, content);
    logger.debug("file", `Wrote file: ${filePath}`);
    return true;
  } catch (err) {
    logger.error("file", `Failed to write file: ${filePath}`, err);
    return false;
  }
}

/**
 * Create directory if it doesn't exist
 */
export function ensureDirectory(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug("file", `Created directory: ${dirPath}`);
    }
    return true;
  } catch (err) {
    logger.error("file", `Failed to create directory: ${dirPath}`, err);
    return false;
  }
}

/**
 * Delete file safely
 */
export function deleteFileSafe(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    logger.debug("file", `Deleted file: ${filePath}`);
    return true;
  } catch (err) {
    logger.error("file", `Failed to delete file: ${filePath}`, err);
    return false;
  }
}

/**
 * Rename/move file safely
 */
export function renameFileSafe(oldPath: string, newPath: string): boolean {
  try {
    fs.renameSync(oldPath, newPath);
    logger.debug("file", `Renamed: ${oldPath} -> ${newPath}`);
    return true;
  } catch (err) {
    logger.error("file", `Failed to rename: ${oldPath}`, err);
    return false;
  }
}

/**
 * Copy file safely
 */
export function copyFileSafe(srcPath: string, destPath: string): boolean {
  try {
    fs.copyFileSync(srcPath, destPath);
    logger.debug("file", `Copied: ${srcPath} -> ${destPath}`);
    return true;
  } catch (err) {
    logger.error("file", `Failed to copy: ${srcPath}`, err);
    return false;
  }
}

/**
 * List files in directory
 */
export function listDirectory(
  dirPath: string,
  options: { includeHidden?: boolean; recursive?: boolean } = {}
): string[] {
  const { includeHidden = false, recursive = false } = options;
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!includeHidden && entry.name.startsWith(".")) continue;

      // Skip ignored patterns
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        results.push(...listDirectory(fullPath, options));
      } else {
        results.push(fullPath);
      }
    }
  } catch (err) {
    logger.error("file", `Failed to list directory: ${dirPath}`, err);
  }

  return results;
}

/**
 * Get file modification time
 */
export function getModificationTime(filePath: string): Date | null {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

/**
 * Check if file was modified after a given date
 */
export function isModifiedAfter(filePath: string, date: Date): boolean {
  const mtime = getModificationTime(filePath);
  return mtime ? mtime > date : false;
}

/**
 * Generate a unique filename if file exists
 */
export function getUniqueFilename(filePath: string): string {
  if (!fileExists(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  let counter = 1;
  let newPath = filePath;

  while (fileExists(newPath)) {
    newPath = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }

  return newPath;
}

/**
 * Normalize path separators for current platform
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Join paths safely
 */
export function joinPaths(...paths: string[]): string {
  return path.join(...paths);
}

/**
 * Get parent directory
 */
export function getParentDir(filePath: string): string {
  return path.dirname(filePath);
}
