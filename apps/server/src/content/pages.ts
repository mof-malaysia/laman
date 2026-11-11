/**
 * Pages: a tree of pages, a draft per page, and published revisions that
 * freeze a draft. The draft is always valid against the block registry; the
 * API checks it first. Moving, unpublishing and deleting change the site at
 * the next publish, like content does.
 */
import { randomUUID } from "node:crypto";
import {
  type Block,
  type EntryFields,
  PageDocument,
  linksOf,
  withDefaults,
  type PageRedirect,
  type TemplateId,
  collectionSettings,
  kindIssues,
  slugify,
  templateById,
  templateKind,
} from "@fiscal-sb/blocks";
import type {
  DeletePreview,
  DraftConflict,
  MoveResult,
  Page,
  PageRef,
  PageStatus,
  PageSummary,
  PathChange,
  PublishSwap,
} from "@fiscal-sb/contracts";
import { type Db, now, utc } from "../db/index.js";
import { type Selectable, sql } from "kysely";
import type { PagesTable } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { recordDraft } from "./history.js";
import { readDoc } from "./site.js";
import { conflictError, conflictWith, versionOf } from "./versions.js";
import { syncPageUsage } from "./media.js";
import { addRedirect } from "./redirects.js";
import { type Tree, loadTree } from "./tree.js";
import { actingAgent, actingUser } from "../auth/acting.js";

type Row = Selectable<PagesTable> & {
  published_content: string | null;
  published_at: string | null;
  edited_by: string | null;
};

const columns = [
  "pages.id",
  "pages.parent_id",
  "pages.slug",
  "pages.position",
  "pages.draft",
  "pages.published_revision_id",
  "pages.created_at",
  "pages.updated_at",
  "pages.deleted_at",
  "pages.template",
  "pages.kind",
  "pages.listing",
  "pages.publish_at",
  "pages.updated_by",
  "revisions.content as published_content",
  "revisions.created_at as published_at",
  "editor.display_name as edited_by",
] as const;

const select = (db: Db) =>
  db
    .selectFrom("pages")
    .leftJoin("revisions", "revisions.id", "pages.published_revision_id")
    .leftJoin("users as editor", "editor.id", "pages.updated_by")
    .select(columns)
    .where("pages.deleted_at", "is", null);

const notFound = () => new HttpError(404, "page_not_found", "No page with that id");
const homeFixed = (what: string) =>
  new HttpError(400, "home_page_fixed", `The home page can't be ${what}`);

/** An entry's published revision with a date still to come is scheduled, not live. */
function scheduled(content: string | null) {
  if (!content) return false;
  const publishAt = (JSON.parse(content) as PageDocument).entry?.publishAt;
  return publishAt !== undefined && Date.parse(publishAt) > Date.now();
}

function statusOf(row: Row): PageStatus {
  if (!row.published_revision_id) return "draft";
  if (row.kind === "entry" && scheduled(row.published_content)) return "scheduled";
  return row.published_content === row.draft ? "published" : "changed";
}

/** A page with its draft; only `getPage` adds the draft's version, which lists don't need. */
function toPage(row: Row, tree: Tree, entryCount?: number): Omit<Page, "draftVersion"> {
  const draft = JSON.parse(row.draft) as PageDocument;
  return {
    id: row.id,
    parentId: row.parent_id,
    position: row.position,
    slug: row.slug,
    path: tree.path(row.id),
    title: draft.ms.title,
    status: statusOf(row),
    kind: row.kind,
    ...(row.kind === "listing" && { entryCount: entryCount ?? 0 }),
    template: row.template,
    redirect: draft.redirect ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    hasUnpublishedChanges: row.published_content !== row.draft,
    editedBy: row.edited_by,
    draft,
  };
}

export function toSummary(page: Omit<Page, "draftVersion">): PageSummary {
  const { draft, ...summary } = page;
  void draft;
  return summary;
}

