/**
 * The calendar sync: reads every listing's calendar sources, merges the same
 * occurrence found on several calendars, and writes the difference as event
 * entries through the same functions the admin uses. A source that can't be
 * read, or suddenly has far fewer events, keeps what it had on the site.
 */
import { createHash } from "node:crypto";
import type { EntryEvent, ListingSettings } from "@laman/blocks";
import type { Page } from "@laman/contracts";
import { type Db, now } from "../db/index.js";
import type { CalendarSourceRow } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { createEntry, listingSettings } from "../content/entries.js";
import { getPage, publishDraft, saveDraft, unpublishPage } from "../content/pages.js";
import type { FeedFetcher } from "./fetch.js";
import { type Occurrence, readCalendar } from "./ics.js";

const DAY = 86_400_000;
/** What the sync reads: a month back, six months ahead. */
const WINDOW = { back: 30 * DAY, ahead: 180 * DAY };
/** Sources read at once. */
const AT_ONCE = 4;

type Read =
  | { kind: "ok"; occurrences: Occurrence[] }
  | { kind: "failed"; error: string }
  | { kind: "held"; occurrences: Occurrence[] };

type Changes = { created: number; updated: number; removed: number };

/**
 * A read that found nothing where there were events, or under half of a
 * handful or more, is held: an unpublished calendar often answers with an
 * empty file rather than an error.
 */
export function looksLikeADrop(had: number, found: number) {
  if (had === 0) return false;
  return found === 0 || (had >= 4 && found < had / 2);
}

async function readSource(
  source: CalendarSourceRow,
  fetcher: FeedFetcher,
  window: { from: number; to: number },
): Promise<Read> {
  try {
    const occurrences = readCalendar(await fetcher(source.address), window, source.id);
    if (!source.accept_drop && looksLikeADrop(source.events, occurrences.length))
      return { kind: "held", occurrences };
    return { kind: "ok", occurrences };
  } catch (error) {
    return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs `work` over `items`, `limit` at a time, keeping their order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]!);
      }
    }),
  );
  return out;
}

/** The newer copy of an occurrence found on two calendars. */
const newer = (a: Occurrence, b: Occurrence) =>
  b.sequence > a.sequence || (b.sequence === a.sequence && b.modified > a.modified) ? b : a;

const ONLINE = /^(online|dalam-talian|maya)$/;

/** The listing's location an occurrence happens at: online, named in its place, or the source's default. */
function locationOf(
  occurrence: Occurrence,
  locations: ListingSettings["locations"],
  fallback: string | null,
) {
  if (occurrence.online) {
    const online = locations.find((l) => ONLINE.test(l.slug));
    if (online) return online.slug;
  }
  const place = occurrence.place?.toLowerCase() ?? "";
  const named = place
    ? locations.find(
        (l) =>
          !ONLINE.test(l.slug) &&
          (place.includes(l.name.toLowerCase()) || place.includes(l.slug.replace(/-/g, " "))),
      )
    : undefined;
  return named?.slug ?? fallback ?? undefined;
}

/** The entry fields and title an occurrence writes. */
function entryOf(occurrence: Occurrence, source: CalendarSourceRow, settings: ListingSettings) {
  const location = locationOf(occurrence, settings.locations, source.location);
  const venue = occurrence.place?.slice(0, 200);
  const event: EntryEvent = {
    start: occurrence.start,
    ...(occurrence.end && { end: occurrence.end }),
    ...(occurrence.allDay && { allDay: true }),
    ...(location && { location }),
    ...(venue && { venue }),
    source: {
      system: source.name.slice(0, 40),
      calendar: source.id,
      id: occurrence.key.slice(0, 400),
    },
  };
  const category =
    source.category && settings.categories.some((c) => c.slug === source.category)
      ? source.category
      : undefined;
  const title = occurrence.title.slice(0, 160);
  const hash = createHash("sha256")
    .update(JSON.stringify({ title, category, event }))
    .digest("hex");
  return { title, category, event, hash };
}

/** Writes the occurrence into the entry's draft and makes it live. */
async function writeEntry(
  db: Db,
  page: Page,
  written: { title: string; category: string | undefined; event: EntryEvent },
) {
  const { category: _, ...rest } = page.draft.entry ?? { publishAt: now() };
  await saveDraft(db, page.id, {
    ...page.draft,
    ms: { ...page.draft.ms, title: written.title },
    entry: {
      ...rest,
      ...(written.category && { category: written.category }),
      event: written.event,
    },
  });
  await publishDraft(db, page.id);
}

