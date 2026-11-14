/**
 * What the admin reads: totals, a series and top lists over a range of local
 * days, for the site or one page. Read straight from the raw tables, which
 * the indexes on day keep quick at government-site volumes.
 */
import type {
  AnalyticsInterval,
  AnalyticsQuery,
  AnalyticsSummary,
  AnalyticsTotals,
  Breakdown,
  BreakdownList,
} from "@laman/contracts";
import { type RawBuilder, sql } from "kysely";
import type { Db } from "../db/index.js";
import { HttpError } from "../errors.js";
import { treeOf } from "../content/tree.js";
import { type AnalyticsDb, addDays, localDay, startOfDay } from "./db.js";

const DAY_MS = 86_400_000;

const daysBetween = (from: string, to: string) =>
  Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS) + 1;

function checkRange({ from, to }: { from: string; to: string }) {
  if (to < from) throw new HttpError(400, "bad_range", "The end of the range is before its start");
  if (daysBetween(from, to) > 1100)
    throw new HttpError(400, "bad_range", "Choose a range of at most three years");
}

/** `where` for views (or events) in the range, for one page if asked. */
const scope = (q: { from: string; to: string; pageId?: string | undefined }) =>
  sql`day between ${q.from} and ${q.to}${q.pageId ? sql` and page_id = ${q.pageId}` : sql``}`;

async function totals(db: AnalyticsDb, q: AnalyticsQuery): Promise<AnalyticsTotals> {
  const where = scope(q);
  const base = await sql<{ views: number; visitors: number; visits: number; visible: number }>`
    select count(*) as views,
      count(distinct day || visitor) as visitors,
      count(distinct visit) as visits,
      coalesce(avg(visible), 0) as visible
    from views where ${where}`.execute(db);
  const { views, visitors, visits, visible } = base.rows[0] ?? {
    views: 0,
    visitors: 0,
    visits: 0,
    visible: 0,
  };
  // Visits in the range, with how many views each had and whether they saw the page.
  const inRange = scope({ from: q.from, to: q.to });
  const perVisit = await sql<{ visits: number; bounced: number; length: number }>`
    select count(*) as visits,
      coalesce(sum(n = 1), 0) as bounced,
      coalesce(avg(length), 0) as length
    from (
      select count(*) as n, sum(visible) as length
        ${q.pageId ? sql`, sum(page_id = ${q.pageId}) as hit` : sql``}
      from views where ${inRange} group by visit
    ) ${q.pageId ? sql`where hit > 0` : sql``}`.execute(db);
  const v = perVisit.rows[0] ?? { visits: 0, bounced: 0, length: 0 };
  return {
    views: Number(views),
    visitors: Number(visitors),
    visits: Number(visits),
    bounceRate: v.visits ? Number(v.bounced) / Number(v.visits) : 0,
    duration: Math.round(Number(q.pageId ? visible : v.length)),
  };
}

const intervalOf = (from: string, to: string): AnalyticsInterval => {
  const days = daysBetween(from, to);
  return days === 1 ? "hour" : days <= 92 ? "day" : "month";
};

/** Every bucket from `from` to `to`, so the chart has no gaps. */
function buckets(from: string, to: string, interval: AnalyticsInterval) {
  if (interval === "hour")
    return Array.from({ length: 24 }, (_, h) => `${from}T${String(h).padStart(2, "0")}`);
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = interval === "day" ? day : day.slice(0, 7);
    if (out.at(-1) !== key) out.push(key);
  }
  return out;
}

/** The bucket an instant falls in: "2026-11-02T14", "2026-11-02" or "2026-11". */
function bucketOf(at: number, interval: AnalyticsInterval) {
  const { day, hour } = localDay(at);
  if (interval === "hour") return `${day}T${String(hour).padStart(2, "0")}`;
  return interval === "day" ? day : day.slice(0, 7);
}

async function series(db: AnalyticsDb, q: AnalyticsQuery, interval: AnalyticsInterval) {
  const key: RawBuilder<string> =
    interval === "hour"
      ? sql`day || 'T' || printf('%02d', hour)`
      : interval === "day"
        ? sql`day`
        : sql`substr(day, 1, 7)`;
  // Not "at": that's a column, and group by would take it over the alias.
  const { rows } = await sql<{ bucket: string; views: number; visitors: number }>`
    select ${key} as bucket, count(*) as views, count(distinct day || visitor) as visitors
    from views where ${scope(q)} group by bucket`.execute(db);
  return new Map(rows.map((r) => [r.bucket, r]));
}

