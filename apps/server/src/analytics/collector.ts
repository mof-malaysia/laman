/**
 * Takes the beacons from `/_v`: drops bots, Global Privacy Control browsers
 * and floods, turns the visitor's address into the day's visitor hash, and
 * writes in batches. No address is stored. See docs/analytics.md.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Beacon } from "@fiscal-sb/contracts";
import type { FastifyBaseLogger } from "fastify";
import { isbot } from "isbot";
import maxmind, { type CountryResponse, type Reader } from "maxmind";
import { parseAgent, primaryLanguage, screenBucket } from "./agent.js";
import { type AnalyticsDb, type EventsTable, type ViewsTable, addDays, localDay } from "./db.js";

const VISIT_GAP_MS = 30 * 60_000;
/** One leave beacon counts at most this much: a tab left open overnight isn't a long read. */
const MAX_VISIBLE_MS = 30 * 60_000;
const FLUSH_MS = 2000;
const FLUSH_ROWS = 500;
const PER_MINUTE = 60;

/** The request a beacon came in: `host` is the site's host name, lower case, without a port. */
export type Visitor = { ip: string; userAgent: string; host: string; gpc: boolean };

type Queued =
  | { kind: "view"; row: Omit<ViewsTable, "visit"> }
  | { kind: "leave"; id: string; visitor: string; visible: number }
  | { kind: "event"; row: EventsTable };

export type CollectorOptions = {
  log: FastifyBaseLogger;
  /** Days kept, from the live settings; read at each prune. */
  retentionDays: () => Promise<number>;
  /** Host names beacons may come from besides the request's own (SITE_URL's). */
  siteHosts: string[];
  /** A MaxMind-format country database. */
  geoipPath?: string | undefined;
};

/** Host name of an address (no port), or null when it isn't one. */
const hostOf = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
};

export class Collector {
  readonly #db: AnalyticsDb;
  readonly #options: CollectorOptions;
  #geo: Reader<CountryResponse> | undefined;
  #queue: Queued[] = [];
  #salt: { day: string; salt: string } | undefined;
  /** Each visitor's latest visit, so a view can join it. */
  readonly #visits = new Map<string, { visit: string; last: number }>();
  readonly #hits = new Map<string, number>();
  #timers: NodeJS.Timeout[] = [];
  #flushing: Promise<void> | undefined;

  constructor(db: AnalyticsDb, options: CollectorOptions) {
    this.#db = db;
    this.#options = options;
  }

