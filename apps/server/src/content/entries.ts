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
  type EntryItem,
  type EntryRender,
  type ListingRender,
  ListingSettings,
  type PageDocument,
  blocksFor,
  collectionSettings,
  defaultListingSettings,
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
  await listingSettings(db, listingId);
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
        Date.parse(b.entry.publishAt) - Date.parse(a.entry.publishAt),
    );
  const start = (query.page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), total: items.length };
}

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
    return docs
      .toSorted(
        (a, b) =>
          Number(Boolean(b.entry.pinned)) - Number(Boolean(a.entry.pinned)) ||
          // As times, not text: an entry dated "…+08:00" isn't later than one in UTC.
          Date.parse(b.entry.publishAt) - Date.parse(a.entry.publishAt) ||
          // Entries dated to the same instant: the one made last first, so the order never varies.
          b.seq - a.seq,
      )
      .map(({ id, doc, entry }) => {
        const cover = entry.cover && covers[entry.cover.mediaId];
        const categoryName = entry.category && names.get(entry.category);
        return {
          title: doc.ms.title,
          href: tree.path(id),
          date: entry.publishAt,
          ...(categoryName && { category: categoryName, categorySlug: entry.category }),
          ...(entry.summary && { summary: entry.summary }),
          ...(cover && { image: cover.variants.find((v) => v.width >= 480)?.url ?? cover.url }),
          ...(entry.pinned && { pinned: true }),
        };
      });
  });
}

/** The address of page `n` of a listing (or of one of its categories). */
export function listingPagePath(base: string, page: number, category?: string) {
  const root = category ? `${base === "/" ? "" : base}/kategori/${category}` : base;
  return page > 1 ? `${root === "/" ? "" : root}/halaman/${page}` : root;
}

type ListingOptions = { page?: number; category?: string; loads?: Loads };

/** What a listing page's entry list shows on page `page`, optionally of one category. */
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
  const all = await entryItems(db, listingId, scope, { category: options.category, loads });
  return listingRenderOf(settings, tree.path(listingId), doc, all, options);
}

/** The listing render from its parts, without the database: `all` is every matching entry. */
export function listingRenderOf(
  settings: ListingSettings,
  base: string,
  doc: PageDocument,
  all: EntryItem[],
  options: ListingOptions = {},
): ListingRender {
  const block = doc.ms.blocks.find((b): b is BlockOf<"entryList"> => b.type === "entryList");
  const perPage = Number(block?.props.perPage ?? 12);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(options.page ?? 1, pages);
  return {
    path: base,
    categories: settings.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      href: listingPagePath(base, 1, c.slug),
    })),
    ...(options.category && { category: options.category }),
    items: all.slice((page - 1) * perPage, page * perPage),
    page,
    pages,
    ...(settings.rss && { rss: `${base === "/" ? "" : base}/rss.xml` }),
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
      items: (await entryItems(db, id, scope, { loads })).slice(0, 24),
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
  return {
    date: doc.entry.publishAt,
    collection: titles.get(parentId) ?? "",
    ...(category && { category }),
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
