import { can } from "@fiscal-sb/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  CreatePageBody,
  DeletePageQuery,
  DeletePreview,
  DuplicatePageBody,
  MovePageBody,
  MoveResult,
  Page,
  PageChecks,
  PageChecksQuery,
  PageParams,
  PageSummary,
  DocPublishResult,
  PublishResult,
  type PublishPayload,
  PublishPreview,
  PublishSiteBody,
  PublishSiteResult,
  Revision,
  RevisionDetail,
  RevisionParams,
  DeletedPage,
  CreateEntryBody,
  EntriesQuery,
  EntryList,
  EntrySearchQuery,
  ListingDetail,
  SaveListingBody,
  SaveDraftBody,
  UndoPublishResult,
  UnpublishPageBody,
  JobParams,
  envelope,
} from "../contract.js";
import {
  createPage,
  deletePage,
  deletePreview,
  duplicatePage,
  getPage,
  listPages,
  movePage,
  publishDraft,
  saveDraft,
  searchEntries,
  unpublishPage,
} from "../content/pages.js";
import {
  discardPageDraft,
  getRevision,
  listDeleted,
  listRevisions,
  restoreDeleted,
  restoreRevision,
} from "../content/history.js";
import { assertReady, pageChecks } from "../content/checks.js";
import { publishChosen, undoPublish, waitingItems } from "../content/publishing.js";
import {
  createEntry,
  getListing,
  listEntries,
  makeListing,
  saveListing,
} from "../content/entries.js";
import { audited, userOf } from "../auth/guard.js";
import { HttpError } from "../errors.js";

type CreateBody = z.output<typeof CreatePageBody>;
type MoveBody = z.output<typeof MovePageBody>;
type DuplicateBody = z.output<typeof DuplicatePageBody>;

