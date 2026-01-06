/**
 * Development logger for Termide
 * Provides categorized logging that can be enabled/disabled via environment variable.
 *
 * Usage:
 *   import { logger } from "./lib/logger";
 *   logger.debug("git", "Fetching status...");
 *   logger.error("clipboard", "Failed to copy", error);
 *
 * Enable logging:
 *   TERMIDE_DEBUG=* bun run dev           # All categories
 *   TERMIDE_DEBUG=git,acp bun run dev     # Specific categories
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

// Categories of logs
export type LogCategory =
  | "git"
  | "acp"
  | "clipboard"
  | "session"
  | "terminal"
  | "file"
  | "ui"
  | "keyboard"
  | "general";

class Logger {
  private enabledCategories: Set<string> = new Set();
  private history: LogEntry[] = [];
  private maxHistory = 100;

  constructor() {
    this.parseDebugEnv();
  }

  private parseDebugEnv(): void {
    const debug = process.env.TERMIDE_DEBUG;
    if (!debug) return;

    if (debug === "*" || debug === "all") {
      // Enable all categories
      this.enabledCategories = new Set([
        "git", "acp", "clipboard", "session",
        "terminal", "file", "ui", "keyboard", "general"
      ]);
    } else {
      // Parse comma-separated categories
      debug.split(",").forEach(cat => {
        this.enabledCategories.add(cat.trim().toLowerCase());
      });
    }
  }

  private isEnabled(category: LogCategory): boolean {
    return this.enabledCategories.has(category) || this.enabledCategories.has("*");
  }

  private formatMessage(level: LogLevel, category: string, message: string): string {
    const time = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const levelIcon = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌"
    }[level];
    return `${levelIcon} [${time}] [${category}] ${message}`;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
    // Always store in history (limited)
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data
    };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Only output if category is enabled
    if (!this.isEnabled(category)) return;

    const formatted = this.formatMessage(level, category, message);

    switch (level) {
      case "debug":
        console.debug(formatted, data !== undefined ? data : "");
        break;
      case "info":
        console.info(formatted, data !== undefined ? data : "");
        break;
      case "warn":
        console.warn(formatted, data !== undefined ? data : "");
        break;
      case "error":
        console.error(formatted, data !== undefined ? data : "");
        break;
    }
  }

  debug(category: LogCategory, message: string, data?: unknown): void {
    this.log("debug", category, message, data);
  }

  info(category: LogCategory, message: string, data?: unknown): void {
    this.log("info", category, message, data);
  }

  warn(category: LogCategory, message: string, data?: unknown): void {
    this.log("warn", category, message, data);
  }

  error(category: LogCategory, message: string, data?: unknown): void {
    this.log("error", category, message, data);
  }

  /**
   * Get recent log history (useful for debugging)
   */
  getHistory(category?: LogCategory, level?: LogLevel): LogEntry[] {
    return this.history.filter(entry => {
      if (category && entry.category !== category) return false;
      if (level && entry.level !== level) return false;
      return true;
    });
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Check if any logging is enabled
   */
  isLoggingEnabled(): boolean {
    return this.enabledCategories.size > 0;
  }
}

// Singleton instance
export const logger = new Logger();

/**
 * Helper to safely get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

/**
 * Helper to safely log errors in catch blocks
 */
export function logCatchError(
  category: LogCategory,
  context: string,
  error: unknown
): void {
  logger.error(category, `${context}: ${getErrorMessage(error)}`, error);
}
