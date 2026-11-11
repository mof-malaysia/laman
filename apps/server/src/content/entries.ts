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
  for (let n = 2; taken.has(slug); n++) slug = `${prefix}${base}-${n}`;
  const allowed = new Set<string>(blocksFor("entry"));
  const starting = settings.startingBlocks.filter((b) => allowed.has(b)) as BlockType[];
  return createPage(db, {
    title,
    slug,
    parentId: listingId,
    kind: "entry",
    blocks: (starting.length ? starting : ["prose" as const]).map((type) => newBlock(type)),
    entry: { publishAt: now() },
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
    .toSorted(
      (a, b) =>
        Number(Boolean(b.entry.pinned)) - Number(Boolean(a.entry.pinned)) ||
        (settings.sort === "eventStart" ? byEvent(a.entry, b.entry, at) : 0) ||
        Date.parse(b.entry.publishAt) - Date.parse(a.entry.publishAt),
    );
  const start = (query.page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), total: items.length };
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

/** Coming events, soonest first: the agenda and upcoming events blocks. */
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
    const places = new Map(settings.locations.map((l) => [l.slug, l.name]));
    return docs
      .toSorted(
        (a, b) =>
          Number(Boolean(b.entry.pinned)) - Number(Boolean(a.entry.pinned)) ||
          (settings.sort === "eventStart" ? byEvent(a.entry, b.entry, at) : 0) ||
          // As times, not text: an entry dated "…+08:00" isn't later than one in UTC.
          Date.parse(b.entry.publishAt) - Date.parse(a.entry.publishAt) ||
          // Entries dated to the same instant: the one made last first, so the order never varies.
          b.seq - a.seq,
      )
      .map(({ id, doc, entry }) => {
        const cover = entry.cover && covers[entry.cover.mediaId];
        const categoryName = entry.category && names.get(entry.category);
        const event = entry.event;
        const place = event?.location && places.get(event.location);
        return {
          title: doc.ms.title,
          href: tree.path(id),
          date: entry.publishAt,
          ...(categoryName && { category: categoryName, categorySlug: entry.category }),
          ...(entry.summary && { summary: entry.summary }),
          ...(cover && { image: cover.variants.find((v) => v.width >= 480)?.url ?? cover.url }),
          ...(entry.pinned && { pinned: true }),
          ...(event && {
            event: {
              start: event.start,
              ...(event.end && { end: event.end }),
              ...(event.allDay && { allDay: true }),
              ...(place && { location: place, locationSlug: event.location }),
              ...(event.venue && { venue: event.venue }),
            },
          }),
        };
      });
  });
}

/** The address of page `n` of a listing (or of one of its categories). */
export function listingPagePath(base: string, page: number, category?: string) {
  const root = category ? `${base === "/" ? "" : base}/kategori/${category}` : base;
  return page > 1 ? `${root === "/" ? "" : root}/halaman/${page}` : root;
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
  // A calendar reads every event, so its months are the same under every filter.
  const all = calendarOf(doc)
    ? await entryItems(db, listingId, scope, { loads })
    : await entryItems(db, listingId, scope, { category: options.category, loads });
  return listingRenderOf(settings, tree.path(listingId), doc, all, options);
}

/**
 * The listing render from its parts, without the database: `all` is every
 * matching entry (with an event calendar, every entry, unfiltered).
 */
export function listingRenderOf(
  settings: ListingSettings,
  base: string,
  doc: PageDocument,
  all: EntryItem[],
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
  const calendar = calendarOf(doc);
  if (calendar)
    return {
      ...shared,
      items: [],
      page: 1,
      pages: 1,
      calendar: calendarRenderOf(settings, base, calendar, all, options),
    };
  const block = doc.ms.blocks.find((b): b is BlockOf<"entryList"> => b.type === "entryList");
  const perPage = Number(block?.props.perPage ?? 12);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(options.page ?? 1, pages);
  return { ...shared, items: all.slice((page - 1) * perPage, page * perPage), page, pages };
}

/** Month pages reach at most this far either side of the current month. */
const MONTHS_AROUND = 12;

/**
 * The months a calendar has a page for: from its first event's month to its
 * last, always with the current one, at most a year either side of it.
 */
