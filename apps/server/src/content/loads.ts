/**
 * What one publish would otherwise read again for every address it writes:
 * the page tree, the site documents, a listing's settings and entries. A
 * publish makes one `Loads` and passes it down, so each is read once. The
 * canvas and preview pass none and read fresh every time.
 */
export type Loads = Map<string, Promise<unknown>>;

export const newLoads = (): Loads => new Map();

/** `load()`, or the result of the first call with this key in this publish. */
export function once<T>(loads: Loads | undefined, key: string, load: () => Promise<T>): Promise<T> {
  if (!loads) return load();
  let result = loads.get(key) as Promise<T> | undefined;
  if (!result) {
    result = load();
    loads.set(key, result);
  }
  return result;
}