/** Publishes that finished in the range, by bucket: ticks on the chart. */
async function publishes(site: Db, q: AnalyticsQuery, interval: AnalyticsInterval) {
  const rows = await site
    .selectFrom("jobs")
    .select(["payload", "finished_at"])
    .where("kind", "=", "publish")
    .where("status", "=", "done")
    .where("finished_at", ">=", new Date(startOfDay(q.from)).toISOString())
    .where("finished_at", "<", new Date(startOfDay(addDays(q.to, 1))).toISOString())
    .execute();
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.finished_at) continue;
    // A page's stats show only the publishes that made it live.
    const payload = JSON.parse(row.payload) as { pageId?: string; swaps?: { pageId: string }[] };
    if (
      q.pageId &&
      payload.pageId !== q.pageId &&
      !payload.swaps?.some((s) => s.pageId === q.pageId)
    )
      continue;
    const key = bucketOf(Date.parse(row.finished_at), interval);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export async function summary(
  db: AnalyticsDb,
  site: Db,
  q: AnalyticsQuery,
): Promise<AnalyticsSummary> {
  checkRange(q);
  const days = daysBetween(q.from, q.to);
  const before = { ...q, from: addDays(q.from, -days), to: addDays(q.from, -1) };
  const interval = intervalOf(q.from, q.to);
  const [current, previous, points, marks] = await Promise.all([
    totals(db, q),
    totals(db, before),
    series(db, q, interval),
    publishes(site, q, interval),
  ]);
  return {
    current,
    previous,
    before: { from: before.from, to: before.to },
    interval,
    series: buckets(q.from, q.to, interval).map((at) => ({
      at,
      views: Number(points.get(at)?.views ?? 0),
      visitors: Number(points.get(at)?.visitors ?? 0),
      publishes: marks.get(at) ?? 0,
    })),
  };
}

/** Groups that only count when they're known: a visit with no referrer is direct, not a referrer. */
const knownOnly = new Set<Breakdown>(["referrer", "utm_source", "utm_medium", "utm_campaign"]);

type Row = {
  value: string;
  page_id: string | null;
  count: number;
  visitors: number;
  /** Every row's count summed, before the limit: the whole for shares. */
  total: number;
};

export async function breakdown(
  db: AnalyticsDb,
  site: Db,
  q: AnalyticsQuery & { by: Breakdown; limit: number },
): Promise<BreakdownList> {
  checkRange(q);
  const where = scope(q);
  const byPage = q.by === "page" || q.by === "entry" || q.by === "exit";
  let rows: Row[];
  if (q.by === "download" || q.by === "outbound") {
    const kind = q.by;
    ({ rows } = await sql<Row>`
      select target as value, null as page_id, count(*) as count,
        count(distinct day || visitor) as visitors, sum(count(*)) over () as total
      from events where kind = ${kind} and ${where}
      group by target order by count desc, value limit ${q.limit}`.execute(db));
  } else {
    // Entry and exit: the first or last view of each visit that began or ended in the range.
    const source =
      q.by === "entry" || q.by === "exit"
        ? sql`(select * from (
            select *, row_number() over (
              partition by visit order by at ${q.by === "entry" ? sql`asc` : sql`desc`}
            ) as nth
            from views where ${scope({ from: q.from, to: q.to })}
          ) where nth = 1 ${q.pageId ? sql`and page_id = ${q.pageId}` : sql``})`
        : sql`(select * from views where ${where})`;
    if (byPage) {
      // By page id where there is one, so a renamed page stays one row.
      ({ rows } = await sql<Row>`
        select max(path) as value, page_id, count(*) as count,
          count(distinct day || visitor) as visitors, sum(count(*)) over () as total
        from ${source} as v
        group by coalesce(page_id, path) order by count desc, value limit ${q.limit}`.execute(db));
    } else {
      const column = sql.ref(q.by);
      ({ rows } = await sql<Row>`
        select coalesce(${column}, '') as value, null as page_id, count(*) as count,
          count(distinct day || visitor) as visitors, sum(count(*)) over () as total
        from ${source} as v
        ${knownOnly.has(q.by) ? sql`where ${column} is not null` : sql``}
        group by value order by count desc, value limit ${q.limit}`.execute(db));
    }
  }
  // Pages show where they are now.
  const tree = rows.some((r) => r.page_id) ? await treeOf(site) : undefined;
  return {
    rows: rows.map((r) => {
      const node = r.page_id ? tree?.get(r.page_id) : undefined;
      return {
        value: node && tree ? tree.path(node.id) : r.value,
        ...(byPage && { pageId: node ? node.id : null }),
        count: Number(r.count),
        visitors: Number(r.visitors),
      };
    }),
    total: Number(rows[0]?.total ?? 0),
  };
}

/** The oldest day held, or null before the first view. */
export async function since(db: AnalyticsDb) {
  const row = await db
    .selectFrom("views")
    .select((eb) => eb.fn.min("day").as("since"))
    .executeTakeFirst();
  return (row?.since as string | null | undefined) ?? null;
}
