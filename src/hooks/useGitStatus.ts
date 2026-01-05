import { useState, useEffect, useCallback, useRef } from "react";
import {
  getGitStatus,
  invalidateGitCache,
  type GitStatus,
} from "../lib/GitIntegration";
import { TIMING } from "../lib/config";

interface UseGitStatusOptions {
  /** Root path of the git repository */
  rootPath: string;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** Custom polling interval in ms (default: from config) */
  pollInterval?: number;
  /** Callback when status changes */
  onStatusChange?: (status: GitStatus) => void;
}

interface UseGitStatusReturn {
  /** Current git status */
  status: GitStatus | null;
  /** Whether currently fetching status */
  isLoading: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Manually refresh status */
  refresh: () => Promise<void>;
  /** Invalidate cache and refresh */
  invalidateAndRefresh: () => Promise<void>;
}

/**
 * Hook for managing git status polling with automatic cleanup.
 * Centralizes git status logic that was previously scattered across components.
 *
 * @example
 * ```tsx
 * const { status, refresh, isLoading } = useGitStatus({
 *   rootPath: "/path/to/repo",
 *   enabled: isFocused,
 * });
 * ```
 */
export function useGitStatus({
  rootPath,
  enabled = true,
  pollInterval = TIMING.GIT_STATUS_POLL_INTERVAL,
  onStatusChange,
}: UseGitStatusOptions): UseGitStatusReturn {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const previousStatusRef = useRef<GitStatus | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (!rootPath || !mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const newStatus = await getGitStatus(rootPath);

      if (!mountedRef.current) return;

      setStatus(newStatus);

      // Notify if status changed
      if (
        onStatusChange &&
        JSON.stringify(newStatus) !== JSON.stringify(previousStatusRef.current)
      ) {
        onStatusChange(newStatus);
      }
      previousStatusRef.current = newStatus;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error("Failed to get git status"));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [rootPath, onStatusChange]);

  const invalidateAndRefresh = useCallback(async () => {
    invalidateGitCache();
    await fetchStatus();
  }, [fetchStatus]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchStatus();
    }
  }, [enabled, fetchStatus]);

  // Polling
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const interval = setInterval(fetchStatus, pollInterval);

    return () => clearInterval(interval);
  }, [enabled, pollInterval, fetchStatus]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    status,
    isLoading,
    error,
    refresh: fetchStatus,
    invalidateAndRefresh,
  };
}

/**
 * Simplified hook that just returns the git status.
 * Useful when you don't need loading/error states.
 */
export function useSimpleGitStatus(
  rootPath: string,
  enabled = true
): GitStatus | null {
  const { status } = useGitStatus({ rootPath, enabled });
  return status;
}
