/**
 * Site settings, navigation, the announcement, site search and the theme: drafted documents, saved
 * here and each made live by its own publish.
 */
import {
  type Navigation,
  NavigationCheck,
  SiteDocName,
  type SiteSettings,
  can,
} from "@fiscal-sb/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AnnouncementDoc,
  DocPublishResult,
  DraftSearchIndex,
  NavigationDoc,
  SaveAnnouncementBody,
  SaveNavigationBody,
  SaveSearchBody,
  SearchDoc,
  PrunePreview,
  PruneQuery,
  SaveSettingsBody,
  SaveThemeBody,
  SettingsDoc,
  ThemeDoc,
  envelope,
} from "../contract.js";
import {
  checkNavigation,
  discardDraft,
  getAnnouncementDoc,
  getNavigationDoc,
  getSearchDoc,
  getSettingsDoc,
  getThemeDoc,
  promoteDrafts,
  readDoc,
  saveAnnouncementDraft,
  saveNavigationDraft,
  saveSearchDraft,
  saveSettingsDraft,
  saveThemeDraft,
} from "../content/site.js";
import { prunePreview } from "../content/history.js";
import { HttpError } from "../errors.js";
import { draftSearchIndex } from "../draft-search.js";
import { searchFileType } from "../search.js";
import type { Db } from "../db/index.js";
import type { Jobs } from "../jobs.js";
import { audited, userOf } from "../auth/guard.js";

/**
 * The live announcement's dates each queue a rebuild, so the bar appears and
 * disappears without anyone pressing Publish. Rebuilds write out what's
 * already live; they never publish a draft.
 */
async function scheduleAnnouncement(app: { db: Db; jobs: Jobs }) {
  await app.db
    .deleteFrom("jobs")
    .where("status", "=", "queued")
    .where("kind", "=", "publish")
    .where("payload", "like", '%"trigger":"announcement"%')
    .where("run_at", "is not", null)
    .execute();
  const a = await readDoc(app.db, "announcement", "published");
  if (!a.on) return;
  const times = [a.from, a.until && new Date(Date.parse(a.until) + 1000).toISOString()];
  for (const runAt of times)
    if (runAt && Date.parse(runAt) > Date.now())
      await app.jobs.enqueue("publish", { trigger: "announcement" }, { runAt });
}

const DraftIndexFile = z.object({ version: z.string(), "*": z.string() });

/** The same services and hosts, in any order. */
const sameEmbeds = (a: SiteSettings["embeds"], b: SiteSettings["embeds"]) =>
  JSON.stringify([a.services.toSorted(), a.hosts.toSorted()]) ===
  JSON.stringify([b.services.toSorted(), b.hosts.toSorted()]);

