import { useEffect, useRef, useCallback } from "react";

/**
 * A safe interval hook that properly cleans up on unmount.
 * The callback is always fresh (no stale closures) thanks to useRef.
 *
 * @param callback - Function to call on each interval
 * @param delay - Interval delay in ms (null to pause)
 * @param immediate - If true, runs callback immediately on mount
 */
export function useInterval(
  callback: () => void,
  delay: number | null,
  immediate = false
): void {
  const savedCallback = useRef<() => void>(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Run immediately if requested
  useEffect(() => {
    if (immediate && delay !== null) {
      savedCallback.current();
    }
  }, [immediate, delay]);

  // Set up the interval
  useEffect(() => {
    if (delay === null) return;

    const tick = () => savedCallback.current();
    const id = setInterval(tick, delay);

    return () => clearInterval(id);
  }, [delay]);
}

/**
 * A safe timeout hook that properly cleans up on unmount.
 * Returns a function to manually cancel the timeout.
 *
 * @param callback - Function to call after delay
 * @param delay - Timeout delay in ms (null to disable)
 * @returns cancel function
 */
export function useTimeout(
  callback: () => void,
  delay: number | null
): () => void {
  const savedCallback = useRef<() => void>(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Cancel function
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Set up the timeout
  useEffect(() => {
    if (delay === null) return;

    timeoutRef.current = setTimeout(() => {
      savedCallback.current();
    }, delay);

    return cancel;
  }, [delay, cancel]);

  return cancel;
}

/**
 * A debounced callback hook - delays execution until after delay has passed
 * since the last call.
 *
 * @param callback - Function to debounce
 * @param delay - Debounce delay in ms
 * @returns Debounced function
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef<T>(callback);

  // Keep callback fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * A throttled callback hook - ensures callback is called at most once per delay period.
 *
 * @param callback - Function to throttle
 * @param delay - Throttle delay in ms
 * @returns Throttled function
 */
export function useThrottledCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef<T>(callback);

  // Keep callback fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        lastRun.current = now;
        callbackRef.current(...args);
      } else {
        // Schedule for remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          lastRun.current = Date.now();
          callbackRef.current(...args);
        }, delay - timeSinceLastRun);
      }
    }) as T,
    [delay]
  );
}
