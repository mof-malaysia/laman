/**
 * Everything the renderer needs for one page, from its content: the site
 * around it, its media, and for listings, entries and latest-entries blocks
 * the entries they show. The canvas, preview and publisher all build it here.
 */
import {
  type Locale,
  type PageContent,
  type PageDocument,
  type RenderInput,
  type RenderMode,
  defaultLocale,
} from "@fiscal-sb/blocks";
import type { Db } from "../db/index.js";
import { entryRender, latestRender, listingRender } from "./entries.js";
import type { Loads } from "./loads.js";
import { mediaInfo } from "./media.js";
import { type SiteDraft, siteContext } from "./site.js";

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
    /** A publish's shared reads, so each address doesn't load the site again. */
    loads?: Loads;
  },
): Promise<RenderInput> {
  const rest = options;
  const content = rest.content ?? rest.doc.ms;
  const doc = { ...rest.doc, ms: content };
  const [site, media, latest] = await Promise.all([
    siteContext(db, rest.scope, rest.path, rest.siteUrl, rest.unsaved, rest.loads),
    mediaInfo(db, [content, doc.entry]),
    latestRender(db, doc, rest.scope, rest.loads),
  ]);
  const listing =
    rest.kind === "listing"
      ? await listingRender(db, rest.pageId, doc, rest.scope, {
          ...(rest.listingPage && { page: rest.listingPage }),
          ...(rest.category && { category: rest.category }),
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
  };
}