/** Writes one listing's merged occurrences, given how each of its sources read. */
async function syncListing(
  db: Db,
  listingId: string,
  sources: { source: CalendarSourceRow; read: Read }[],
  window: { from: number; to: number },
): Promise<Changes> {
  const changes: Changes = { created: 0, updated: 0, removed: 0 };
  const settings = await listingSettings(db, listingId);
  const byId = new Map(sources.map(({ source }) => [source.id, source]));

  // Sources whose events stay as they are this run: unread, or held back.
  const keeping = new Set<string>();
  // Occurrences from the sources that were read, merged by key in the listing's source order.
  const merged = new Map<string, { occurrence: Occurrence; sources: string[] }>();
  for (const { source, read } of sources) {
    if (read.kind !== "ok") {
      keeping.add(source.id);
      continue;
    }
    for (const occurrence of read.occurrences) {
      const found = merged.get(occurrence.key);
      if (!found) merged.set(occurrence.key, { occurrence, sources: [source.id] });
      else {
        found.occurrence = newer(found.occurrence, occurrence);
        found.sources.push(source.id);
      }
    }
  }

  const rows = await db
    .selectFrom("calendar_events")
    .innerJoin("pages", "pages.id", "calendar_events.page_id")
    .selectAll("calendar_events")
    .select("pages.deleted_at")
    .where("calendar_events.listing_id", "=", listingId)
    .execute();
  const known = new Map(rows.map((r) => [r.key, r]));
  const record = (key: string, set: { sources: string; hash: string; starts_at: string }) =>
    db
      .updateTable("calendar_events")
      .set({ ...set, live: 1 })
      .where("listing_id", "=", listingId)
      .where("key", "=", key)
      .execute();

  for (const [key, { occurrence, sources: from }] of merged) {
    const row = known.get(key);
    // An officer deleted this entry: the sync leaves it deleted.
    if (row?.deleted_at) continue;
    // The first source in the listing's order owns a shared meeting: its name and category.
    const written = entryOf(occurrence, byId.get(from[0]!)!, settings);
    const stillKept = row
      ? (JSON.parse(row.sources) as string[]).filter((id) => keeping.has(id) && !from.includes(id))
      : [];
    const set = {
      sources: JSON.stringify([...from, ...stillKept]),
      hash: written.hash,
      starts_at: occurrence.start,
    };
    if (!row) {
      const page = await createEntry(db, listingId, written.title);
      // Recorded before the content is written, so a crash can't leave an entry the sync doesn't know.
      await db
        .insertInto("calendar_events")
        .values({ listing_id: listingId, key, page_id: page.id, ...set, hash: "", live: 0 })
        .execute();
      await writeEntry(db, page, written);
      await record(key, set);
      changes.created++;
    } else if (row.hash !== written.hash || !row.live) {
      await writeEntry(db, await getPage(db, row.page_id), written);
      await record(key, set);
      changes.updated++;
    } else if (row.sources !== set.sources) await record(key, set);
  }

  for (const row of rows) {
    if (merged.has(row.key) || !row.live || row.deleted_at) continue;
    // Past the window's start: it fell out of the feed by age, not because it was removed.
    if (Date.parse(row.starts_at) < window.from) continue;
    // Some calendar that had it couldn't be read: keep it until one can say.
    if ((JSON.parse(row.sources) as string[]).some((id) => keeping.has(id))) continue;
    try {
      await unpublishPage(db, row.page_id, {});
    } catch (error) {
      if (!(error instanceof HttpError && error.code === "not_published")) throw error;
    }
    await db
      .updateTable("calendar_events")
      .set({ live: 0 })
      .where("listing_id", "=", listingId)
      .where("key", "=", row.key)
      .execute();
    changes.removed++;
  }
  return changes;
}

/** How each source's read is recorded on it. */
function statusOf(source: CalendarSourceRow, read: Read, time: string) {
  switch (read.kind) {
    case "ok":
      return {
        checked_at: time,
        synced_at: time,
        error: null,
        failures: 0,
        events: read.occurrences.length,
        held_found: null,
        accept_drop: 0,
      };
    case "held":
      return { checked_at: time, error: null, held_found: read.occurrences.length };
    case "failed":
      return { checked_at: time, error: read.error, failures: source.failures + 1 };
  }
}

/** Reads every listing's calendars and writes what changed. Publishing is the caller's. */
export async function syncCalendars(db: Db, fetcher: FeedFetcher, at = Date.now()) {
  const window = { from: at - WINDOW.back, to: at + WINDOW.ahead };
  const sources = await db
    .selectFrom("calendar_sources")
    .innerJoin("pages", "pages.id", "calendar_sources.listing_id")
    .selectAll("calendar_sources")
    .where("pages.deleted_at", "is", null)
    .where("calendar_sources.enabled", "=", 1)
    .orderBy("calendar_sources.listing_id")
    .orderBy("calendar_sources.position")
    .execute();
  // Every calendar at once, whichever listing reads it; then each listing's writes.
  const reads = await pool(sources, AT_ONCE, (s) => readSource(s, fetcher, window));
  const read = sources.map((source, i) => ({ source, read: reads[i]! }));
  const listings = Map.groupBy(read, ({ source }) => source.listing_id);
  // Listings whose sources were all removed or turned off still need their events taken off.
  const orphaned = await db
    .selectFrom("calendar_events")
    .innerJoin("pages", "pages.id", "calendar_events.listing_id")
    .select("calendar_events.listing_id")
    .distinct()
    .where("calendar_events.live", "=", 1)
    .where("pages.deleted_at", "is", null)
    .execute();
  for (const { listing_id } of orphaned)
    if (!listings.has(listing_id)) listings.set(listing_id, []);

  const changes: Changes = { created: 0, updated: 0, removed: 0 };
  for (const [listingId, list] of listings) {
    const done = await syncListing(db, listingId, list, window);
    changes.created += done.created;
    changes.updated += done.updated;
    changes.removed += done.removed;
  }

  const time = now();
  await db.transaction().execute(async (trx) => {
    for (const { source, read: result } of read)
      await trx
        .updateTable("calendar_sources")
        .set(statusOf(source, result, time))
        .where("id", "=", source.id)
        .execute();
  });
  const count = (kind: Read["kind"]) => read.filter((r) => r.read.kind === kind).length;
  return { sources: read.length, failed: count("failed"), held: count("held"), ...changes };
}