/** `rows` depth first from the home page, siblings in order, as the tree has them. */
function inTreeOrder<T extends { id: string }>(rows: T[], tree: Tree): T[] {
  const order = new Map(tree.all().map((node, i) => [node.id, i]));
  return rows.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Every live page, depth first from the home page, siblings in order. */
export async function listPages(db: Db): Promise<PageSummary[]> {
  const [rows, tree] = await Promise.all([select(db).execute(), loadTree(db)]);
  const entries = new Map<string, number>();
  for (const row of rows)
    if (row.kind === "entry" && row.parent_id)
      entries.set(row.parent_id, (entries.get(row.parent_id) ?? 0) + 1);
  return inTreeOrder(rows, tree).map((row) => toSummary(toPage(row, tree, entries.get(row.id))));
}

/**
 * Entries in every listing whose title or slug contains `search`, newest
 * first. Matched in SQL, so a search reads only the entries it returns.
 */
export async function searchEntries(db: Db, search: string, limit: number): Promise<PageSummary[]> {
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const [rows, tree] = await Promise.all([
    select(db)
      .where("pages.kind", "=", "entry")
      .where((eb) =>
        eb.or([
          sql<boolean>`json_extract(pages.draft, '$.ms.title') like ${pattern} escape '\\'`,
          sql<boolean>`pages.slug like ${pattern} escape '\\'`,
        ]),
      )
      .orderBy("pages.publish_at", "desc")
      .limit(limit)
      .execute(),
    loadTree(db),
  ]);
  return rows.map((row) => toSummary(toPage(row, tree)));
}

export async function getPage(db: Db, id: string): Promise<Page> {
  const [row, tree] = await Promise.all([
    select(db).where("pages.id", "=", id).executeTakeFirst(),
    loadTree(db),
  ]);
  if (!row) throw notFound();
  const count =
    row.kind === "listing"
      ? await db
          .selectFrom("pages")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("parent_id", "=", id)
          .where("kind", "=", "entry")
          .where("deleted_at", "is", null)
          .executeTakeFirst()
      : undefined;
  const page = toPage(row, tree, Number(count?.n ?? 0));
  return {
    ...page,
    draft: withDefaults(PageDocument, page.draft),
    draftVersion: versionOf(row.draft),
  };
}

const slugTaken = () =>
  new HttpError(409, "slug_taken", "Another page in the same place already uses that address");

/** Refuses a slug a sibling (other than `selfId`) has, or one the published site keeps for itself. */
function assertSlugFree(tree: Tree, parentId: string | null, slug: string, selfId?: string) {
  if (tree.children(parentId).some((s) => s.id !== selfId && s.slug === slug)) throw slugTaken();
  if (tree.reserved(parentId, slug))
    throw new HttpError(
      409,
      "slug_reserved",
      `The site uses /${slug} for its search, so choose another address`,
    );
}

/** Positions 0…n for `ids`, in that order. */
async function setPositions(db: Db, ids: string[]) {
  for (const [position, id] of ids.entries())
    await db.updateTable("pages").set({ position }).where("id", "=", id).execute();
}

export async function createPage(
  db: Db,
  input: {
    title: string;
    slug: string;
    parentId?: string | null;
    template?: TemplateId;
    blocks?: Block[];
    /** Entries are made by createEntry. */
    kind?: "page" | "listing" | "entry";
    entry?: EntryFields;
  },
): Promise<Page> {
  const tree = await loadTree(db);
  // Only the seed makes a root page, and only when there is no home page yet.
  const parentId = input.parentId === undefined ? tree.home?.id : input.parentId;
  if (parentId === undefined || (parentId === null && tree.home))
    throw new HttpError(400, "parent_required", "Choose where the page goes");
  if (parentId !== null && !tree.get(parentId))
    throw new HttpError(404, "parent_not_found", "No page with that parent id");
  const templateId = input.template ?? "blank";
  const template = templateById(templateId);
  const kind = input.kind ?? templateKind(templateId);
  if (parentId && kind !== "entry" && (await kindOf(db, parentId)) === "listing")
    throw new HttpError(400, "listing_parent", "A listing page holds entries, not other pages");
  const siblings = tree.children(parentId);
  assertSlugFree(tree, parentId, input.slug);
  const listing = kind === "listing" ? collectionSettings(templateId) : null;

  const draft: PageDocument = {
    ms: {
      title: input.title,
      blocks: input.blocks ?? template.blocks(input.title),
    },
    ...(input.entry && { entry: input.entry }),
  };
  const id = randomUUID();
  const time = now();
  await db
    .insertInto("pages")
    .values({
      id,
      parent_id: parentId,
      slug: input.slug,
      position: Math.max(-1, ...siblings.map((s) => s.position)) + 1,
      draft: JSON.stringify(draft),
      published_revision_id: null,
      created_at: time,
      updated_at: time,
      updated_by: actingUser(),
      deleted_at: null,
      template: input.template ?? null,
      kind,
      listing: listing && JSON.stringify(listing),
      publish_at: input.entry ? utc(input.entry.publishAt) : null,
    })
    .execute();
  await syncPageUsage(db, id);
  return getPage(db, id);
}

/**
 * A redirect may not loop or chain: not to the page itself, not to a page
 * that redirects, and not from a page that other pages redirect to.
 */
async function checkRedirect(db: Db, id: string, redirect: PageRedirect | null | undefined) {
  if (!redirect) return;
  const tree = await loadTree(db);
  const node = tree.get(id);
  if (!node) throw notFound();
  if (!node.parent_id) throw homeFixed("redirected");
  const drafts = await db
    .selectFrom("pages")
    .select(["id", "draft"])
    .where("deleted_at", "is", null)
    .execute();
  const docs = new Map(drafts.map((d) => [d.id, JSON.parse(d.draft) as PageDocument]));
  if (redirect.to === "page") {
    if (redirect.pageId === id)
      throw new HttpError(400, "redirect_loop", "A page can't redirect to itself");
    const target = docs.get(redirect.pageId);
    if (!target)
      throw new HttpError(400, "redirect_target_not_found", "The page to redirect to is missing");
    if (target.redirect?.to === "page" && target.redirect.pageId === id)
      throw new HttpError(
        400,
        "redirect_loop",
        `${target.ms.title} redirects here, so this page can't redirect to it`,
      );
    if (target.redirect)
      throw new HttpError(
        400,
        "redirect_chain",
        `${target.ms.title} redirects somewhere else. Redirect to where it goes instead.`,
      );
  }
  const into = [...docs].find(
    ([, doc]) => doc.redirect?.to === "page" && doc.redirect.pageId === id,
  );
  if (into)
    throw new HttpError(
      400,
      "redirect_chain",
      `${into[1].ms.title} redirects to this page, so it can't redirect too. Change that redirect first.`,
    );
}

/** The blocks a page's kind allows, and an entry's fixed fields. */
async function checkKind(db: Db, id: string, draft: PageDocument) {
  const kind = await kindOf(db, id);
  if (!kind) throw notFound();
  const issues = kindIssues(kind, draft.ms.blocks);
  if (kind === "entry" && !draft.entry) issues.push("An entry needs its publish date");
  if (issues.length)
    throw new HttpError(
      400,
      "blocks_not_allowed",
      issues.join(". "),
      issues.map((message) => ({ path: "draft.ms.blocks", message })),
    );
  return kind;
}

async function kindOf(db: Db, id: string) {
  const row = await db.selectFrom("pages").select("kind").where("id", "=", id).executeTakeFirst();
  return row?.kind;
}

/**
 * Saves the draft. With `base` (the `draftVersion` the edit started from), a
 * draft someone else saved since is never overwritten: the save is refused
 * with 409 `draft_conflict`, and the refused copy is kept in the history.
 */
export async function saveDraft(
  db: Db,
  id: string,
  draft: PageDocument,
  base?: string,
): Promise<Page> {
  await checkRedirect(db, id, draft.redirect);
  const kind = await checkKind(db, id, draft);
  const json = JSON.stringify(draft);
  // Read, checked and written in one transaction, so two saves can't both pass the check.
  const result: { conflict: DraftConflict } | { replaced: string } = await db
    .transaction()
    .execute(async (trx) => {
      const current = await trx
        .selectFrom("pages")
        .leftJoin("users as editor", "editor.id", "pages.updated_by")
        .select(["pages.draft", "pages.updated_at", "editor.display_name"])
        .where("pages.id", "=", id)
        .where("pages.deleted_at", "is", null)
        .executeTakeFirst();
      if (!current) throw notFound();
      const conflict = conflictWith(base, current.draft, {
        by: current.display_name,
        at: current.updated_at,
      });
      if (conflict) return { conflict };
      await trx
        .updateTable("pages")
        .set({
          draft: json,
          updated_at: now(),
          updated_by: actingUser(),
          ...(kind === "entry" && { publish_at: draft.entry ? utc(draft.entry.publishAt) : null }),
        })
        .where("id", "=", id)
        .execute();
      return { replaced: current.draft };
    });
  if ("conflict" in result) {
    await recordDraft(db, id, json, null);
    throw conflictError(result.conflict);
  }
  const { replaced } = result;
  await syncPageUsage(db, id);
  await recordDraft(db, id, json, replaced);
  return getPage(db, id);
}

/** Freezes the current draft as the page's published revision. */
export async function publishDraft(db: Db, id: string): Promise<PublishSwap> {
  return db.transaction().execute(async (trx) => {
    const page = await trx
      .selectFrom("pages")
      .select(["draft", "published_revision_id"])
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!page) throw notFound();
    const revisionId = randomUUID();
    await trx
      .insertInto("revisions")
      .values({
        id: revisionId,
        page_id: id,
        content: page.draft,
        created_at: now(),
        created_by: actingUser(),
        created_via: actingAgent(),
      })
      .execute();
    await trx
      .updateTable("pages")
      .set({ published_revision_id: revisionId })
      .where("id", "=", id)
      .execute();
    await syncPageUsage(trx, id);
    return { pageId: id, revisionId, previous: page.published_revision_id };
  });
}

