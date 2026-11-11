/**
 * Listing pages and their entries. A listing page collects dated entries
 * (articles, notices); each entry is a page under it with its own address,
 * revisions, draft and publish, and fixed fields in its draft (publish date,
 * category, summary, cover, pinned). An entry published with a future date
 * is scheduled: it isn't on the site until then.
 */
import {
  type BlockOf,
  type BlockType,
  type CalendarRender,
  type EntryFields,
  type EntryItem,
  type EntryRender,
  type ListingRender,
  ListingSettings,
  LATEST_MAX,
  type PageDocument,
  UPCOMING_MAX,
  addMonths,
  blocksFor,
  calendarPath,
  type EntryEvent,
  listingPagePath,
  listingReservedSlug,
  newEventStart,
  collectionSettings,
  dayOf,
  defaultListingSettings,
  eventDays,
  isUpcoming,
  monthOf,
  newBlock,
  slugify,
} from "@fiscal-sb/blocks";
import type { EntrySummary, ListingDetail, PageStatus } from "@fiscal-sb/contracts";
import { sql } from "kysely";
import { parseStored } from "../db/documents.js";
import type { Db } from "../db/index.js";
import { now } from "../db/index.js";
import { HttpError } from "../errors.js";
import { mediaInfo } from "./media.js";
import { type Loads, once } from "./loads.js";
import { createPage, getPage, listPages, saveDraft } from "./pages.js";
import { breadcrumbOf, pageTitles, treeOf } from "./tree.js";

type Scope = "draft" | "published";

const notListing = () => new HttpError(404, "listing_not_found", "No listing page with that id");

export async function listingSettings(db: Db, id: string): Promise<ListingSettings> {
  const row = await db
    .selectFrom("pages")
    .select(["kind", "listing"])
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (row?.kind !== "listing") throw notListing();
  return parseListingSettings(row.listing);
}

/** A listing's settings, read once per publish when `loads` is given. */
const listingSettingsOf = (db: Db, id: string, loads?: Loads) =>
  once(loads, `listing:${id}`, () => listingSettings(db, id));

/** A listing's stored settings, or the defaults when it has none. */
export function parseListingSettings(stored: string | null): ListingSettings {
  const value: unknown = stored ? JSON.parse(stored) : undefined;
  return parseStored(ListingSettings, value, "listing settings") ?? defaultListingSettings();
}

export async function getListing(db: Db, id: string): Promise<ListingDetail> {
  const settings = await listingSettings(db, id);
  const entries = (await listPages(db)).filter((p) => p.parentId === id && p.kind === "entry");
  const counts = { draft: 0, changed: 0, published: 0, scheduled: 0 } satisfies Record<
    PageStatus,
    number
  >;
  for (const entry of entries) counts[entry.status]++;
  return { settings, counts };
}

export async function saveListing(db: Db, id: string, settings: ListingSettings) {
  await listingSettings(db, id);
  const entryBlocks = new Set<string>(blocksFor("entry"));
  const clean = {
    ...settings,
    startingBlocks: settings.startingBlocks.filter((b) => entryBlocks.has(b)),
  };
  await db
    .updateTable("pages")
    .set({ listing: JSON.stringify(clean) })
    .where("id", "=", id)
    .execute();
  return getListing(db, id);
}

