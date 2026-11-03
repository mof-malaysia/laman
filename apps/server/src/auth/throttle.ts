/**
 * Slows down guessing. Tries are counted per key (a username, an IP) as
 * they start, so a burst sent at once can't all slip past while the
 * password check runs; a success forgets them. After `free` tries each
 * must wait twice as long as the last, up to `maxMs`. Nothing locks for
 * good, so nobody can lock an officer out on purpose. In memory: one
 * process, and a restart forgiving is fine.
 */
import { HttpError } from "../errors.js";

const BASE_MS = 1000;
/** A key with no failure for this long starts again. */
const FORGET_MS = 60 * 60 * 1000;

type Entry = { failures: number; until: number; last: number };

export class Throttle {
  readonly #entries = new Map<string, Entry>();
  readonly #free: number;
  readonly #maxMs: number;

  constructor({ free = 5, maxMs = 15 * 60 * 1000 }: { free?: number; maxMs?: number } = {}) {
    this.#free = free;
    this.#maxMs = maxMs;
  }

  /** Counts a try now, or throws 429 when any of `keys` must still wait. `succeed` forgets it. */
  attempt(keys: string[], at = Date.now()) {
    this.check(keys, at);
    this.fail(keys, at);
  }

  /** Throws 429 when any of `keys` must still wait. */
  check(keys: string[], at = Date.now()) {
    const wait = Math.max(0, ...keys.map((k) => (this.#live(k, at)?.until ?? 0) - at));
    if (wait > 0)
      throw new HttpError(
        429,
        "too_many_attempts",
        `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds and try again.`,
        { retryAfterSeconds: Math.ceil(wait / 1000) },
      );
  }

  fail(keys: string[], at = Date.now()) {
    // Guessing with ever-new usernames mustn't grow this for good.
    for (const [key, entry] of this.#entries)
      if (at - entry.last > FORGET_MS) this.#entries.delete(key);
    for (const key of keys) {
      const entry = this.#live(key, at) ?? { failures: 0, until: 0, last: at };
      entry.failures++;
      entry.last = at;
      if (entry.failures >= this.#free)
        entry.until = at + Math.min(this.#maxMs, BASE_MS * 2 ** (entry.failures - this.#free));
      this.#entries.set(key, entry);
    }
  }

  succeed(keys: string[]) {
    for (const key of keys) this.#entries.delete(key);
  }

  #live(key: string, at: number) {
    const entry = this.#entries.get(key);
    if (entry && at - entry.last > FORGET_MS) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
