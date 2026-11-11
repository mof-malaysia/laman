/** Pages: a title and a tree (for now, a list) of blocks, per language. */
import { z } from "zod";
import type { EmbedRules } from "./blocks/embed.js";
import type { featureIcons } from "./blocks/feature-grid.js";
import { Block } from "./registry.js";
import type { Ramp } from "./theme.js";

export const locales = ["ms", "en"] as const;
export const Locale = z.enum(locales);
export type Locale = z.infer<typeof Locale>;
/** BM is the default language of every site. */
export const defaultLocale: Locale = "ms";

/** Site search's page and its index, at the root of the published site. */
export const SEARCH_PATH = "/carian";
export const SEARCH_INDEX_DIR = "pagefind";
/**
 * Addresses the published site has that aren't pages in the tree: search and
 * its index, the media files pages use, the renderer's files, the 404 page
 * and the sitemap. A listing's later and category pages and its feed sit
 * under the listing's own address.
 */
export const SYSTEM_PATHS = [
  SEARCH_PATH,
  `/${SEARCH_INDEX_DIR}`,
  "/media",
  "/_astro",
  "/404.html",
  "/sitemap.xml",
] as const;

export const PageContent = z.object({
  title: z.string().max(160),
  /** The meta description: search results and link previews. */
  description: z.string().max(160).optional(),
  blocks: z.array(Block).max(100),
});
export type PageContent = z.infer<typeof PageContent>;

export const RedirectStatus = z.union([z.literal(301), z.literal(302)]);
export type RedirectStatus = z.infer<typeof RedirectStatus>;

/**
 * Sends visitors of a page somewhere else: another page (by id, so it follows
 * renames and moves) or another website. 301 for good, 302 for a while.
 */
export const PageRedirect = z.discriminatedUnion("to", [
  z.object({ to: z.literal("page"), pageId: z.uuid(), status: RedirectStatus }),
  z.object({
    to: z.literal("url"),
    url: z.url({ protocol: /^https$/, error: "Enter a web address starting with https://" }),
    status: RedirectStatus,
  }),
]);
export type PageRedirect = z.infer<typeof PageRedirect>;

/** How search engines treat the page, in every language. */
export const PageSeo = z.object({
  noindex: z.boolean().optional(),
  /** false leaves the page out of sitemap.xml. */
  sitemap: z.boolean().optional(),
});
export type PageSeo = z.infer<typeof PageSeo>;

/** Where an event entry came from, when a sync wrote it: the system, the calendar and the event's id there. */
export const EventSource = z.object({
  system: z.string().trim().min(1).max(40),
  calendar: z.string().trim().min(1).max(200),
  id: z.string().trim().min(1).max(400),
});
export type EventSource = z.infer<typeof EventSource>;

/**
 * An entry that is an event: when and where. Times carry their offset; an
 * all-day event runs on the days its start and end fall on in Malaysia.
 */
export const EntryEvent = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }).optional(),
    allDay: z.boolean().optional(),
    /** One of the listing's location slugs. */
    location: z.string().max(80).optional(),
    /** The room or address, as people read it. */
    venue: z.string().max(200).optional(),
    /** Set only on synced events: they're changed in their calendar, not here. */
    source: EventSource.optional(),
  })
  .refine((e) => !e.end || Date.parse(e.end) >= Date.parse(e.start), {
    message: "The event ends before it starts",
    path: ["end"],
  });
export type EntryEvent = z.infer<typeof EntryEvent>;

/**
 * The fixed fields of an entry (an article or notice under a listing page).
 * They're part of its draft, so they publish and roll back with it.
 */
export const EntryFields = z.object({
  /** When it goes live; a future time schedules it. */
  publishAt: z.iso.datetime({ offset: true }),
  /** One of the listing's category slugs. */
  category: z.string().max(80).optional(),
  /** Used on the listing, in search results and in RSS. */
  summary: z.string().max(200).optional(),
  cover: z.object({ mediaId: z.uuid(), alt: z.string().max(250).optional() }).optional(),
  /** Shown first in the listing; for events, featured (the upcoming events block can show only these). */
  pinned: z.boolean().optional(),
  /** An event's date, time and place: the event calendar and upcoming events read it. */
  event: EntryEvent.optional(),
});
export type EntryFields = z.infer<typeof EntryFields>;

/** A named choice with an address: a listing's category or an event location. */
const SlugName = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens"),
  name: z.string().trim().min(1).max(60),
});

/** A listing page's settings: its entries' categories, addresses, starting blocks and feed. */
export const ListingSettings = z.object({
  categories: z.array(SlugName).max(30),
  /** Where its events happen, for the event calendar's location filter. */
  locations: z.array(SlugName).max(20).default([]),
  /** "publishAt": newest first. "eventStart": coming events soonest first, then past ones. */
  sort: z.enum(["publishAt", "eventStart"]).default("publishAt"),
  /** "slug": /berita/tajuk. "year": /berita/2026/tajuk. New entries only. */
  addressPattern: z.enum(["slug", "year"]),
  /** The block types a new entry starts with. */
  startingBlocks: z.array(z.string()).max(10),
  rss: z.boolean(),
});
export type ListingSettings = z.infer<typeof ListingSettings>;