/** "Make this a listing page": the page keeps its blocks and gains an entry list. */
export async function makeListing(db: Db, id: string) {
  const page = await getPage(db, id);
  if (page.kind !== "page")
    throw new HttpError(409, "already_listing", "This page is already a listing page or an entry");
  if (!page.parentId)
    throw new HttpError(400, "home_page_fixed", "The home page can't be a listing page");
  const children = await db
    .selectFrom("pages")
    .select("id")
    .where("parent_id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (children)
    throw new HttpError(
      409,
      "has_children",
      "A listing page holds entries only. Move its child pages elsewhere first.",
    );
  const allowed = new Set<string>(blocksFor("listing"));
  await db
    .updateTable("pages")
    .set({ kind: "listing", listing: JSON.stringify(collectionSettings(undefined)) })
    .where("id", "=", id)
    .execute();
  const blocks = [
    ...page.draft.ms.blocks.filter((b) => allowed.has(b.type)),
    newBlock("entryList"),
  ];
  return saveDraft(db, id, { ...page.draft, ms: { ...page.draft.ms, blocks } });
}

/** A new entry under a listing: today's date, the listing's starting blocks and address pattern. */
export async function createEntry(db: Db, listingId: string, title: string) {
  const settings = await listingSettings(db, listingId);
  const taken = new Set(
    (
      await db
        .selectFrom("pages")
        .select("slug")
        .where("parent_id", "=", listingId)
        .where("deleted_at", "is", null)
        .execute()
    ).map((r) => r.slug),
  );
  const base = slugify(title) || "entri";
  const prefix = settings.addressPattern === "year" ? `${new Date().getFullYear()}/` : "";
  let slug = prefix + base;
  // Not a sibling's address, nor one of the listing's own pages (kategori, lokasi, 2026-11).
  const free = (s: string) => !taken.has(s) && !listingReservedSlug(s);
  for (let n = 2; !free(slug); n++) slug = `${prefix}${base}-${n}`;
  const allowed = new Set<string>(blocksFor("entry"));
  const starting = settings.startingBlocks.filter((b) => allowed.has(b)) as BlockType[];
  return createPage(db, {
    title,
    slug,
    parentId: listingId,
    kind: "entry",
    blocks: (starting.length ? starting : ["prose" as const]).map((type) => newBlock(type)),
    // A listing ordered by event date holds events: a new entry starts as one, tomorrow at nine.
    entry: {
      publishAt: now(),
      ...(settings.sort === "eventStart" && { event: { start: newEventStart() } }),
    },
  });
}

/** The entries table: newest first, pinned on top, with search and filters. */
export async function listEntries(
  db: Db,
  listingId: string,
  query: {
    search?: string | undefined;
    status?: PageStatus | undefined;
    category?: string | undefined;
    page: number;
    pageSize: number;
  },
) {
  const settings = await listingSettings(db, listingId);
  const ids = (
    await db
      .selectFrom("pages")
      .select("id")
      .where("parent_id", "=", listingId)
      .where("kind", "=", "entry")
      .where("deleted_at", "is", null)
      .execute()
  ).map((r) => r.id);
  const pages = (await listPages(db)).filter((p) => ids.includes(p.id));
  const drafts = new Map(
    (
      await db
        .selectFrom("pages")
        .select(["id", "draft"])
        .where("id", "in", ids.length ? ids : [""])
        .execute()
    ).map((r) => [r.id, JSON.parse(r.draft) as PageDocument]),
  );
  const search = query.search?.toLowerCase();
  const at = Date.now();
  const items: EntrySummary[] = pages
    .flatMap((p) => {
      const entry = drafts.get(p.id)?.entry;
      return entry ? [{ ...p, entry }] : [];
    })
    .filter((e) => !search || e.title.toLowerCase().includes(search) || e.path.includes(search))
    .filter((e) => !query.status || e.status === query.status)
    .filter((e) => !query.category || e.entry.category === query.category)
    .toSorted((a, b) => entryOrder(settings, at)(a.entry, b.entry));
  const start = (query.page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), total: items.length };
}

/**
 * A listing's order: pinned first, then (for "eventStart") event order, then
 * newest first. 0 for entries dated to the same instant.
 */
const entryOrder = (settings: ListingSettings, at: number) => (a: EntryFields, b: EntryFields) =>
  Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
  (settings.sort === "eventStart" ? byEvent(a, b, at) : 0) ||
  // As times, not text: an entry dated "…+08:00" isn't later than one in UTC.
  Date.parse(b.publishAt) - Date.parse(a.publishAt);