export const siteRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const drafts = draftSearchIndex(db, (message, error) => app.log.warn({ err: error }, message));

  app.get(
    "/settings",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the site settings",
        description:
          "The draft and the live copy. The draft goes live with `POST /settings/publish`.",
        tags: ["site"],
        response: { 200: envelope(SettingsDoc) },
      },
    },
    async () => ({ data: await getSettingsDoc(db) }),
  );

  app.put<{ Body: z.infer<typeof SaveSettingsBody> }>(
    "/settings",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Save the site settings draft",
        tags: ["site"],
        body: SaveSettingsBody,
        response: { 200: envelope(SettingsDoc) },
      },
    },
    async (request) => {
      // What pages may frame is an Admin's to decide; the rest of the draft is any editor's.
      if (
        !can(userOf(request).role, "site.manage") &&
        !sameEmbeds((await readDoc(db, "settings", "draft")).embeds, request.body.draft.embeds)
      )
        throw new HttpError(
          403,
          "forbidden",
          "Only an Admin can change which sites pages may embed.",
          { needs: "site.manage" },
        );
      return { data: await saveSettingsDraft(db, request.body.draft, request.body.base) };
    },
  );

  app.get<{ Querystring: z.infer<typeof PruneQuery> }>(
    "/settings/prune-preview",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "What keeping fewer revisions would remove",
        description:
          "With `keep` revisions per page: how many older saved drafts would go, across how many pages. They go at each page's next save.",
        tags: ["site"],
        querystring: PruneQuery,
        response: { 200: envelope(PrunePreview) },
      },
    },
    async (request) => ({ data: await prunePreview(db, request.query.keep) }),
  );

  app.post(
    "/settings/discard",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Discard settings changes",
        description: "The draft goes back to the live copy.",
        tags: ["site"],
        response: { 200: envelope(SettingsDoc) },
      },
    },
    async () => {
      await discardDraft(db, "settings");
      return { data: await getSettingsDoc(db) };
    },
  );

  app.get(
    "/navigation",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the navigation",
        description:
          "Navbar and footer: the draft, the live copy, and warnings for links to pages that are deleted or not yet published.",
        tags: ["site"],
        response: { 200: envelope(NavigationDoc) },
      },
    },
    async () => ({ data: await getNavigationDoc(db) }),
  );

  app.put<{ Body: z.infer<typeof SaveNavigationBody> }>(
    "/navigation",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Save the navigation draft",
        tags: ["site"],
        body: SaveNavigationBody,
        response: { 200: envelope(NavigationDoc) },
      },
    },
    async (request) => ({
      data: await saveNavigationDraft(db, request.body.draft, request.body.base),
    }),
  );

  app.post<{ Body: { draft: Navigation } }>(
    "/navigation/check",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Check an unsaved navigation",
        description:
          "The warnings the navigation would have (links to deleted or unpublished pages), without saving it, so the editor can show them as the officer edits.",
        tags: ["site"],
        body: SaveNavigationBody,
        response: { 200: envelope(NavigationCheck) },
      },
    },
    async (request) => ({ data: { warnings: await checkNavigation(db, request.body.draft) } }),
  );

  app.post(
    "/navigation/discard",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Discard navigation changes",
        tags: ["site"],
        response: { 200: envelope(NavigationDoc) },
      },
    },
    async () => {
      await discardDraft(db, "navigation");
      return { data: await getNavigationDoc(db) };
    },
  );

  app.get(
    "/announcement",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the announcement",
        description:
          "The bar under the navbar: the draft, the live copy, and a warning if its link goes to a page that's deleted or not yet published.",
        tags: ["site"],
        response: { 200: envelope(AnnouncementDoc) },
      },
    },
    async () => ({ data: await getAnnouncementDoc(db) }),
  );

  app.put<{ Body: z.infer<typeof SaveAnnouncementBody> }>(
    "/announcement",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Save the announcement draft",
        tags: ["site"],
        body: SaveAnnouncementBody,
        response: { 200: envelope(AnnouncementDoc) },
      },
    },
    async (request) => ({
      data: await saveAnnouncementDraft(db, request.body.draft, request.body.base),
    }),
  );

  app.post(
    "/announcement/discard",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Discard announcement changes",
        tags: ["site"],
        response: { 200: envelope(AnnouncementDoc) },
      },
    },
    async () => {
      await discardDraft(db, "announcement");
      return { data: await getAnnouncementDoc(db) };
    },
  );

  app.get(
    "/search",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get site search",
        description:
          "Search on the published site: the draft, the live copy, and warnings for pinned results whose page is deleted or not yet published.",
        tags: ["site"],
        response: { 200: envelope(SearchDoc) },
      },
    },
    async () => ({ data: await getSearchDoc(db) }),
  );

  app.put<{ Body: z.infer<typeof SaveSearchBody> }>(
    "/search",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Save the site search draft",
        description: "A word pinned to more than one page stays with the first.",
        tags: ["site"],
        body: SaveSearchBody,
        response: { 200: envelope(SearchDoc) },
      },
    },
    async (request) => ({ data: await saveSearchDraft(db, request.body.draft, request.body.base) }),
  );

  app.post(
    "/search/discard",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Discard site search changes",
        tags: ["site"],
        response: { 200: envelope(SearchDoc) },
      },
    },
    async () => {
      await discardDraft(db, "search");
      return { data: await getSearchDoc(db) };
    },
  );

  app.get(
    "/search/drafts",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the draft search index",
        description:
          "Site search over every page's draft, for trying search before publishing: built when asked for, and again only after a draft changes. Its Pagefind files are under `/search/drafts/{version}/`; `pages` gives each indexed address's status. Pages that redirect or are hidden from search engines are left out, as on the published site.",
        tags: ["site"],
        response: { 200: envelope(DraftSearchIndex) },
      },
    },
    async () => {
      const { version, pages } = await drafts.current();
      return { data: { version, pages } };
    },
  );

  app.get<{ Params: z.infer<typeof DraftIndexFile> }>(
    "/search/drafts/:version/*",
    {
      // Pagefind's files are gzip data already: compressing would only mislabel them
      // (see the note on @fastify/compress in app.ts).
      compress: false,
      config: { access: "signedIn" },
      schema: { hide: true, params: DraftIndexFile },
    },
    async (request, reply) => {
      const { version, "*": path } = request.params;
      const file = drafts.file(version, path);
      if (!file) throw new HttpError(404, "not_found", "No such file in the draft search index");
      // A version's files never change; another officer's draft makes a new version.
      return reply
        .type(searchFileType(path))
        .header("cache-control", "private, max-age=86400, immutable")
        .send(Buffer.from(file));
    },
  );

  app.get(
    "/theme",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the theme",
        description:
          "The site's colours: the draft, the live copy, and what was live before the last publish.",
        tags: ["site"],
        response: { 200: envelope(ThemeDoc) },
      },
    },
    async () => ({ data: await getThemeDoc(db) }),
  );

  app.put<{ Body: z.infer<typeof SaveThemeBody> }>(
    "/theme",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Save the theme draft",
        description:
          "A preset or one colour. The server makes the primary ramp from it, darkening the steps links, buttons and focus rings use until they meet WCAG AA, and stores both.",
        tags: ["site"],
        body: SaveThemeBody,
        response: { 200: envelope(ThemeDoc) },
      },
    },
    async (request) => ({ data: await saveThemeDraft(db, request.body.draft, request.body.base) }),
  );

  app.post(
    "/theme/discard",
    {
      config: { access: "content.edit", tokenScope: "site" },
      schema: {
        summary: "Discard theme changes",
        tags: ["site"],
        response: { 200: envelope(ThemeDoc) },
      },
    },
    async () => {
      await discardDraft(db, "theme");
      return { data: await getThemeDoc(db) };
    },
  );

  /** Makes one document's draft live and rebuilds the site; nothing else goes with it. */
  const publishDoc = async (name: SiteDocName) => {
    await promoteDrafts(db, [name]);
    const job = await app.jobs.enqueue("publish", { trigger: name });
    if (name === "announcement") await scheduleAnnouncement(app);
    return { data: { job } };
  };

  for (const name of SiteDocName.options)
    app.post(
      `/${name}/publish`,
      {
        config: { access: "content.publish", tokenScope: "site" },
        schema: {
          summary: `Publish the ${name}`,
          description: `Makes the ${name} draft live and queues a rebuild. Pages and the other site documents stay as they are.${
            name === "announcement"
              ? " Its show-from and hide-after dates queue rebuilds at those times."
              : ""
          }`,
          tags: ["site"],
          response: { 202: envelope(DocPublishResult) },
        },
      },
      async (request, reply) => {
        audited(request, { action: "published", target: name });
        return reply.status(202).send(await publishDoc(name));
      },
    );
};