export function calendarMonths(all: EntryItem[], at: number): string[] {
  const current = monthOf(at);
  const earliest = addMonths(current, -MONTHS_AROUND);
  const latest = addMonths(current, MONTHS_AROUND);
  let first = current;
  let last = current;
  for (const item of all) {
    if (!item.event) continue;
    const days = eventDays(item.event);
    const from = days[0]!.slice(0, 7);
    const to = days.at(-1)!.slice(0, 7);
    if (from < first) first = from;
    if (to > last) last = to;
  }
  if (first < earliest) first = earliest;
  if (last > latest) last = latest;
  const months = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** What an event calendar shows on one of its addresses. */
export function calendarRenderOf(
  settings: ListingSettings,
  base: string,
  block: BlockOf<"eventCalendar">,
  all: EntryItem[],
  options: Pick<ListingOptions, "category" | "location" | "month" | "now"> = {},
): CalendarRender {
  const at = options.now ?? Date.now();
  const filter = options.category
    ? ({ kind: "category", slug: options.category } as const)
    : options.location
      ? ({ kind: "location", slug: options.location } as const)
      : undefined;
  const months = block.props.monthView ? calendarMonths(all, at) : [];
  const month = options.month && months.includes(options.month) ? options.month : undefined;
  const shown = all.filter(
    (item) =>
      item.event &&
      (!filter ||
        (filter.kind === "category"
          ? item.categorySlug === filter.slug
          : item.event.locationSlug === filter.slug)),
  );
  const items = month
    ? shown
        .filter((item) => eventDays(item.event!).some((day) => day.startsWith(month)))
        .toSorted((a, b) => Date.parse(a.event!.start) - Date.parse(b.event!.start))
    : upcomingOf(shown, at);
  const hrefFor = (f: typeof filter) => calendarPath(base, { month, filter: f });
  const index = month ? months.indexOf(month) : -1;
  const prev = index > 0 ? months[index - 1] : undefined;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : undefined;
  return {
    view: month ? "month" : "agenda",
    today: dayOf(at),
    ...(month && { month }),
    ...(filter && { filter }),
    all: hrefFor(undefined),
    categories: settings.categories.map((c) => ({
      ...c,
      href: hrefFor({ kind: "category", slug: c.slug }),
    })),
    locations: settings.locations.map((l) => ({
      ...l,
      href: hrefFor({ kind: "location", slug: l.slug }),
    })),
    agendaHref: calendarPath(base, { filter }),
    ...(months.length && {
      monthHref: calendarPath(base, {
        month: months.includes(monthOf(at)) ? monthOf(at) : months[0],
        filter,
      }),
    }),
    months,
    ...(prev && { prev: { month: prev, href: calendarPath(base, { month: prev, filter }) } }),
    ...(next && { next: { month: next, href: calendarPath(base, { month: next, filter }) } }),
    items,
  };
}

/** The newest entries of every listing that latest-entries blocks in `doc` name. */
export async function latestRender(db: Db, doc: PageDocument, scope: Scope, loads?: Loads) {
  const out: Record<string, { path: string; items: EntryItem[] }> = {};
  const tree = await treeOf(db, loads);
  const blocks = doc.ms.blocks.filter(
    (b): b is BlockOf<"latestEntries"> => b.type === "latestEntries",
  );
  for (const block of blocks) {
    const id = block.props.listing;
    if (!id) continue;
    if (out[id] || !tree.get(id)) continue;
    const kind = await once(loads, `kind:${id}`, () =>
      db.selectFrom("pages").select("kind").where("id", "=", id).executeTakeFirst(),
    );
    if (kind?.kind !== "listing") continue;
    out[id] = {
      path: tree.path(id),
      items: (await entryItems(db, id, scope, { loads })).slice(0, LATEST_MAX),
    };
  }
  return out;
}

/** The coming events of every listing that upcoming events blocks in `doc` name. */
export async function upcomingRender(db: Db, doc: PageDocument, scope: Scope, loads?: Loads) {
  const out: Record<string, { path: string; today: string; items: EntryItem[] }> = {};
  const tree = await treeOf(db, loads);
  const blocks = doc.ms.blocks.filter(
    (b): b is BlockOf<"upcomingEvents"> => b.type === "upcomingEvents",
  );
  const at = Date.now();
  for (const block of blocks) {
    const id = block.props.listing;
    if (!id || out[id] || !tree.get(id)) continue;
    const kind = await once(loads, `kind:${id}`, () =>
      db.selectFrom("pages").select("kind").where("id", "=", id).executeTakeFirst(),
    );
    if (kind?.kind !== "listing") continue;
    const coming = upcomingOf(await entryItems(db, id, scope, { loads }), at);
    // The soonest few, and the soonest pinned ones for blocks that show only those.
    const pinned = new Set(coming.filter((item) => item.pinned).slice(0, UPCOMING_MAX));
    out[id] = {
      path: tree.path(id),
      today: dayOf(at),
      items: coming.filter((item, i) => i < UPCOMING_MAX || pinned.has(item)),
    };
  }
  return out;
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
  const event = doc.entry.event;
  const place = event?.location && settings.locations.find((l) => l.slug === event.location)?.name;
  return {
    date: doc.entry.publishAt,
    collection: titles.get(parentId) ?? "",
    ...(category && { category }),
    ...(event && {
      event: {
        start: event.start,
        ...(event.end && { end: event.end }),
        ...(event.allDay && { allDay: true }),
        ...(place && { location: place, locationSlug: event.location }),
        ...(event.venue && { venue: event.venue }),
      },
    }),
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

/** Whether a live page shows events by date: an event calendar or upcoming events. */
export async function showsEvents(db: Db) {
  const row = await db
    .selectFrom("pages")
    .innerJoin("revisions", "revisions.id", "pages.published_revision_id")
    .select("pages.id")
    .where("pages.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("revisions.content", "like", '%"type":"eventCalendar"%'),
        eb("revisions.content", "like", '%"type":"upcomingEvents"%'),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}