/** An entry's event as listings and its header show it, with its location's name. */
function eventItemOf(
  event: EntryEvent | undefined,
  settings: ListingSettings,
): EntryItem["event"] | undefined {
  if (!event) return undefined;
  const place = event.location && settings.locations.find((l) => l.slug === event.location)?.name;
  return {
    start: event.start,
    ...(event.end && { end: event.end }),
    ...(event.allDay && { allDay: true }),
    ...(place && { location: place, locationSlug: event.location }),
    ...(event.venue && { venue: event.venue }),
  };
}

/**
 * Event order: coming events soonest first, then past ones latest first, then
 * entries that aren't events. 0 when it can't tell them apart.
 */
function byEvent(a: EntryFields, b: EntryFields, at: number) {
  const rank = (e: EntryFields) => (!e.event ? 2 : isUpcoming(e.event, at) ? 0 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 2) return 0;
  const diff = Date.parse(a.event!.start) - Date.parse(b.event!.start);
  return ra === 0 ? diff : -diff;
}

/** Coming events, soonest first: the upcoming events block. */
const upcomingOf = (items: EntryItem[], at: number) =>
  items
    .filter((item) => item.event && isUpcoming(item.event, at))
    .toSorted((a, b) => Date.parse(a.event!.start) - Date.parse(b.event!.start));

/**
 * A listing's entries as visitors see them: the published ones whose date
 * has come (or, for the canvas, every draft), pinned first, newest first.
 */
function entryItems(
  db: Db,
  listingId: string,
  scope: Scope,
  { category, loads }: { category?: string | undefined; loads?: Loads | undefined } = {},
): Promise<EntryItem[]> {
  return once(loads, `entries:${listingId}:${scope}:${category ?? ""}`, async () => {
    const [rows, tree, settings] = await Promise.all([
      db
        .selectFrom("pages")
        .leftJoin("revisions", "revisions.id", "pages.published_revision_id")
        .select(["pages.id", "pages.draft", "revisions.content"])
        .select(sql<number>`pages.rowid`.as("seq"))
        .where("pages.parent_id", "=", listingId)
        .where("pages.kind", "=", "entry")
        .where("pages.deleted_at", "is", null)
        .execute(),
      treeOf(db, loads),
      listingSettingsOf(db, listingId, loads),
    ]);
    const at = Date.now();
    const docs = rows.flatMap((row) => {
      const json = scope === "published" ? row.content : row.draft;
      if (!json) return [];
      const doc = JSON.parse(json) as PageDocument;
      if (!doc.entry || doc.redirect) return [];
      if (scope === "published" && Date.parse(doc.entry.publishAt) > at) return [];
      if (category && doc.entry.category !== category) return [];
      return [{ id: row.id, seq: row.seq, doc, entry: doc.entry }];
    });
    const covers = await mediaInfo(
      db,
      docs.map((d) => d.entry.cover),
    );
    const names = new Map(settings.categories.map((c) => [c.slug, c.name]));
    const order = entryOrder(settings, at);
    return docs
      .toSorted(
        // Entries dated to the same instant: the one made last first, so the order never varies.
        (a, b) => order(a.entry, b.entry) || b.seq - a.seq,
      )
      .map(({ id, doc, entry }) => {
        const cover = entry.cover && covers[entry.cover.mediaId];
        const categoryName = entry.category && names.get(entry.category);
        const event = eventItemOf(entry.event, settings);
        return {
          title: doc.ms.title,
          href: tree.path(id),
          date: entry.publishAt,
          ...(categoryName && { category: categoryName, categorySlug: entry.category }),
          ...(entry.summary && { summary: entry.summary }),
          ...(cover && { image: cover.variants.find((v) => v.width >= 480)?.url ?? cover.url }),
          ...(entry.pinned && { pinned: true }),
          ...(event && { event }),
        };
      });
  });
}

type ListingOptions = {
  page?: number;
  category?: string;
  /** An event calendar's location filter. */
  location?: string;
  /** An event calendar's month page: YYYY-MM. */
  month?: string;
  /** The time it's rendered at; now by default. */
  now?: number;
  loads?: Loads;
};

const calendarOf = (doc: PageDocument) =>
  doc.ms.blocks.find((b): b is BlockOf<"eventCalendar"> => b.type === "eventCalendar");

