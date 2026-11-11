/**
 * Page history: published revisions, and draft revisions kept from saves
 * (one per editing session, so autosave doesn't flood it). Restoring copies
 * a revision into the draft, after keeping the current draft as a revision,
 * so a restore can be undone. Deleted pages stay restorable for 30 days.
 */
import { randomUUID } from "node:crypto";
import { PageDocument, withDefaults } from "@fiscal-sb/blocks";
import type { DeletedPage, Revision, RevisionDetail } from "@fiscal-sb/contracts";
import { sql } from "kysely";
import { type Db, now } from "../db/index.js";
import { HttpError } from "../errors.js";
import { syncPageUsage } from "./media.js";
import { readDoc } from "./site.js";
import { Tree, loadTree } from "./tree.js";
import { actingAgent, actingUser } from "../auth/acting.js";

/** Saves within this long of the last draft revision update it instead of adding one. */
const SESSION_MS = 10 * 60 * 1000;
export const TRASH_DAYS = 30;

/**
 * Keeps the draft in the history: a new draft revision, or the session's
 * current one updated. `replaced` is the draft this save replaced: a run
 * continues only the revision that holds it, so a copy kept aside (a save
 * refused for a conflict, `replaced` null) is never written over.
 */
export async function recordDraft(
  db: Db,
  pageId: string,
  content: string,
  replaced: string | null,
) {
  const last = await db
    .selectFrom("revisions")
    .select(["id", "kind", "created_at", "content", "created_by", "created_via"])
    .where("page_id", "=", pageId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (last?.content === content) return;
  // One person's run of saves is one revision; someone else's starts another.
  if (
    last?.kind === "draft" &&
    last.content === replaced &&
    last.created_by === actingUser() &&
    last.created_via === actingAgent() &&
    Date.now() - Date.parse(last.created_at) < SESSION_MS
  ) {
    await db
      .updateTable("revisions")
      .set({ content, created_at: now() })
      .where("id", "=", last.id)
      .execute();
    return;
  }
  await db
    .insertInto("revisions")
    .values({
      id: randomUUID(),
      page_id: pageId,
      content,
      created_at: now(),
      kind: "draft",
      created_by: actingUser(),
      created_via: actingAgent(),
    })
    .execute();
  await pruneRevisions(db, pageId);
}

/** Drops the oldest draft revisions beyond the kept count. Published revisions stay. */
export async function pruneRevisions(db: Db, pageId: string) {
  const { publishing } = await readDoc(db, "settings", "published");
  const drafts = await db
    .selectFrom("revisions")
    .select("id")
    .where("page_id", "=", pageId)
    .where("kind", "=", "draft")
    .orderBy("created_at", "desc")
    .execute();
  const extra = drafts.slice(publishing.revisionsToKeep).map((r) => r.id);
  if (extra.length) await db.deleteFrom("revisions").where("id", "in", extra).execute();
}

/**
 * What keeping `keep` draft revisions per page would remove: the drafts past
 * that count, and the pages they belong to. Pruning happens at each page's
 * next save, so nothing is removed by asking.
 */
export async function prunePreview(db: Db, keep: number) {
  const rows = await db
    .selectFrom("revisions")
    .select(["page_id", (eb) => eb.fn.countAll<number>().as("n")])
    .where("kind", "=", "draft")
    .groupBy("page_id")
    .having((eb) => eb.fn.countAll(), ">", keep)
    .execute();
  return {
    drafts: rows.reduce((sum, row) => sum + Number(row.n) - keep, 0),
    pages: rows.length,
  };
}

/** How many blocks differ between two documents: added, removed or changed. */
function blocksChanged(a: PageDocument | undefined, b: PageDocument) {
  const before = new Map((a?.ms.blocks ?? []).map((block) => [block.id, JSON.stringify(block)]));
  const after = new Map(b.ms.blocks.map((block) => [block.id, JSON.stringify(block)]));
  let n = 0;
  for (const [id, json] of after) if (before.get(id) !== json) n++;
  for (const id of before.keys()) if (!after.has(id)) n++;
  return n;
}

export async function listRevisions(db: Db, pageId: string): Promise<Revision[]> {
  const page = await db
    .selectFrom("pages")
    .select("published_revision_id")
    .where("id", "=", pageId)
    .executeTakeFirst();
  if (!page) throw new HttpError(404, "page_not_found", "No page with that id");
  const rows = await db
    .selectFrom("revisions")
    .leftJoin("users", "users.id", "revisions.created_by")
    .select([
      "revisions.id",
      "revisions.kind",
      "revisions.created_at",
      "revisions.content",
      "users.display_name as by",
      "revisions.created_via as via",
    ])
    .where("page_id", "=", pageId)
    .orderBy("revisions.created_at", "asc")
    .execute();
  let previous: PageDocument | undefined;
  const out = rows.map((row) => {
    const content = JSON.parse(row.content) as PageDocument;
    const revision: Revision = {
      id: row.id,
      kind: row.kind,
      createdAt: row.created_at,
      blocksChanged: blocksChanged(previous, content),
      live: row.id === page.published_revision_id,
      by: row.by,
      via: row.via,
    };
    previous = content;
    return revision;
  });
  return out.toReversed();
}

export async function getRevision(
  db: Db,
  pageId: string,
  revisionId: string,
): Promise<RevisionDetail> {
  const list = await listRevisions(db, pageId);
  const revision = list.find((r) => r.id === revisionId);
  const row = await db
    .selectFrom("revisions")
    .select("content")
    .where("id", "=", revisionId)
    .where("page_id", "=", pageId)
    .executeTakeFirst();
  if (!revision || !row) throw new HttpError(404, "revision_not_found", "No revision with that id");
  // With defaults filled in, as the draft is: a field added since this was saved reads as it renders.
  return {
    ...revision,
    content: withDefaults(PageDocument, JSON.parse(row.content) as PageDocument),
  };
}

/** Restore as draft: the current draft becomes a revision first, so this can be undone. */
export async function restoreRevision(db: Db, pageId: string, revisionId: string) {
  await db.transaction().execute(async (trx) => {
    const [page, revision] = await Promise.all([
      trx
        .selectFrom("pages")
        .select("draft")
        .where("id", "=", pageId)
        .where("deleted_at", "is", null)
        .executeTakeFirst(),
      trx
        .selectFrom("revisions")
        .select("content")
        .where("id", "=", revisionId)
        .where("page_id", "=", pageId)
        .executeTakeFirst(),
    ]);
    if (!page) throw new HttpError(404, "page_not_found", "No page with that id");
    if (!revision) throw new HttpError(404, "revision_not_found", "No revision with that id");
    await trx
      .insertInto("revisions")
      .values({
        id: randomUUID(),
        page_id: pageId,
        content: page.draft,
        created_at: now(),
        kind: "draft",
        created_by: actingUser(),
        created_via: actingAgent(),
      })
      .execute();
    await trx
      .updateTable("pages")
      .set({ draft: revision.content, updated_at: now(), updated_by: actingUser() })
      .where("id", "=", pageId)
      .execute();
    await syncPageUsage(trx, pageId);
  });
}

/**
 * Throws away a page's unpublished changes: the live version becomes the draft
 * again. Through `restoreRevision`, so the discarded draft is kept in the
 * page's history and can be restored.
 */
export async function discardPageDraft(db: Db, pageId: string) {
  const page = await db
    .selectFrom("pages")
    .select("published_revision_id")
    .where("id", "=", pageId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!page) throw new HttpError(404, "page_not_found", "No page with that id");
  if (!page.published_revision_id)
    throw new HttpError(
      409,
      "never_published",
      "This page has never been published, so there is no live version to go back to",
    );
  await restoreRevision(db, pageId, page.published_revision_id);
}

/** Every page row, deleted or not, so a deleted page's old path can be worked out. */
async function fullTree(db: Db) {
  const rows = await db
    .selectFrom("pages")
    .select(["id", "parent_id", "slug", "position", "kind"])
    .execute();
  return new Tree(rows);
}

const purgeAt = (deletedAt: string) =>
  new Date(Date.parse(deletedAt) + TRASH_DAYS * 86_400_000).toISOString();

/** Deleted pages still restorable, newest first. Pages deleted with a parent are restored with it. */
export async function listDeleted(db: Db): Promise<DeletedPage[]> {
  await purgeDeleted(db);
  const [rows, tree] = await Promise.all([
    db
      .selectFrom("pages")
      .select(["id", "parent_id", "kind", "draft", "deleted_at"])
      .where("deleted_at", "is not", null)
      .orderBy("deleted_at", "desc")
      .execute(),
    fullTree(db),
  ]);
  const deletedAt = new Map(rows.map((r) => [r.id, r.deleted_at]));
  // A page deleted together with its parent is part of the parent's entry.
  const roots = rows.filter((r) => !r.parent_id || deletedAt.get(r.parent_id) !== r.deleted_at);
  return roots.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: (JSON.parse(row.draft) as PageDocument).ms.title,
    path: tree.path(row.id),
    deletedAt: row.deleted_at ?? "",
    purgeAt: purgeAt(row.deleted_at ?? now()),
    children: tree.descendants(row.id).filter((n) => deletedAt.get(n.id) === row.deleted_at).length,
  }));
}