/** Publishes the draft of every published page that has changed since. */
export async function publishChanged(db: Db): Promise<PublishSwap[]> {
  const changed = (await listPages(db)).filter((p) => p.status === "changed");
  const swaps: PublishSwap[] = [];
  for (const page of changed) swaps.push(await publishDraft(db, page.id));
  return swaps;
}

/** Publishes the drafts of these pages (those that still exist). */
export async function publishPages(db: Db, ids: string[]): Promise<PublishSwap[]> {
  const live = new Set((await listPages(db)).map((p) => p.id));
  const swaps: PublishSwap[] = [];
  for (const id of ids.filter((each) => live.has(each))) swaps.push(await publishDraft(db, id));
  return swaps;
}

/** Titles and publish state of some pages, by id. */
export async function pageFacts(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { title: string; published: boolean }>();
  const rows = await db
    .selectFrom("pages")
    .select(["id", "draft", "published_revision_id"])
    .where("id", "in", ids)
    .execute();
  return new Map(
    rows.map((r) => [
      r.id,
      {
        title: (JSON.parse(r.draft) as PageDocument).ms.title,
        published: r.published_revision_id !== null,
      },
    ]),
  );
}

/** The paths that change for `id` and the pages under it, once `apply` has changed the tree. */
async function pathChanges(db: Db, tree: Tree, id: string, apply: () => void) {
  const subtree = [id, ...tree.descendants(id).map((n) => n.id)];
  const before = new Map(subtree.map((pageId) => [pageId, tree.path(pageId)]));
  apply();
  const facts = await pageFacts(db, subtree);
  return subtree.flatMap((pageId): PathChange[] => {
    const from = before.get(pageId) ?? "";
    const to = tree.path(pageId);
    const fact = facts.get(pageId);
    return from === to || !fact ? [] : [{ id: pageId, from, to, ...fact }];
  });
}