export const pageRoutes: FastifyPluginAsync = async (app) => {
  const { db, jobs } = app;
  /**
   * Changes to the tree go live when they're confirmed, not at the next
   * publish. A rebuild already waiting reads the tree when it runs, so it
   * covers this change too: dragging five pages in a row builds once.
   */
  /**
   * Moving and deleting change the site at once, but only for pages on it: an
   * Editor can rename, move or delete a page nobody has published yet (nor
   * anything under it), and needs a Content Manager for the rest.
   */
  const onlyUnpublished = async (request: FastifyRequest) => {
    const { id } = request.params as PageParams;
    if ((request.body as { dryRun?: boolean } | undefined)?.dryRun) return;
    if (can(userOf(request).role, "content.publish")) return;
    // The page and everything under it, deleted or not: a restore brings back its deleted children.
    const { rows: live } = await sql<{ id: string }>`
      with recursive under(id) as (
        select ${id}
        union all
        select pages.id from pages join under on pages.parent_id = under.id
      )
      select pages.id from pages join under on pages.id = under.id
      where pages.published_revision_id is not null
      limit 1
    `.execute(db);
    if (live.length)
      throw new HttpError(
        403,
        "forbidden",
        "This role can't move or delete pages that are on the site.",
        {
          needs: "content.publish",
        },
      );
  };

  const rebuild = async () => {
    const waiting = await db
      .selectFrom("jobs")
      .select("id")
      .where("kind", "=", "publish")
      .where("status", "=", "queued")
      .where("run_at", "is", null)
      .executeTakeFirst();
    if (!waiting) await jobs.enqueue("publish", { trigger: "tree" });
  };

  app.get(
    "/pages",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "List pages",
        description:
          "Every page, depth first from the home page; build the tree from `parentId`. Entries are left out: a listing page has GET /api/pages/:id/entries.",
        tags: ["pages"],
        response: { 200: envelope(z.array(PageSummary)) },
      },
    },
    async () => ({ data: (await listPages(db)).filter((p) => p.kind !== "entry") }),
  );

  app.post<{ Body: CreateBody }>(
    "/pages",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Create a page",
        description:
          "Creates a draft under `parentId` (the home page by default), last among its siblings, with the starting blocks of `template`.",
        tags: ["pages"],
        body: CreatePageBody,
        response: { 201: envelope(Page) },
      },
    },
    async (request, reply) => {
      const { title, slug, parentId, template } = request.body;
      return reply
        .status(201)
        .send({ data: await createPage(db, { title, slug, parentId, template }) });
    },
  );

  app.get<{ Params: PageParams }>(
    "/pages/:id",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get a page and its draft",
        tags: ["pages"],
        params: PageParams,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => ({ data: await getPage(db, request.params.id) }),
  );

  app.put<{ Params: PageParams; Body: SaveDraftBody }>(
    "/pages/:id/draft",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Save a page's draft",
        description:
          "The draft is validated against the block registry. A redirect may not point at the page itself or at a page that redirects, and a page that others redirect to can't redirect. With `base`, a draft someone else saved since is never overwritten: 409 `draft_conflict` says who and when, and the refused draft is kept in the page's history.",
        tags: ["pages"],
        params: PageParams,
        body: SaveDraftBody,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => ({
      data: await saveDraft(db, request.params.id, request.body.draft, request.body.base),
    }),
  );

  app.get<{ Querystring: z.infer<typeof PageChecksQuery> }>(
    "/pages/checks",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Check pages before they go live",
        description:
          "What in each page's draft would fail visitors (docs/site-builder.md § Checks before publishing). A `block` check stops the page being published; `warn` ones can be published past.",
        tags: ["pages"],
        querystring: PageChecksQuery,
        response: { 200: envelope(PageChecks) },
      },
    },
    async (request) => ({ data: await pageChecks(db, request.query.ids.split(",")) }),
  );

  app.post<{ Params: PageParams }>(
    "/pages/:id/publish",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Publish a page",
        description:
          "Freezes the draft as the published revision and queues a rebuild of the static site. Only this page goes live: other pages' drafts and the site documents stay as they are. An entry dated in the future is scheduled instead: the job runs at its publish date.",
        tags: ["pages"],
        params: PageParams,
        response: { 202: envelope(PublishResult) },
      },
    },
    async (request, reply) => {
      await assertReady(db, [request.params.id]);
      audited(request, { action: "published", target: request.params.id });
      const swap = await publishDraft(db, request.params.id);
      // An entry dated in the future goes live with a publish at that time, not now.
      const page = await getPage(db, request.params.id);
      await db
        .deleteFrom("jobs")
        .where("status", "=", "queued")
        .where("payload", "like", `%"trigger":"entry","pageId":"${page.id}"%`)
        .execute();
      const publishAt = page.kind === "entry" ? page.draft.entry?.publishAt : undefined;
      const job =
        publishAt && Date.parse(publishAt) > Date.now()
          ? await jobs.enqueue(
              "publish",
              { trigger: "entry", pageId: page.id, swaps: [swap] },
              { runAt: publishAt },
            )
          : await jobs.enqueue("publish", { trigger: "page", pageId: page.id, swaps: [swap] });
      return reply.status(202).send({ data: { revisionId: swap.revisionId, job } });
    },
  );

  app.post<{ Params: PageParams; Body: MoveBody }>(
    "/pages/:id/move",
    {
      config: { access: "content.edit" },
      preHandler: onlyUnpublished,
      schema: {
        summary: "Move or rename a page",
        description:
          "Changes the page's parent, position among its siblings or slug, and queues a rebuild so the site follows at once. The paths of the page and everything under it follow; the response lists the ones that changed. With `redirect`, published pages' old addresses send visitors to the new ones. With `dryRun`, nothing is saved. Moving a page that is on the site, or has one under it, needs `content.publish`.",
        tags: ["pages"],
        params: PageParams,
        body: MovePageBody,
        response: { 200: envelope(MoveResult) },
      },
    },
    async (request) => {
      const result = await movePage(db, request.params.id, request.body);
      if (!request.body.dryRun) await rebuild();
      return { data: result };
    },
  );

  app.post<{ Params: PageParams; Body: DuplicateBody }>(
    "/pages/:id/duplicate",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Duplicate a page",
        description:
          'Makes a draft copy beside the page, titled "… (salinan)" with a free slug, optionally with its child pages. Copies are never published.',
        tags: ["pages"],
        params: PageParams,
        body: DuplicatePageBody,
        response: { 201: envelope(Page) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({ data: await duplicatePage(db, request.params.id, request.body) }),
  );

  app.post<{ Params: PageParams; Body: UnpublishPageBody }>(
    "/pages/:id/unpublish",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Unpublish a page",
        description:
          "Takes the page off the site now (it queues a rebuild) and keeps it as a draft. `redirectTo` sends visitors of its address to another page.",
        tags: ["pages"],
        params: PageParams,
        body: UnpublishPageBody,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => {
      audited(request, { action: "unpublished", target: request.params.id });
      const page = await unpublishPage(db, request.params.id, request.body);
      await rebuild();
      return { data: page };
    },
  );

  app.get<{ Params: PageParams }>(
    "/pages/:id/delete-preview",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "What deleting a page would touch",
        description:
          "Its child pages, the pages that link to it or a page under it, and whether it's in the navbar.",
        tags: ["pages"],
        params: PageParams,
        response: { 200: envelope(DeletePreview) },
      },
    },
    async (request) => ({ data: await deletePreview(db, request.params.id) }),
  );

  app.delete<{ Params: PageParams; Querystring: DeletePageQuery }>(
    "/pages/:id",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Delete a page",
        description:
          "Soft-deletes the page: it leaves the tree and, with the rebuild it queues, the site. A page with child pages needs `children`: `delete` deletes them too, `lift` moves them up a level. `redirectTo` sends visitors of the deleted published addresses to another page. Deleting a page that is on the site, or has one under it, needs `content.publish`.",
        tags: ["pages"],
        params: PageParams,
        querystring: DeletePageQuery,
        response: { 204: z.null() },
      },
      preHandler: onlyUnpublished,
    },
    async (request, reply) => {
      audited(request, { action: "pageDeleted", target: request.params.id });
      await deletePage(db, request.params.id, request.query);
      await rebuild();
      return reply.status(204).send();
    },
  );

  app.post<{ Body: z.output<typeof PublishSiteBody> | null | undefined }>(
    "/publish",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Publish what's waiting",
        description:
          "Publishes the chosen pages' drafts and site documents (`pageIds`, `docs`), then queues a rebuild. With neither, everything waiting: published pages with newer changes and every changed site document. Pages that have never been published are only published when chosen. With `runAt` it's scheduled instead, and does that work when it runs.",
        tags: ["publishing"],
        // No body at all publishes everything waiting now.
        body: PublishSiteBody.nullish(),
        response: { 202: envelope(PublishSiteResult) },
      },
    },
    async (request, reply) => {
      const { runAt, ...chosen } = request.body ?? {};
      // Without a choice, the pages it publishes are the live ones with newer drafts.
      await assertReady(
        db,
        chosen.pageIds ??
          (chosen.docs
            ? []
            : (await listPages(db)).filter((p) => p.status === "changed").map((p) => p.id)),
      );
      audited(request, { action: "published", detail: { ...chosen, ...(runAt && { runAt }) } });
      if (runAt) {
        if (Date.parse(runAt) <= Date.now())
          throw new HttpError(400, "run_at_past", "Choose a time in the future");
        const job = await jobs.enqueue("publish", { trigger: "scheduled", ...chosen }, { runAt });
        return reply.status(202).send({ data: { published: 0, job } });
      }
      const swaps = await publishChosen(db, chosen);
      const job = await jobs.enqueue("publish", { trigger: "manual", swaps });
      return reply.status(202).send({ data: { published: swaps.length, job } });
    },
  );

  app.post<{ Params: z.infer<typeof JobParams> }>(
    "/publish/:id/undo",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Undo a publish",
        description:
          "Puts back what was live before a finished publish: each page it published goes back to the revision it replaced, or off the site if it was new, and a rebuild is queued. Drafts are kept, so the changes wait to be published again. Pages published again since are skipped. Site documents aren't put back.",
        tags: ["publishing"],
        params: JobParams,
        response: { 202: envelope(UndoPublishResult) },
      },
    },
    async (request, reply) => {
      audited(request, { action: "publishUndone", target: request.params.id });
      return reply.status(202).send({ data: await undoPublish(db, jobs, request.params.id) });
    },
  );

  app.post(
    "/publish/rebuild",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Rebuild the whole site",
        description:
          "Queues a publish that writes every file of the published site again, instead of only what changed since the last publish. It makes nothing new live. The live site stays up until the rebuilt one replaces it.",
        tags: ["publishing"],
        response: { 202: envelope(DocPublishResult) },
      },
    },
    async (_request, reply) => {
      const job = await jobs.enqueue("publish", {
        trigger: "rebuild",
        full: true,
      } satisfies PublishPayload);
      return reply.status(202).send({ data: { job } });
    },
  );

  app.get(
    "/publish/preview",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "What isn't live yet",
        description:
          "Pages and entries with newer changes, the site documents with changes, then pages that have never been published. The dashboard and the status bar show the same list.",
        tags: ["publishing"],
        response: { 200: envelope(PublishPreview) },
      },
    },
    async () => ({ data: { items: await waitingItems(db) } }),
  );

  app.get<{ Params: PageParams }>(
    "/pages/:id/revisions",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "List a page's revisions",
        description:
          "Published revisions and saved drafts, newest first, with how many blocks each changed.",
        tags: ["history"],
        params: PageParams,
        response: { 200: envelope(z.array(Revision)) },
      },
    },
    async (request) => ({ data: await listRevisions(db, request.params.id) }),
  );

  app.get<{ Params: z.infer<typeof RevisionParams> }>(
    "/pages/:id/revisions/:revisionId",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get a revision",
        description: "Its content can be rendered with POST /render/pages/:id to compare it.",
        tags: ["history"],
        params: RevisionParams,
        response: { 200: envelope(RevisionDetail) },
      },
    },
    async (request) => ({
      data: await getRevision(db, request.params.id, request.params.revisionId),
    }),
  );

  app.post<{ Params: z.infer<typeof RevisionParams> }>(
    "/pages/:id/revisions/:revisionId/restore",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Restore a revision as the draft",
        description:
          "Never publishes. The current draft becomes a revision first, so a restore can be undone.",
        tags: ["history"],
        params: RevisionParams,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => {
      await restoreRevision(db, request.params.id, request.params.revisionId);
      return { data: await getPage(db, request.params.id) };
    },
  );

  app.post<{ Params: PageParams }>(
    "/pages/:id/discard",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Discard a page's changes",
        description:
          "The live version becomes the draft again. The discarded draft is kept as a revision, so it can be restored. Refused (409 `never_published`) for a page that has never been live.",
        tags: ["history"],
        params: PageParams,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => {
      await discardPageDraft(db, request.params.id);
      return { data: await getPage(db, request.params.id) };
    },
  );

  app.get(
    "/trash",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Deleted pages",
        description: "Restorable for 30 days after they were deleted, then removed for good.",
        tags: ["history"],
        response: { 200: envelope(z.array(DeletedPage)) },
      },
    },
    async () => ({ data: await listDeleted(db) }),
  );

  app.post<{ Params: PageParams }>(
    "/trash/:id/restore",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Restore a deleted page",
        description:
          "With the child pages deleted along with it, under its old parent (or the home page if that's gone too). A taken slug gets a suffix. Pages that were live go back on the site with the rebuild it queues; restoring one of those needs `content.publish`.",
        tags: ["history"],
        params: PageParams,
        response: { 200: envelope(Page) },
      },
      preHandler: onlyUnpublished,
    },
    async (request) => {
      audited(request, { action: "pageRestored", target: request.params.id });
      await restoreDeleted(db, request.params.id);
      await rebuild();
      return { data: await getPage(db, request.params.id) };
    },
  );

  app.get<{ Params: PageParams }>(
    "/pages/:id/listing",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get a listing page's settings",
        description:
          "Its categories, address pattern, starting blocks and RSS, with its entries counted by status.",
        tags: ["listings"],
        params: PageParams,
        response: { 200: envelope(ListingDetail) },
      },
    },
    async (request) => ({ data: await getListing(db, request.params.id) }),
  );

  app.put<{ Params: PageParams; Body: z.infer<typeof SaveListingBody> }>(
    "/pages/:id/listing",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Save a listing page's settings",
        description:
          "A new address pattern applies to new entries only; existing addresses never change.",
        tags: ["listings"],
        params: PageParams,
        body: SaveListingBody,
        response: { 200: envelope(ListingDetail) },
      },
    },
    async (request) => ({ data: await saveListing(db, request.params.id, request.body.settings) }),
  );

  app.post<{ Params: PageParams }>(
    "/pages/:id/make-listing",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Make a page a listing page",
        description: "It keeps its blocks and gains an entry list. It can't have child pages.",
        tags: ["listings"],
        params: PageParams,
        response: { 200: envelope(Page) },
      },
    },
    async (request) => ({ data: await makeListing(db, request.params.id) }),
  );

  app.get<{ Params: PageParams; Querystring: z.output<typeof EntriesQuery> }>(
    "/pages/:id/entries",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "List a listing page's entries",
        description:
          "Pinned first, then newest first, with search, status and category filters and paging.",
        tags: ["listings"],
        params: PageParams,
        querystring: EntriesQuery,
        response: { 200: envelope(EntryList) },
      },
    },
    async (request) => ({ data: await listEntries(db, request.params.id, request.query) }),
  );

  app.get<{ Querystring: z.output<typeof EntrySearchQuery> }>(
    "/entries",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Search entries",
        description:
          "Entries in every listing whose title or slug contains `search`, newest first, at most `limit`.",
        tags: ["listings"],
        querystring: EntrySearchQuery,
        response: { 200: envelope(z.array(PageSummary)) },
      },
    },
    async (request) => ({
      data: await searchEntries(db, request.query.search, request.query.limit),
    }),
  );

  app.post<{ Params: PageParams; Body: z.infer<typeof CreateEntryBody> }>(
    "/pages/:id/entries",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Write an entry",
        description:
          "A draft under the listing, dated now, starting with the listing's starting blocks.",
        tags: ["listings"],
        params: PageParams,
        body: CreateEntryBody,
        response: { 201: envelope(Page) },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send({ data: await createEntry(db, request.params.id, request.body.title) }),
  );
};