  get countries() {
    return Boolean(this.#geo);
  }

  async start() {
    const path = this.#options.geoipPath;
    if (path)
      try {
        this.#geo = await maxmind.open<CountryResponse>(path);
      } catch (error) {
        this.#options.log.warn({ err: error, path }, "GEOIP_DB could not be read; no countries");
      }
    this.#timers = [
      setInterval(() => void this.flush(), FLUSH_MS),
      setInterval(() => this.#hits.clear(), 60_000),
      setInterval(() => void this.prune(), 60 * 60_000),
    ];
    for (const timer of this.#timers) timer.unref();
    void this.prune();
  }

  async stop() {
    for (const timer of this.#timers) clearInterval(timer);
    await this.flush();
  }

  /** The day's salt: made on the first beacon of the day, and yesterday's deleted. */
  async #saltFor(day: string) {
    if (this.#salt?.day === day) return this.#salt.salt;
    // Keeps the salt already stored for today (after a restart), else stores a new one.
    await this.#db
      .insertInto("salts")
      .values({ day, salt: randomBytes(32).toString("hex") })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await this.#db.deleteFrom("salts").where("day", "!=", day).execute();
    const stored = await this.#db
      .selectFrom("salts")
      .select("salt")
      .where("day", "=", day)
      .executeTakeFirstOrThrow();
    this.#salt = { day, salt: stored.salt };
    return stored.salt;
  }

  /**
   * Whether this request may be counted at all: not a bot, not a GPC browser,
   * not a flood, and sent from one of the site's own pages.
   */
  allowed(visitor: Visitor, origin: string | undefined) {
    if (visitor.gpc || !visitor.userAgent || isbot(visitor.userAgent)) return false;
    const from = hostOf(origin);
    if (!from || !(from === visitor.host || this.#options.siteHosts.includes(from))) return false;
    const hits = (this.#hits.get(visitor.ip) ?? 0) + 1;
    this.#hits.set(visitor.ip, hits);
    return hits <= PER_MINUTE;
  }

  /**
   * Queues one beacon. Whether to count at all is the published pages' call:
   * the beacon is only in them while counting is on.
   */
  async accept(beacon: Beacon, visitor: Visitor) {
    const at = Date.now();
    const { day, hour } = localDay(at);
    const salt = await this.#saltFor(day);
    const hash = createHash("sha256")
      .update(`${salt}\n${visitor.ip}\n${visitor.userAgent}\n${visitor.host}`)
      .digest("hex")
      .slice(0, 32);

    if (beacon.type === "view") {
      const agent = parseAgent(visitor.userAgent);
      const referrer = hostOf(beacon.referrer);
      const country = this.#geo?.get(visitor.ip)?.country?.iso_code ?? "";
      this.#queue.push({
        kind: "view",
        row: {
          id: beacon.id,
          visitor: hash,
          at,
          day,
          hour,
          page_id: beacon.page ?? null,
          path: beacon.path,
          referrer: referrer === visitor.host ? null : referrer,
          utm_source: beacon.utm?.source || null,
          utm_medium: beacon.utm?.medium || null,
          utm_campaign: beacon.utm?.campaign || null,
          ...agent,
          screen: screenBucket(beacon.screen),
          language: primaryLanguage(beacon.language),
          country,
          visible: 0,
        },
      });
    } else if (beacon.type === "leave") {
      this.#queue.push({
        kind: "leave",
        id: beacon.id,
        visitor: hash,
        visible: Math.min(beacon.visible, MAX_VISIBLE_MS),
      });
    } else {
      const target =
        beacon.type === "outbound" ? (hostOf(`https://${beacon.target}`) ?? "") : beacon.target;
      if (!target) return;
      this.#queue.push({
        kind: "event",
        row: {
          id: undefined,
          at,
          day,
          visitor: hash,
          kind: beacon.type,
          page_id: beacon.page ?? null,
          path: beacon.path,
          target,
        },
      });
    }
    if (this.#queue.length >= FLUSH_ROWS) void this.flush();
  }

  /** Writes what's queued, in one transaction. */
  flush(): Promise<void> {
    this.#flushing ??= this.#write().finally(() => {
      this.#flushing = undefined;
    });
    return this.#flushing;
  }

  async #write() {
    while (this.#queue.length) {
      const batch = this.#queue.splice(0, FLUSH_ROWS);
      try {
        await this.#db.transaction().execute(async (trx) => {
          for (const item of batch) {
            if (item.kind === "view") {
              const visit = await this.#visitOf(trx, item.row.visitor, item.row.at);
              await trx
                .insertInto("views")
                .values({ ...item.row, visit })
                .onConflict((oc) => oc.doNothing())
                .execute();
            } else if (item.kind === "leave") {
              await trx
                .updateTable("views")
                .set((eb) => ({ visible: eb("visible", "+", item.visible) }))
                .where("id", "=", item.id)
                .where("visitor", "=", item.visitor)
                .execute();
            } else {
              await trx.insertInto("events").values(item.row).execute();
            }
          }
        });
      } catch (error) {
        this.#options.log.error({ err: error, rows: batch.length }, "analytics write failed");
      }
    }
  }

  /** The visit a view at `at` belongs to: the visitor's last, if it was under 30 minutes ago. */
  async #visitOf(db: AnalyticsDb, visitor: string, at: number) {
    let open = this.#visits.get(visitor);
    if (!open) {
      const last = await db
        .selectFrom("views")
        .select(["visit", "at"])
        .where("visitor", "=", visitor)
        .where("at", ">", at - VISIT_GAP_MS)
        .orderBy("at", "desc")
        .limit(1)
        .executeTakeFirst();
      if (last) open = { visit: last.visit, last: last.at };
    }
    const visit =
      open && at - open.last < VISIT_GAP_MS ? open.visit : randomBytes(8).toString("hex");
    this.#visits.set(visitor, { visit, last: at });
    return visit;
  }

  /** Deletes what's older than the retention setting, and forgets finished visits. */
  async prune() {
    const now = Date.now();
    for (const [visitor, open] of this.#visits)
      if (now - open.last >= VISIT_GAP_MS) this.#visits.delete(visitor);
    try {
      const retentionDays = await this.#options.retentionDays();
      const cutoff = addDays(localDay(now).day, -retentionDays);
      await this.#db.deleteFrom("views").where("day", "<", cutoff).execute();
      await this.#db.deleteFrom("events").where("day", "<", cutoff).execute();
    } catch (error) {
      this.#options.log.error({ err: error }, "analytics prune failed");
    }
  }
}
