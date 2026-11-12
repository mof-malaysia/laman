/** Small helpers for sets held in React state. */

/** A checkbox's change to a set in state: `toggleIn(setChosen)(id, on)` adds or removes `id`. */
export const toggleIn =
  <T>(set: (change: (was: Set<T>) => Set<T>) => void) =>
  (item: T, on: boolean) =>
    set((was) => {
      const next = new Set(was);
      if (on) next.add(item);
      else next.delete(item);
      return next;
    });