/** What a listing page's entry list (or event calendar) shows on page `page`, optionally of one category. */
export async function listingRender(
  db: Db,
  listingId: string,
  doc: PageDocument,
  scope: Scope,
  options: ListingOptions = {},
): Promise<ListingRender> {
  const { loads } = options;
  const [settings, tree] = await Promise.all([
    listingSettingsOf(db, listingId, loads),
    treeOf(db, loads),
  ]);
  if (calendarOf(doc)) {
    // Every page of a calendar reads the same months and events: worked out once per publish.
    const at = options.now ?? Date.now();
    const index = await once(loads, `calendar:${listingId}:${scope}`, async () =>
      calendarIndex(await entryItems(db, listingId, scope, { loads }), at),
    );
    return listingRenderOf(settings, tree.path(listingId), doc, index, { ...options, now: at });
  }
  const all = await entryItems(db, listingId, scope, { category: options.category, loads });
  return listingRenderOf(settings, tree.path(listingId), doc, all, options);
}

/**
 * The listing render from its parts, without the database: every matching
 * entry, or for an event calendar its index (or every entry, to index here).
 */
export function listingRenderOf(
  settings: ListingSettings,
  base: string,
  doc: PageDocument,
  entries: EntryItem[] | CalendarIndex,
  options: ListingOptions = {},
): ListingRender {
  const shared = {
    path: base,
    categories: settings.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      href: listingPagePath(base, 1, c.slug),
    })),
    ...(options.category && { category: options.category }),
    ...(settings.rss && { rss: `${base === "/" ? "" : base}/rss.xml` }),
  };
  if (calendarOf(doc)) {
    const at = options.now ?? Date.now();
    const index = Array.isArray(entries) ? calendarIndex(entries, at) : entries;
    return {
      ...shared,
      items: [],
      page: 1,
      pages: 1,
      calendar: calendarRenderOf(settings, base, index, { ...options, now: at }),
    };
  }
  const all = Array.isArray(entries) ? entries : [];
  const block = doc.ms.blocks.find((b): b is BlockOf<"entryList"> => b.type === "entryList");
  const perPage = Number(block?.props.perPage ?? 12);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(options.page ?? 1, pages);
  return { ...shared, items: all.slice((page - 1) * perPage, page * perPage), page, pages };
}

/** Month pages reach at most this far either side of the current month. */
const MONTHS_AROUND = 12;
/** However few events there are, the calendar can go this far back and ahead. */
const MONTHS_BACK = 1;
const MONTHS_AHEAD = 6;

/** A calendar's months and each month's events, worked out once per publish: every one of its pages reads them. */
export type CalendarIndex = { months: string[]; byMonth: Map<string, EntryItem[]> };

/**
 * The months a calendar has a page for (at least last month to six months
 * ahead, stretched to its first and last event's months, at most a year
 * either side of the current one), and the events on each, soonest first.
 */
export function calendarIndex(all: EntryItem[], at: number): CalendarIndex {
  const current = monthOf(at);
  let first = addMonths(current, -MONTHS_BACK);
  let last = addMonths(current, MONTHS_AHEAD);
  const byMonth = new Map<string, EntryItem[]>();
  const events = all
    .filter((item) => item.event)
    .toSorted((a, b) => Date.parse(a.event!.start) - Date.parse(b.event!.start));
  for (const item of events) {
    const months = new Set(eventDays(item.event!).map((day) => day.slice(0, 7)));
    for (const month of months) byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
    const [from] = months;
    const to = [...months].at(-1)!;
    if (from! < first) first = from!;
    if (to > last) last = to;
  }
  const earliest = addMonths(current, -MONTHS_AROUND);
  const latest = addMonths(current, MONTHS_AROUND);
  if (first < earliest) first = earliest;
  if (last > latest) last = latest;
  const months = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  return { months, byMonth };
}