export const defaultListingSettings = (): ListingSettings => ({
  categories: [],
  locations: [],
  sort: "publishAt",
  addressPattern: "slug",
  startingBlocks: ["prose"],
  rss: true,
});

/**
 * A page's draft or published revision: its content in each language (BM is
 * required; EN is optional) and the settings that publish with it.
 */
export const PageDocument = z.object({
  ms: PageContent,
  en: PageContent.optional(),
  seo: PageSeo.optional(),
  redirect: PageRedirect.nullable().optional(),
  /** Entries only. */
  entry: EntryFields.optional(),
});
export type PageDocument = z.infer<typeof PageDocument>;

/**
 * Stored content with its schema's defaults filled in: blocks saved before a
 * field existed get the value they render with. Content that no longer
 * parses is returned as it is, for the caller's own checks to report.
 */
export function withDefaults<T>(schema: z.ZodType<T>, value: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : value;
}

/** One level of a page's address: its parent's path, then "/", then this. */
export const Slug = z
  .string()
  .min(1, "Enter an address for the page")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use only lower-case letters, numbers and hyphens");

/** A slug from a title: "Soalan Lazim (FAQ)" → "soalan-lazim-faq". */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export const RenderMode = z.enum(["edit", "preview", "publish"]);
export type RenderMode = z.infer<typeof RenderMode>;

/** A resolved link: page targets are already paths. */
export type SiteLink = {
  label: string;
  href: string;
  description?: string;
  icon?: (typeof featureIcons)[number];
};

/** A navbar item: a link, or a dropdown in one of three styles. */
export type SiteNavItem = {
  label: string;
  href?: string;
  /** List and Described dropdowns. */
  children?: SiteLink[];
  /** Grouped dropdowns. */
  groups?: { title: string; links: SiteLink[] }[];
  columns?: 1 | 2 | 3;
  feature?: {
    href: string;
    title: string;
    description?: string;
    eyebrow?: string;
    linkLabel?: string;
  };
  footer?: { label: string; href: string };
};

/** The site around every page, from the settings and navigation. */
export type SiteContext = {
  name: string;
  /** The masthead and footer owner. */
  agency: string;
  logo?: { src: string; alt: string };
  /** The navbar shows the logo alone, named by the site name for screen readers. Only with a logo. */
  hideNavbarName?: true;
  /** The footer leaves the logo out. */
  hideFooterLogo?: true;
  favicon?: string;
  socialImage?: string;
  nav: SiteNavItem[];
  /** Only when it shows on this page, now. */
  announcement?: {
    tag: string;
    variant: "primary" | "warning" | "danger" | "success" | "default";
    message: string;
    link?: { label: string; href: string };
  };
  footer: { title: string; links: { label: string; href: string }[] }[];
  contact: { address: string; phone: string; email: string; hours: string };
  social: { platform: string; url: string }[];
  phase?: { phase: "alpha" | "beta"; feedbackUrl?: string };
  /** Ask search engines to leave the whole site out. */
  hideSite?: boolean;
  /** Site search is on: the navbar links to SEARCH_PATH. */
  search?: true;
  /** SITE_URL, for canonical and social links. */
  url?: string;
  /** What the Embed block may frame (Settings, Embeds): built-in services switched on and the site's own hosts. */
  embeds: EmbedRules;
  /** Count visitors: the layout writes the analytics beacon into pages it publishes. */
  analytics?: boolean;
  /** The site's colours: FTDS Blue unless the agency chose its own. */
  theme: { primary: Ramp };
};

/** A media file as the renderer needs it: where it is, its alt text and its sizes. */
export type MediaInfo = {
  url: string;
  alt: string;
  /** Who made it, shown under the image. */
  credit: string;
  /** For downloads: the file's name, MIME type and size in bytes. */
  filename: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Narrower copies for srcset, smallest first. */
  variants: { url: string; width: number }[];
};

/** Every use of a media file in a value (block media fields and settings alike), with the alt text given for that use. */
export function mediaUsesOf(
  value: unknown,
  out: { mediaId: string; alt?: string }[] = [],
): { mediaId: string; alt?: string }[] {
  if (Array.isArray(value)) for (const item of value) mediaUsesOf(item, out);
  else if (value && typeof value === "object") {
    const node = value as { mediaId?: unknown; alt?: unknown };
    if (typeof node.mediaId === "string")
      out.push({ mediaId: node.mediaId, ...(typeof node.alt === "string" && { alt: node.alt }) });
    else for (const item of Object.values(value)) mediaUsesOf(item, out);
  }
  return out;
}

/** Every media id in a value: block media fields and settings alike. */
export function mediaIdsOf(value: unknown, out = new Set<string>()): Set<string> {
  for (const use of mediaUsesOf(value)) out.add(use.mediaId);
  return out;
}

/** A link in a block: its address, and the words it's shown with when there are any. */
export type LinkUse = { href: string; text?: string | undefined };

