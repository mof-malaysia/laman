/**
 * How fast one agent connection may call tools: a bucket of `burst` calls
 * that refills at `perSecond`, so an agent building a page can work in quick
 * bursts while a loop gone wrong is held to a steady pace. In memory, like
 * the sign-in limits: one process, and a restart forgiving is fine.
 */
export class CallLimit {
  readonly #buckets = new Map<string, { tokens: number; at: number }>();
  readonly #burst: number;
  readonly #perSecond: number;

  constructor({ burst = 60, perSecond = 1 }: { burst?: number; perSecond?: number } = {}) {
    this.#burst = burst;
    this.#perSecond = perSecond;
  }

  /** Takes a call for `key`; when there's none left, the seconds until there is. */
  take(key: string, at = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    // A bucket that has refilled to full is the same as none: forget it.
    for (const [k, b] of this.#buckets)
      if (this.#level(b, at) >= this.#burst) this.#buckets.delete(k);
    const tokens = this.#level(this.#buckets.get(key) ?? { tokens: this.#burst, at }, at);
    if (tokens < 1) {
      this.#buckets.set(key, { tokens, at });
      return { ok: false, retryAfterSeconds: Math.ceil((1 - tokens) / this.#perSecond) };
    }
    this.#buckets.set(key, { tokens: tokens - 1, at });
    return { ok: true };
  }

  /** The calls a bucket holds at `at`: what it had, refilled since, up to `burst`. */
  #level(bucket: { tokens: number; at: number }, at: number) {
    return Math.min(this.#burst, bucket.tokens + ((at - bucket.at) / 1000) * this.#perSecond);
  }
}