/** A deleted page's last draft and where it was, for its preview. */
export async function getDeleted(db: Db, pageId: string) {
  const row = await db
    .selectFrom("pages")
    .select(["id", "kind", "draft", "listing"])
    .where("id", "=", pageId)
    .where("deleted_at", "is not", null)
    .executeTakeFirst();
  if (!row) throw new HttpError(404, "page_not_found", "No deleted page with that id");
  const tree = await fullTree(db);
  return { ...row, path: tree.path(row.id), draft: JSON.parse(row.draft) as PageDocument };
}

/** Brings a deleted page back (with the pages deleted with it), under its parent or the home page. */
export async function restoreDeleted(db: Db, pageId: string) {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("pages")
      .select(["id", "parent_id", "slug", "deleted_at"])
      .where("id", "=", pageId)
      .executeTakeFirst();
    if (!row?.deleted_at)
      throw new HttpError(404, "page_not_found", "No deleted page with that id");
    const [all, live] = await Promise.all([fullTree(trx), loadTree(trx)]);
    const group = [row.id, ...all.descendants(row.id).map((n) => n.id)];
    const together = await trx
      .selectFrom("pages")
      .select("id")
      .where("id", "in", group)
      .where("deleted_at", "=", row.deleted_at)
      .execute();
    const parentId = row.parent_id && live.get(row.parent_id) ? row.parent_id : live.home?.id;
    if (!parentId)
      throw new HttpError(409, "no_home_page", "There is no home page to restore under");
    const siblings = live.children(parentId);
    let slug = row.slug;
    for (let n = 1; siblings.some((s) => s.slug === slug) || live.reserved(parentId, slug); n++)
      slug = `${row.slug}-dipulihkan${n > 1 ? `-${n}` : ""}`;
    await trx
      .updateTable("pages")
      .set({ parent_id: parentId, slug, position: siblings.length })
      .where("id", "=", row.id)
      .execute();
    await trx
      .updateTable("pages")
      .set({ deleted_at: null })
      .where(
        "id",
        "in",
        together.map((r) => r.id),
      )
      .execute();
    for (const { id } of together) await syncPageUsage(trx, id);
  });
}

/** Removes pages deleted more than 30 days ago, for good. */
export async function purgeDeleted(db: Db) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  await db.transaction().execute(async (trx) => {
    // A subtree goes together, so its parent links are only checked at the end.
    await sql`pragma defer_foreign_keys = on`.execute(trx);
    const old = await trx
      .selectFrom("pages")
      .select("id")
      .where("deleted_at", "<", cutoff)
      .execute();
    if (!old.length) return;
    const ids = old.map((r) => r.id);
    await trx
      .deleteFrom("media_usage")
      .where(
        "owner",
        "in",
        ids.map((id) => `page:${id}`),
      )
      .execute();
    await trx.deleteFrom("pages").where("id", "in", ids).execute();
  });
}
