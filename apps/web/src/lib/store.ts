import { useCallback, useSyncExternalStore } from "react";

/**
 * A value kept in the browser tab (sessionStorage), readable during render
 * without a hydration mismatch: the server and the first paint see `initial`.
 */
export function createTabStore<T>(key: string, initial: T) {
  let cached: T | undefined;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cached === undefined) {
      try {
        const raw = window.sessionStorage.getItem(key);
        cached = raw ? (JSON.parse(raw) as T) : initial;
      } catch {
        cached = initial;
      }
    }
    return cached;
  };
  const write = (next: T) => {
    cached = next;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Without storage the value lasts for this page only.
    }
    listeners.forEach((fn) => fn());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return function useTabStore(): [T, (next: T | ((held: T) => T)) => void] {
    const value = useSyncExternalStore(subscribe, read, () => initial);
    const set = useCallback((next: T | ((held: T) => T)) => {
      write(
        typeof next === "function" ? (next as (held: T) => T)(read()) : next,
      );
    }, []);
    return [value, set];
  };
}