/**
 * Every link in a value: `href`-like fields (`href`, `sourceHref`) with their
 * label, and rich-text links with the words they're on.
 */
export function linksOf(value: unknown, out: LinkUse[] = []): LinkUse[] {
  if (Array.isArray(value)) for (const item of value) linksOf(item, out);
  else if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    // A rich-text run: its link mark carries the address, the run the words.
    if (node.type === "text" && Array.isArray(node.marks)) {
      const mark = (node.marks as { type?: string; attrs?: { href?: unknown } }[]).find(
        (m) => m.type === "link",
      );
      if (typeof mark?.attrs?.href === "string")
        out.push({ href: mark.attrs.href, text: String(node.text ?? "") });
      return out;
    }
    for (const [key, item] of Object.entries(node)) {
      if (/href$/i.test(key) && typeof item === "string") {
        const text = node.label ?? node.title ?? node.text;
        out.push({ href: item, text: typeof text === "string" ? text : undefined });
      } else linksOf(item, out);
    }
  }
  return out;
}

/** One entry as a listing shows it. */
export type EntryItem = {
  title: string;
  href: string;
  /** ISO date-time it was published at. */
  date: string;
  category?: string;
  /** The category's address, for filtering. */
  categorySlug?: string;
  summary?: string;
  image?: string;
  pinned?: boolean;
  /** An event entry: when and where, with its location's name. */
  event?: {
    start: string;
    end?: string;
    allDay?: boolean;
    location?: string;
    locationSlug?: string;
    venue?: string;
  };
};

/**
 * What an event calendar shows on this address: one month, perhaps filtered.
 * The listing's own address shows the current month.
 */
export type CalendarRender = {
  /**
   * The day it was published, in Malaysia: YYYY-MM-DD. Only on the current
   * month and the months either side, so other months' pages don't change
   * every day.
   */
  today?: string;
  /** The month shown: YYYY-MM. */
  month: string;
  /** The current month under the same filter, when another month is shown. */
  thisMonth?: string;
  /** The category or location this address filters by. */
  filter?: { kind: "category" | "location"; slug: string };
  /** The same month unfiltered, and filtered by each category and location. */
  all: string;
  categories: { slug: string; name: string; href: string }[];
  locations: { slug: string; name: string; href: string }[];
  /** Every month with a page, oldest first: YYYY-MM. */
  months: string[];
  /** The month pages either side, when there are any. */
  prev?: { month: string; href: string };
  next?: { month: string; href: string };
  /** The events on any of the month's days, soonest first. */
  items: EntryItem[];
  /** How many of the month's events each filter would show, unfiltered otherwise. */
  counts: { all: number; categories: Record<string, number>; locations: Record<string, number> };
};

/** The entries an entry list shows on this page of its listing. */
export type ListingRender = {
  path: string;
  categories: { slug: string; name: string; href: string }[];
  /** The category this page filters by, if any. */
  category?: string;
  items: EntryItem[];
  page: number;
  pages: number;
  rss?: string;
  /** A listing with an event calendar: what it shows on this address. */
  calendar?: CalendarRender;
};

/** What an entry's article layout draws above its blocks. */
export type EntryRender = {
  date: string;
  /** Its listing's title: the collection site search files it under. */
  collection: string;
  category?: string;
  cover?: { src: string; alt: string };
  breadcrumb: { label: string; href?: string }[];
  /** An event entry: the header gives its time and place instead of the publish date. */
  event?: NonNullable<EntryItem["event"]>;
};

/** What the renderer is given for one page. */
export type RenderInput = {
  mode: RenderMode;
  locale: Locale;
  /** The page's id, for its analytics. */
  pageId?: string;
  /** Path of the page on the published site, e.g. "/" or "/perkhidmatan". */
  path: string;
  page: PageContent;
  site: SiteContext;
  /** Ask search engines not to index the page. Never indexed outside "publish". */
  noindex?: boolean;
  /** The media the page uses, by id. */
  media?: Record<string, MediaInfo>;
  /** A listing page: the entries its entry list shows. */
  listing?: ListingRender;
  /** An entry: its article header. */
  entry?: EntryRender;
  /** Latest entries blocks: the newest entries of each listing they name, by its page id. */
  latest?: Record<string, { path: string; items: EntryItem[] }>;
  /** Upcoming events blocks: each listing's coming events, soonest first, by its page id. */
  upcoming?: Record<string, { path: string; today: string; items: EntryItem[] }>;
  /** The SEARCH_PATH page: the search form and its results, instead of blocks. */
  searchPage?: { filters: boolean };
  /** The trail from the home page to this one, for a Page intro block. Absent on the home page. */
  breadcrumb?: { label: string; href?: string }[];
  /** The published site's 404 page (NOT_FOUND_FILE): FTDS StatusPage in the site layout, instead of blocks. */
  notFound?: true;
};

/** The published site's page for addresses it doesn't have, at its root. */
export const NOT_FOUND_FILE = "404.html";

/** Path on the published site for the slugs from the home page down: [] is the home page. */
export const pathOf = (slugs: string[]) => (slugs.length ? `/${slugs.join("/")}` : "/");
