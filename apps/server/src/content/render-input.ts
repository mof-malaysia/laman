/**
 * Everything the renderer needs for one page, from its content: the site
 * around it, its media, and for listings, entries and latest-entries blocks
 * the entries they show. The canvas, preview and publisher all build it here.
 */
import {
  type Locale,
  PageContent,
  type PageDocument,
  type RenderInput,
  type RenderMode,
  defaultLocale,
  withDefaults,
} from "@fiscal-sb/blocks";
import type { Db } from "../db/index.js";
import { entryRender, latestRender, listingRender, upcomingRender } from "./entries.js";
import type { Loads } from "./loads.js";
import { mediaInfo } from "./media.js";
import { type SiteDraft, siteContext } from "./site.js";
import { breadcrumbOf } from "./tree.js";

export async function renderInputFor(
  db: Db,
  options: {
    pageId: string;
    kind: "page" | "listing" | "entry";
    path: string;
    doc: PageDocument;
    /** The content to show; the document's BM content by default. */
    content?: PageContent;
    mode: RenderMode;
    scope: "draft" | "published";
    locale?: Locale;
    siteUrl?: string | undefined;
    noindex?: boolean;
    unsaved?: SiteDraft;
    /** Listing pages: which page of entries, and which category. */
    listingPage?: number;
    category?: string;
    /** Event calendars: which location, and which month (YYYY-MM). */
    location?: string;
    month?: string;
    /** A publish's shared reads, so each address doesn't load the site again. */
    loads?: Loads;
    /** A page that isn't stored (the colour sample): its upcoming events, given instead of read. */
    upcoming?: RenderInput["upcoming"];
    /** The colour sample: the buttons, links and tags in their states after the blocks. */
    specimen?: true;
  },
): Promise<RenderInput> {
  const rest = options;
  const content = withDefaults(PageContent, rest.content ?? rest.doc.ms);
  const doc = { ...rest.doc, ms: content };
  // Only a Page intro shows the trail: other pages stay out of their ancestors' renames.
  const [site, media, latest, upcoming, breadcrumb] = await Promise.all([
    siteContext(db, rest.scope, rest.path, rest.siteUrl, rest.unsaved, rest.loads),
    mediaInfo(db, [content, doc.entry]),
    latestRender(db, doc, rest.scope, rest.loads),
    rest.upcoming ?? upcomingRender(db, doc, rest.scope, rest.loads),
    content.blocks.some((b) => b.type === "pageIntro")
      ? breadcrumbOf(db, { id: rest.pageId }, content.title, rest.loads)
      : undefined,
  ]);
  const listing =
    rest.kind === "listing"
      ? await listingRender(db, rest.pageId, doc, rest.scope, {
          ...(rest.listingPage && { page: rest.listingPage }),
          ...(rest.category && { category: rest.category }),
          ...(rest.location && { location: rest.location }),
          ...(rest.month && { month: rest.month }),
          loads: rest.loads,
        })
      : undefined;
  const entry =
    rest.kind === "entry" ? await entryRender(db, rest.pageId, doc, rest.loads) : undefined;
  return {
    mode: rest.mode,
    locale: rest.locale ?? defaultLocale,
    pageId: rest.pageId,
    path: rest.path,
    page: content,
    site,
    media,
    ...(rest.noindex && { noindex: true }),
    ...(listing && { listing }),
    ...(entry && { entry }),
    ...(Object.keys(latest).length && { latest }),
    ...(Object.keys(upcoming).length && { upcoming }),
    ...(breadcrumb && { breadcrumb }),
    ...(rest.specimen && { specimen: true }),
  };
}