/** What an event calendar shows on one of its addresses: a month, the current one by default. */
export function calendarRenderOf(
  settings: ListingSettings,
  base: string,
  index: CalendarIndex,
  options: Pick<ListingOptions, "category" | "location" | "month" | "now"> = {},
): CalendarRender {
  const at = options.now ?? Date.now();
  const filter = options.category
    ? ({ kind: "category", slug: options.category } as const)
    : options.location
      ? ({ kind: "location", slug: options.location } as const)
      : undefined;
  const { months } = index;
  const current = monthOf(at);
  const month = options.month && months.includes(options.month) ? options.month : current;
  const inMonth = index.byMonth.get(month) ?? [];
  const items = filter
    ? inMonth.filter((item) =>
        filter.kind === "category"
          ? item.categorySlug === filter.slug
          : item.event!.locationSlug === filter.slug,
      )
    : inMonth;
  const tally = (key: (item: EntryItem) => string | undefined) => {
    const out: Record<string, number> = {};
    for (const item of inMonth) {
      const k = key(item);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  // The current month's links go to the listing's own address (or its filter's), the rest to their month.
  const monthHref = (m: string, f: typeof filter) =>
    calendarPath(base, { month: m === current ? undefined : m, filter: f });
  const i = months.indexOf(month);
  const prev = i > 0 ? months[i - 1] : undefined;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : undefined;
  // Only months next to today show it (a day highlighted, days spilling into the grid), so the
  // others' renders don't change at midnight and the daily publish leaves them as they are.
  const nearToday = Math.abs(months.indexOf(current) - i) <= 1 && months.includes(current);
  return {
    ...(nearToday && { today: dayOf(at) }),
    month,
    ...(month !== current && { thisMonth: calendarPath(base, { filter }) }),
    ...(filter && { filter }),
    all: monthHref(month, undefined),
    categories: settings.categories.map((c) => ({
      ...c,
      href: monthHref(month, { kind: "category", slug: c.slug }),
    })),
    locations: settings.locations.map((l) => ({
      ...l,
      href: monthHref(month, { kind: "location", slug: l.slug }),
    })),
    months,
    ...(prev && { prev: { month: prev, href: monthHref(prev, filter) } }),
    ...(next && { next: { month: next, href: monthHref(next, filter) } }),
    items,
    counts: {
      all: inMonth.length,
      categories: tally((item) => item.categorySlug),
      locations: tally((item) => item.event?.locationSlug),
    },
  };
}

/**
 * The listings that blocks of `type` in `doc` name, each once, with its
 * address and entries: what Latest entries and Upcoming events show.
 */
async function namedListings(
  db: Db,
  doc: PageDocument,
  type: "latestEntries" | "upcomingEvents",
  scope: Scope,
  loads?: Loads,
) {
  const tree = await treeOf(db, loads);
  const out = new Map<string, { path: string; items: EntryItem[] }>();
  for (const block of doc.ms.blocks) {
    if (block.type !== type) continue;
    const id = block.props.listing;
    if (!id || out.has(id) || !tree.get(id)) continue;
    const kind = await once(loads, `kind:${id}`, () =>
      db.selectFrom("pages").select("kind").where("id", "=", id).executeTakeFirst(),
    );
    if (kind?.kind !== "listing") continue;
    out.set(id, { path: tree.path(id), items: await entryItems(db, id, scope, { loads }) });
  }
  return out;
}

/** The newest entries of every listing that latest-entries blocks in `doc` name. */
export async function latestRender(db: Db, doc: PageDocument, scope: Scope, loads?: Loads) {
  const listings = await namedListings(db, doc, "latestEntries", scope, loads);
  return Object.fromEntries(
    [...listings].map(([id, { path, items }]) => [id, { path, items: items.slice(0, LATEST_MAX) }]),
  );
}

/** The coming events of every listing that upcoming events blocks in `doc` name. */
export async function upcomingRender(db: Db, doc: PageDocument, scope: Scope, loads?: Loads) {
  const listings = await namedListings(db, doc, "upcomingEvents", scope, loads);
  const at = Date.now();
  return Object.fromEntries(
    [...listings].map(([id, { path, items }]) => {
      const coming = upcomingOf(items, at);
      // The soonest few, and the soonest pinned ones for blocks that show only those.
      const pinned = new Set(coming.filter((item) => item.pinned).slice(0, UPCOMING_MAX));
      return [
        id,
        {
          path,
          today: dayOf(at),
          items: coming.filter((item, i) => i < UPCOMING_MAX || pinned.has(item)),
        },
      ];
    }),
  );
}

/** An entry's article header: breadcrumb, category, date and cover. */
export async function entryRender(
  db: Db,
  pageId: string,
  doc: PageDocument,
  loads?: Loads,
): Promise<EntryRender | undefined> {
  if (!doc.entry) return undefined;
  const page = await db
    .selectFrom("pages")
    .select("parent_id")
    .where("id", "=", pageId)
    .executeTakeFirst();
  if (!page?.parent_id) return undefined;
  const parentId = page.parent_id;
  const [titles, settings, breadcrumb] = await Promise.all([
    pageTitles(db, loads),
    listingSettingsOf(db, parentId, loads).catch(() => defaultListingSettings()),
    breadcrumbOf(db, { id: pageId, parentId }, doc.ms.title, loads),
  ]);
  const cover =
    doc.entry.cover && (await mediaInfo(db, [doc.entry.cover]))[doc.entry.cover.mediaId];
  const category =
    doc.entry.category && settings.categories.find((c) => c.slug === doc.entry?.category)?.name;
  const event = eventItemOf(doc.entry.event, settings);
  return {
    date: doc.entry.publishAt,
    collection: titles.get(parentId) ?? "",
    ...(category && { category }),
    ...(event && { event }),
    ...(cover && { cover: { src: cover.url, alt: doc.entry.cover?.alt ?? cover.alt } }),
    breadcrumb: breadcrumb ?? [],
  };
}

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The listing's RSS 2.0 feed of its newest published entries. */
export async function rssFeed(
  db: Db,
  listingId: string,
  siteName: string,
  siteUrl: string | undefined,
  loads?: Loads,
) {
  const [items, tree, row] = await Promise.all([
    entryItems(db, listingId, "published", { loads }),
    treeOf(db, loads),
    db
      .selectFrom("pages")
      .leftJoin("revisions", "revisions.id", "pages.published_revision_id")
      .select(["revisions.content", "pages.draft"])
      .where("pages.id", "=", listingId)
      .executeTakeFirst(),
  ]);
  const base = (siteUrl ?? "").replace(/\/$/, "");
  const doc = JSON.parse(row?.content ?? row?.draft ?? "{}") as PageDocument;
  const title = `${doc.ms?.title ?? ""} | ${siteName}`;
  const entries = items
    .slice(0, 50)
    .map(
      (item) => `    <item>
      <title>${xml(item.title)}</title>
      <link>${xml(base + item.href)}</link>
      <guid>${xml(base + item.href)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>${item.summary ? `\n      <description>${xml(item.summary)}</description>` : ""}${item.category ? `\n      <category>${xml(item.category)}</category>` : ""}
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(title)}</title>
    <link>${xml(base + tree.path(listingId))}</link>
    <description>${xml(doc.ms?.description ?? title)}</description>
    <language>ms</language>
${entries}
  </channel>
</rss>
`;
}

/** When the daily publish runs, in Malaysia's time (HH:MM). */
export const DAILY_REFRESH = "00:05";

/**
 * Whether a live page changes with the date alone: an event calendar or
 * upcoming events block, or a listing ordered by event date (its order moves
 * as events end).
 */
export async function showsEvents(db: Db) {
  const row = await db
    .selectFrom("pages")
    .innerJoin("revisions", "revisions.id", "pages.published_revision_id")
    .select("pages.id")
    .where("pages.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        ...DATED_BLOCKS.map((type) => eb("revisions.content", "like", `%"type":"${type}"%`)),
        eb(sql`json_extract(pages.listing, '$.sort')`, "=", "eventStart"),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}

/** Blocks whose render depends on today's date. */
const DATED_BLOCKS: BlockType[] = ["eventCalendar", "upcomingEvents"];