/** Old addresses of published pages now send visitors to the page at its new address. */
async function redirectChanges(db: Db, changes: PathChange[], byPage: string) {
  for (const change of changes)
    if (change.published)
      await addRedirect(db, { source: change.from, pageId: change.id, createdBy: byPage });
}

/**
 * Moves a page to another parent or position, or changes its slug. Its
 * subtree moves with it, so their paths change too; `dryRun` reports them.
 */
export async function movePage(
  db: Db,
  id: string,
  input: {
    parentId?: string;
    position?: number;
    slug?: string;
    redirect: boolean;
    dryRun: boolean;
  },
): Promise<MoveResult> {
  const moved = await db.transaction().execute(async (trx) => {
    const tree = await loadTree(trx);
    const node = tree.get(id);
    if (!node) throw notFound();
    if (!node.parent_id) throw homeFixed("moved");
    const moving = input.parentId !== undefined || input.position !== undefined;
    if (moving && (await kindOf(trx, id)) === "entry")
      throw new HttpError(400, "entry_fixed", "An entry stays in its listing page");
    if (input.parentId && (await kindOf(trx, input.parentId)) !== "page")
      throw new HttpError(400, "listing_parent", "A listing page holds entries, not other pages");
    const oldParent = node.parent_id;
    const parentId = input.parentId ?? oldParent;
    if (!tree.get(parentId))
      throw new HttpError(404, "parent_not_found", "No page with that parent id");
    if (tree.isWithin(parentId, id))
      throw new HttpError(
        400,
        "move_into_itself",
        "A page can't move under itself or its child pages",
      );
    const slug = input.slug ?? node.slug;
    assertSlugFree(tree, parentId, slug, id);

    const siblings = tree.children(parentId).filter((s) => s.id !== id);
    const current = tree.children(oldParent).findIndex((s) => s.id === id);
    const fallback = parentId === oldParent ? current : siblings.length;
    const index = Math.min(input.position ?? fallback, siblings.length);

    const changes = await pathChanges(trx, tree, id, () => tree.place(id, parentId, slug));
    if (input.dryRun) return changes;

    await trx
      .updateTable("pages")
      .set({ parent_id: parentId, slug })
      .where("id", "=", id)
      .execute();
    if (parentId !== oldParent)
      await setPositions(
        trx,
        tree
          .children(oldParent)
          .filter((s) => s.id !== id)
          .map((s) => s.id),
      );
    const order = siblings.map((s) => s.id);
    order.splice(index, 0, id);
    await setPositions(trx, order);

    if (changes.length) {
      // A page moved back to an old address takes it over again.
      await trx
        .deleteFrom("redirects")
        .where(
          "source_path",
          "in",
          changes.map((c) => c.to),
        )
        .execute();
      if (input.redirect) await redirectChanges(trx, changes, id);
    }
    return changes;
  });
  return { page: toSummary(await getPage(db, id)), changes: moved };
}

