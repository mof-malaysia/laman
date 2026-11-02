/** A tiny external store for state shared across the shell, read with useSyncExternalStore. */
import { useSyncExternalStore } from "react";

export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T | ((current: T) => T)) {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
