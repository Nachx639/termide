import { useState, useCallback } from "react";
import { logger } from "../lib/logger";

interface UseClipboardOptions {
  /** Timeout in ms after which copied state resets (default: 2000) */
  timeout?: number;
  /** Callback when copy succeeds */
  onCopySuccess?: (text: string) => void;
  /** Callback when copy fails */
  onCopyError?: (error: Error) => void;
}

interface UseClipboardReturn {
  /** Copy text to clipboard */
  copy: (text: string) => Promise<boolean>;
  /** Paste text from clipboard */
  paste: () => Promise<string>;
  /** Whether a recent copy operation succeeded */
  copied: boolean;
  /** Whether a clipboard operation is in progress */
  isLoading: boolean;
  /** Last error if any */
  error: Error | null;
}

/**
 * Copy to clipboard using OSC52 escape sequence.
 * Works in iTerm, Terminal.app, Kitty, Alacritty, tmux, and over SSH.
 */
function copyWithOSC52(text: string): void {
  const base64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${base64}\x07`);
}

/**
 * Copy to clipboard using pbcopy (macOS fallback).
 */
async function copyWithPbcopy(text: string): Promise<void> {
  const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
}

/**
 * Paste from clipboard using pbpaste (macOS).
 */
async function pasteWithPbpaste(): Promise<string> {
  const proc = Bun.spawn(["pbpaste"], { stdout: "pipe" });
  const output = await new Response(proc.stdout).text();
  return output;
}

/**
 * Hook for clipboard operations with status tracking.
 *
 * @example
 * ```tsx
 * const { copy, paste, copied } = useClipboard({
 *   onCopySuccess: () => showNotification("Copied!"),
 * });
 *
 * // Copy text
 * await copy("Hello, World!");
 *
 * // Paste text
 * const text = await paste();
 * ```
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { timeout = 2000, onCopySuccess, onCopyError } = options;

  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // Always try OSC52 first (universal support)
        copyWithOSC52(text);
        logger.debug("clipboard", "Copied via OSC52", { length: text.length });

        // Also try pbcopy as backup for macOS
        try {
          await copyWithPbcopy(text);
          logger.debug("clipboard", "Also copied via pbcopy");
        } catch (err) {
          // pbcopy not available - OSC52 already handled it
          logger.debug("clipboard", "pbcopy fallback skipped (non-macOS)", err);
        }

        setCopied(true);
        onCopySuccess?.(text);

        // Reset copied state after timeout
        if (timeout > 0) {
          setTimeout(() => setCopied(false), timeout);
        }

        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Copy failed");
        setError(error);
        logger.error("clipboard", "Copy failed", err);
        onCopyError?.(error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [timeout, onCopySuccess, onCopyError]
  );

  const paste = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const text = await pasteWithPbpaste();
      logger.debug("clipboard", "Pasted from clipboard", { length: text.length });
      return text;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Paste failed");
      setError(error);
      logger.error("clipboard", "Paste failed", err);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    copy,
    paste,
    copied,
    isLoading,
    error,
  };
}

/**
 * Simple clipboard copy without React state tracking.
 * Useful for one-off copies in event handlers.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    copyWithOSC52(text);
    try {
      await copyWithPbcopy(text);
    } catch {
      // Non-macOS, OSC52 already handled it
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple clipboard paste without React state tracking.
 */
export async function pasteFromClipboard(): Promise<string> {
  return pasteWithPbpaste();
}