function copySlug(base: string, taken: Set<string>) {
  const stem = `${base.slice(0, 70)}-salinan`;
  for (let n = 1; ; n++) {
    const slug = n === 1 ? stem : `${stem}-${n}`;
    if (!taken.has(slug)) return slug;
  }
}

/**
 * A draft copy beside the page (the home page's copy goes under it), titled
 * "… (salinan)" with a free slug, optionally with its child pages.
 */
export async function duplicatePage(
  db: Db,
  id: string,
  input: { includeChildren: boolean },
): Promise<Page> {
  const copyId = await db.transaction().execute(async (trx) => {
    const tree = await loadTree(trx);
    const node = tree.get(id);
    if (!node) throw notFound();
    const subtree = input.includeChildren ? tree.descendants(id) : [];
    const rows = await trx
      .selectFrom("pages")
      .select(["id", "draft", "kind", "listing", "publish_at"])
      .where("id", "in", [id, ...subtree.map((n) => n.id)])
      .execute();
    const drafts = new Map(rows.map((r) => [r.id, JSON.parse(r.draft) as PageDocument]));
    const facts = new Map(rows.map((r) => [r.id, r]));
    const time = now();
    const insert = async (
      parentId: string,
      slug: string,
      position: number,
      doc: PageDocument,
      from: string,
    ) => {
      const source = facts.get(from);
      const newId = randomUUID();
      await trx
        .insertInto("pages")
        .values({
          id: newId,
          parent_id: parentId,
          slug,
          position,
          draft: JSON.stringify(doc),
          published_revision_id: null,
          created_at: time,
          updated_at: time,
          deleted_at: null,
          template: null,
          kind: source?.kind ?? "page",
          listing: source?.listing ?? null,
          publish_at: source?.publish_at ?? null,
        })
        .execute();
      return newId;
    };

    const parentId = node.parent_id ?? node.id;
    const siblings = tree.children(parentId);
    const draft = drafts.get(id);
    if (!draft) throw notFound();
    const title = `${draft.ms.title} (salinan)`.slice(0, 160);
    const slug = copySlug(
      node.slug || slugify(draft.ms.title) || "halaman",
      new Set(siblings.map((s) => s.slug)),
    );
    const copy = await insert(
      parentId,
      slug,
      siblings.length,
      { ...draft, ms: { ...draft.ms, title } },
      id,
    );

    // Beside the original, or last under the home page.
    const order = siblings.map((s) => s.id);
    order.splice(node.parent_id ? order.indexOf(id) + 1 : order.length, 0, copy);
    await setPositions(trx, order);

    const copies = new Map([[id, copy]]);
    for (const child of subtree) {
      const doc = drafts.get(child.id);
      const parent = child.parent_id && copies.get(child.parent_id);
      if (!doc || !parent) continue;
      copies.set(child.id, await insert(parent, child.slug, child.position, doc, child.id));
    }
    for (const pageId of copies.values()) await syncPageUsage(trx, pageId);
    return copy;
  });
  return getPage(db, copyId);
}

