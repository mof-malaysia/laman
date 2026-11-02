/**
 * Publish jobs: what a publish does before the site is written (a scheduled
 * one publishes what it was given, or everything waiting), its per-page log,
 * and the list of what isn't live yet.
 */
import {
  type PageSummary,
  type PublishLogEntry,
  type PublishPayload,
  type SiteDocName,
  type UndoPublishResult,
  type WaitingItem,
} from "@fiscal-sb/contracts";
import { type Db, now } from "../db/index.js";
import { HttpError } from "../errors.js";
import type { Jobs } from "../jobs.js";
import { PublishError, publishSite } from "../publisher.js";
import { syncPageUsage, waitingMedia } from "./media.js";
import { listPages, publishChanged, publishPages } from "./pages.js";
import { docChanged, promoteDrafts } from "./site.js";

/**
 * Publishes what was chosen: these pages and documents, or with neither,
 * everything waiting except pages that have never been published.
 */
export async function publishChosen(
  db: Db,
  chosen: { pageIds?: string[] | undefined; docs?: SiteDocName[] | undefined },
) {
  if (!chosen.pageIds && !chosen.docs) {
    const swaps = await publishChanged(db);
    await promoteDrafts(db);
    return swaps;
  }
  const swaps = chosen.pageIds?.length ? await publishPages(db, chosen.pageIds) : [];
  if (chosen.docs?.length) await promoteDrafts(db, chosen.docs);
  return swaps;
}

async function saveLog(db: Db, jobId: string, log: PublishLogEntry[]) {
  await db
    .updateTable("jobs")
    .set({ log: JSON.stringify(log) })
    .where("id", "=", jobId)
    .execute();
}

async function savePayload(db: Pick<Db, "updateTable">, jobId: string, payload: PublishPayload) {
  await db
    .updateTable("jobs")
    .set({ payload: JSON.stringify(payload) })
    .where("id", "=", jobId)
    .execute();
}

/**
 * Puts back what was live before a publish: each page it published goes back
 * to the revision it replaced, or off the site if it was new, and a rebuild is
 * queued. Drafts stay as they are, so the officer's changes wait to be
 * published again. A page published again since is left alone. Site
 * documents aren't put back.
 */
export async function undoPublish(db: Db, jobs: Jobs, jobId: string): Promise<UndoPublishResult> {
  const target = await jobs.get(jobId);
  const payload = target.payload as PublishPayload;
  if (target.kind !== "publish")
    throw new HttpError(404, "job_not_found", "No publish with that id");
  if (target.status !== "done")
    throw new HttpError(409, "job_not_done", "Only a finished publish can be undone");
  if (payload.undoneAt)
    throw new HttpError(409, "already_undone", "This publish has already been undone");
  const swaps = payload.swaps ?? [];
  if (!swaps.length)
    throw new HttpError(
      409,
      "nothing_to_undo",
      "This publish changed no pages that can be put back",
    );
  let putBack = 0;
  // The pages and the "undone" mark change together, before the rebuild can run.
  await db.transaction().execute(async (trx) => {
    for (const swap of swaps) {
      const result = await trx
        .updateTable("pages")
        .set({ published_revision_id: swap.previous })
        .where("id", "=", swap.pageId)
        .where("deleted_at", "is", null)
        .where("published_revision_id", "=", swap.revisionId)
        // The home page can't be taken off the site.
        .$if(swap.previous === null, (q) => q.where("parent_id", "is not", null))
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) continue;
      await syncPageUsage(trx, swap.pageId);
      putBack++;
    }
    await savePayload(trx, jobId, { ...payload, undoneAt: now() });
  });
  const job = await jobs.enqueue("publish", {
    trigger: "undo",
    undoes: jobId,
  } satisfies PublishPayload);
  return { putBack, skipped: swaps.length - putBack, job };
}

export async function runPublish(
  db: Db,
  options: { dataDir: string; siteUrl?: string | undefined },
  jobId: string,
  payload: PublishPayload,
) {
  if (payload.trigger === "scheduled")
    await savePayload(db, jobId, { ...payload, swaps: await publishChosen(db, payload) });
  try {
    const { counts, log } = await publishSite({ db, ...options, full: payload.full });
    await saveLog(db, jobId, log);
    return counts;
  } catch (error) {
    if (error instanceof PublishError) await saveLog(db, jobId, error.log);
    throw error;
  }
}

const toItem = (p: PageSummary): WaitingItem => ({
  kind: "page",
  id: p.id,
  title: p.title,
  path: p.path,
  new: p.status === "draft",
  updatedAt: p.updatedAt,
});

/**
 * What isn't live yet: pages and entries with newer changes, then the site
 * documents, then replaced files, then pages that have never been published. Scheduled entries
 * aren't listed: they go live on their own.
 */
export async function waitingItems(db: Db, pages?: PageSummary[]): Promise<WaitingItem[]> {
  const [list, settings, navigation, announcement, search, theme, media] = await Promise.all([
    pages ?? listPages(db),
    docChanged(db, "settings"),
    docChanged(db, "navigation"),
    docChanged(db, "announcement"),
    docChanged(db, "search"),
    docChanged(db, "theme"),
    waitingMedia(db),
  ]);
  const docs: WaitingItem[] = [
    ...(announcement ? [{ kind: "announcement" as const }] : []),
    ...(navigation ? [{ kind: "navigation" as const }] : []),
    ...(search ? [{ kind: "search" as const }] : []),
    ...(theme ? [{ kind: "theme" as const }] : []),
    ...(settings ? [{ kind: "settings" as const }] : []),
  ];
  return [
    ...list.filter((p) => p.status === "changed").map(toItem),
    ...docs,
    ...media,
    ...list.filter((p) => p.status === "draft").map(toItem),
  ];
}
