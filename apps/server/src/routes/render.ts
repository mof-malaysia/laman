/**
 * The canvas and preview: a page's draft rendered by the renderer. `edit`
 * adds the data-ftds-block / data-ftds-field hooks the editor uses. Also the
 * live home page, as visitors see it, for the dashboard's thumbnail.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  collectionSettings,
  defaultLocale,
  EntryFields,
  Locale,
  PageContent,
  templateById,
} from "@fiscal-sb/blocks";
import { Announcement, Navigation, PageTemplate, ThemeChoice } from "@fiscal-sb/contracts";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { PageParams } from "../contract.js";
import { listingRenderOf, parseListingSettings } from "../content/entries.js";
import { getDeleted } from "../content/history.js";
import { getPage } from "../content/pages.js";
import { renderInputFor } from "../content/render-input.js";
import type { SiteDraft } from "../content/site.js";
import { HttpError } from "../errors.js";
import { renderHtml } from "../render.js";

const DraftMode = z.enum(["edit", "preview"]);
const RenderQuery = z.object({
  mode: DraftMode.default("preview"),
  locale: Locale.default(defaultLocale),
});
const RenderBody = z.object({
  mode: DraftMode.default("edit"),
  locale: Locale.default(defaultLocale),
  page: PageContent,
  /** An entry's unsaved fixed fields, for its article header. */
  entry: EntryFields.optional(),
});
const TemplateParams = z.object({ template: PageTemplate });
const TemplateQuery = z.object({
  title: z.string().max(160).default(""),
  path: z.string().max(400).default("/"),
});

/** Rendered drafts are never cached: the next look must show the latest change. */
const sendHtml = (reply: FastifyReply, html: string) =>
  reply.type("text/html; charset=utf-8").header("cache-control", "no-store").send(html);

export const renderRoutes: FastifyPluginAsync<{ publicDir: string }> = async (
  app,
  { publicDir },
) => {
  const { db } = app;

  // The published home page, under /render so the admin reaches it on every
  // setup (in development its proxy doesn't pass the site's root through).
  app.get(
    "/live",
    {
      config: { access: "signedIn" },
      schema: { hide: true },
    },
    async (_request, reply) => {
      if (!existsSync(join(publicDir, "index.html")))
        throw new HttpError(404, "not_published", "Nothing is published yet");
      return reply.header("cache-control", "no-store").sendFile("index.html", publicDir);
    },
  );

  app.get<{ Params: PageParams; Querystring: z.infer<typeof RenderQuery> }>(
    "/pages/:id",
    {
      config: { access: "signedIn" },
      schema: { hide: true, params: PageParams, querystring: RenderQuery },
    },
    async (request, reply) => {
      const page = await getPage(db, request.params.id);
      const { mode, locale } = request.query;
      const html = await renderHtml(
        await renderInputFor(db, {
          pageId: page.id,
          kind: page.kind,
          path: page.path,
          doc: page.draft,
          content: page.draft[locale] ?? page.draft.ms,
          mode,
          locale,
          scope: "draft",
        }),
      );
      return sendHtml(reply, html);
    },
  );

  // A deleted page's last draft, so it can be looked at before it's restored.
  app.get<{ Params: PageParams }>(
    "/trash/:id",
    {
      config: { access: "signedIn" },
      schema: { hide: true, params: PageParams },
    },
    async (request, reply) => {
      const page = await getDeleted(db, request.params.id);
      // A deleted listing has no live settings to look up, and its entries went with it.
      const listing = page.kind === "listing";
      const input = await renderInputFor(db, {
        pageId: page.id,
        kind: listing ? "page" : page.kind,
        path: page.path,
        doc: page.draft,
        mode: "preview",
        scope: "draft",
        noindex: true,
      });
      const html = await renderHtml(
        listing
          ? {
              ...input,
              listing: listingRenderOf(
                parseListingSettings(page.listing),
                page.path,
                page.draft,
                [],
              ),
            }
          : input,
      );
      return sendHtml(reply, html);
    },
  );

  // Unsaved content from the editor, so the canvas updates before the save lands.
  app.post<{ Params: PageParams; Body: z.infer<typeof RenderBody> }>(
    "/pages/:id",
    {
      config: { access: "signedIn" },
      schema: { hide: true, params: PageParams, body: RenderBody },
    },
    async (request, reply) => {
      const page = await getPage(db, request.params.id);
      const { mode, locale, entry } = request.body;
      const html = await renderHtml(
        await renderInputFor(db, {
          pageId: page.id,
          kind: page.kind,
          path: page.path,
          doc: { ...page.draft, ...(entry && { entry }) },
          content: request.body.page,
          mode,
          locale,
          scope: "draft",
        }),
      );
      return sendHtml(reply, html);
    },
  );

  // A page with an unsaved navigation, announcement or theme around it: those editors'
  // previews, links resolved as the live site will show them.
  app.post<{ Params: PageParams; Body: SiteDraft }>(
    "/pages/:id/site",
    {
      config: { access: "signedIn" },
      schema: {
        hide: true,
        params: PageParams,
        body: z.object({
          navigation: Navigation.optional(),
          announcement: Announcement.optional(),
          theme: ThemeChoice.optional(),
        }),
      },
    },
    async (request, reply) => {
      const page = await getPage(db, request.params.id);
      const html = await renderHtml(
        await renderInputFor(db, {
          pageId: page.id,
          kind: page.kind,
          path: page.path,
          doc: page.draft,
          mode: "preview",
          scope: "draft",
          unsaved: request.body,
        }),
      );
      return sendHtml(reply, html);
    },
  );

  // A template as a new page would start, before it exists: the new-page flow's preview.
  app.get<{ Params: z.infer<typeof TemplateParams>; Querystring: z.infer<typeof TemplateQuery> }>(
    "/templates/:template",
    {
      config: { access: "signedIn" },
      schema: { hide: true, params: TemplateParams, querystring: TemplateQuery },
    },
    async (request, reply) => {
      const id = request.params.template;
      const template = templateById(id);
      const { title, path } = request.query;
      const doc = { ms: { title, blocks: template.blocks(title) } };
      const input = await renderInputFor(db, {
        pageId: "",
        kind: "page",
        path,
        doc,
        mode: "preview",
        scope: "draft",
        noindex: true,
      });
      // A collection shows example entries.
      const examples = [1, 2, 3].map((n) => ({
        title: `Contoh entri ${n}`,
        href: `${path === "/" ? "" : path}/contoh-${n}`,
        date: new Date(Date.now() - n * 86_400_000).toISOString(),
        summary: "Ringkasan pendek yang muncul di bawah tajuk dalam senarai.",
      }));
      const html = await renderHtml(
        template.listing
          ? {
              ...input,
              listing: listingRenderOf(collectionSettings(id), path, doc, examples),
            }
          : input,
      );
      return sendHtml(reply, html);
    },
  );
};