async function checkRedirectTarget(tree: Tree, target: string | undefined, leaving: Set<string>) {
  if (target === undefined) return;
  if (!tree.get(target) || leaving.has(target))
    throw new HttpError(
      400,
      "redirect_target_not_found",
      "Choose another page to send visitors to",
    );
}

/** Takes the page off the site at the next publish and keeps it as a draft. */
export async function unpublishPage(
  db: Db,
  id: string,
  input: { redirectTo?: string | undefined },
) {
  await db.transaction().execute(async (trx) => {
    const tree = await loadTree(trx);
    const node = tree.get(id);
    if (!node) throw notFound();
    if (!node.parent_id) throw homeFixed("unpublished");
    await checkRedirectTarget(tree, input.redirectTo, new Set([id]));
    const result = await trx
      .updateTable("pages")
      .set({ published_revision_id: null })
      .where("id", "=", id)
      .where("published_revision_id", "is not", null)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n)
      throw new HttpError(409, "not_published", "This page isn't published");
    if (input.redirectTo)
      await addRedirect(trx, { source: tree.path(id), pageId: input.redirectTo, createdBy: id });
    await syncPageUsage(trx, id);
  });
  return getPage(db, id);
}

/** Every page a navbar links to by id: its links and its dropdowns' links alike. */
function linkedPageIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) linkedPageIds(item, out);
  else if (value && typeof value === "object") {
    const link = value as { kind?: unknown; pageId?: unknown };
    if (link.kind === "page" && typeof link.pageId === "string") out.add(link.pageId);
    for (const item of Object.values(value)) linkedPageIds(item, out);
  }
  return out;
}

/** A link's address on this site, without query, fragment or trailing slash; undefined for others. */
export const sitePath = (href: string) => {
  if (!href.startsWith("/")) return undefined;
  return href.split(/[?#]/)[0]?.replace(/(.)\/+$/, "$1");
};

/** What deleting a page would touch: its child pages, links to it and its place in the navbar. */
export async function deletePreview(db: Db, id: string): Promise<DeletePreview> {
  const tree = await loadTree(db);
  const node = tree.get(id);
  if (!node) throw notFound();
  const subtree = [id, ...tree.descendants(id).map((n) => n.id)];
  const paths = new Set(subtree.map((pageId) => tree.path(pageId)));
  const rows = await db
    .selectFrom("pages")
    .select(["id", "draft", "published_revision_id"])
    .where("deleted_at", "is", null)
    .execute();
  const ref = (row: (typeof rows)[number]): PageRef => ({
    id: row.id,
    title: (JSON.parse(row.draft) as PageDocument).ms.title,
    path: tree.path(row.id),
  });
  const inSubtree = new Set(subtree);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // The navbar as drafted and as live (or the default, never saved): either is a place it would leave.
  const navbar = linkedPageIds(
    (
      await Promise.all(
        (["draft", "published"] as const).map((scope) => readDoc(db, "navigation", scope)),
      )
    ).map((nav) => nav.navbar),
  );
  return {
    published: byId.get(id)?.published_revision_id != null,
    descendants: subtree.slice(1).flatMap((pageId) => {
      const row = byId.get(pageId);
      return row ? [{ ...ref(row), published: row.published_revision_id !== null }] : [];
    }),
    linkedFrom: rows
      .filter((row) => !inSubtree.has(row.id))
      .filter((row) =>
        linksOf(JSON.parse(row.draft)).some(({ href }) => {
          const path = sitePath(href);
          return path !== undefined && paths.has(path);
        }),
      )
      .map(ref),
    inNavbar: subtree.some((pageId) => navbar.has(pageId)),
  };
}

/**
 * Soft-deletes a page: it leaves the tree now and the site at the next
 * publish. Its child pages are deleted with it or moved up a level.
 */
export async function deletePage(
  db: Db,
  id: string,
  input: { children?: "delete" | "lift" | undefined; redirectTo?: string | undefined },
) {
  await db.transaction().execute(async (trx) => {
    const tree = await loadTree(trx);
    const node = tree.get(id);
    if (!node) throw notFound();
    if (!node.parent_id) throw homeFixed("deleted");
    const parentId = node.parent_id;
    const kids = tree.children(id);
    if (input.children === "lift" && (await kindOf(trx, id)) === "listing")
      throw new HttpError(400, "listing_entries", "A listing page's entries are deleted with it");
    if (kids.length && !input.children)
      throw new HttpError(
        400,
        "children_choice_required",
        "Choose whether to delete the child pages too or move them up a level",
      );
    const deleting =
      input.children === "lift" ? [id] : [id, ...tree.descendants(id).map((n) => n.id)];
    await checkRedirectTarget(tree, input.redirectTo, new Set(deleting));
    const facts = await pageFacts(trx, deleting);
    const oldPaths = new Map(deleting.map((pageId) => [pageId, tree.path(pageId)]));

    const siblingOrder = tree.children(parentId).map((s) => s.id);
    if (input.children === "lift" && kids.length) {
      const siblings = tree.children(parentId).filter((s) => s.id !== id);
      const clash = kids.find((kid) => siblings.some((s) => s.slug === kid.slug));
      if (clash)
        throw new HttpError(
          409,
          "slug_taken",
          `A page beside this one already uses the address "${clash.slug}", so its child pages can't move up. Rename one of them first.`,
        );
      for (const kid of kids) assertSlugFree(tree, parentId, kid.slug, kid.id);
      const lifted: PathChange[] = [];
      for (const kid of kids)
        lifted.push(
          ...(await pathChanges(trx, tree, kid.id, () => tree.place(kid.id, parentId, kid.slug))),
        );
      await trx
        .updateTable("pages")
        .set({ parent_id: parentId })
        .where("parent_id", "=", id)
        .execute();
      await redirectChanges(trx, lifted, id);
    }
    // The child pages take the deleted page's place among its siblings.
    const order = siblingOrder.flatMap((pageId) =>
      pageId !== id ? [pageId] : input.children === "lift" ? kids.map((k) => k.id) : [],
    );
    await setPositions(trx, order);

    await trx.updateTable("pages").set({ deleted_at: now() }).where("id", "in", deleting).execute();
    for (const pageId of deleting) await syncPageUsage(trx, pageId);
    if (input.redirectTo)
      for (const pageId of deleting)
        if (facts.get(pageId)?.published)
          await addRedirect(trx, {
            source: oldPaths.get(pageId) ?? "",
            pageId: input.redirectTo,
            createdBy: id,
          });
  });
}

/**
 * Every page that's live: a published revision, and for an entry a date
 * that has come. With its path in the current tree.
 */
export async function publishedPages(db: Db) {
  const [rows, tree] = await Promise.all([
    db
      .selectFrom("pages")
      .innerJoin("revisions", "revisions.id", "pages.published_revision_id")
      .select(["pages.id", "pages.kind", "revisions.content"])
      .where("pages.deleted_at", "is", null)
      .execute(),
    loadTree(db),
  ]);
  return inTreeOrder(
    rows.filter((row) => row.kind !== "entry" || !scheduled(row.content)),
    tree,
  ).map((row) => ({
    id: row.id,
    kind: row.kind,
    parentId: tree.get(row.id)?.parent_id ?? null,
    path: tree.path(row.id),
    content: JSON.parse(row.content) as PageDocument,
  }));
}

/**
 * Every page as its draft would publish it, depth first like `publishedPages`,
 * with its status: what the draft search index is built from.
 */
export async function draftPages(db: Db) {
  const [rows, tree] = await Promise.all([select(db).execute(), loadTree(db)]);
  return inTreeOrder(rows, tree).map((row) => {
    const page = toPage(row, tree);
    return {
      id: page.id,
      kind: page.kind,
      path: page.path,
      status: page.status,
      content: withDefaults(PageDocument, page.draft),
    };
  });
}
