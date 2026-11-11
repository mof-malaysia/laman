/**
 * The wire contract shared by the server and the admin. Each schema is both a
 * runtime validator (Zod) and a type; the server also turns them into its
 * OpenAPI document.
 */
import {
  EntryFields,
  ListingSettings,
  PageDocument,
  PageRedirect,
  Slug,
  templateIds,
} from "@fiscal-sb/blocks";
import { z } from "zod";
import { SiteDocName, savable } from "./site.js";

export * from "./agents.js";
export * from "./analytics.js";
export * from "./auth.js";
export * from "./preferences.js";
export * from "./site.js";

/** Every successful response wraps its payload in `data`. */
export const envelope = <T extends z.ZodType>(data: T) => z.object({ data });

export const Id = z.uuid();

export const PageParams = z.object({ id: Id });
export type PageParams = z.infer<typeof PageParams>;

/**
 * draft: never published (or unpublished since). changed: published, with a
 * newer draft. published: the draft is what's live. scheduled: an entry
 * published with a date still to come.
 */
export const PageStatus = z.enum(["draft", "changed", "published", "scheduled"]);
export type PageStatus = z.infer<typeof PageStatus>;

/**
 * The search index of every page's draft (`GET /api/search/drafts`), for trying
 * search before anything is published. Its files are under
 * `/api/search/drafts/{version}/`; `pages` gives each indexed address's status.
 */
export const DraftSearchIndex = z.object({
  version: z.string(),
  pages: z.record(z.string(), PageStatus),
});
export type DraftSearchIndex = z.infer<typeof DraftSearchIndex>;

export const PageSummary = z.object({
  id: Id,
  /** null for the home page, the root of the tree. */
  parentId: Id.nullable(),
  /** Order among its siblings, from 0. */
  position: z.number().int(),
  /** The last level of the address; "" for the home page. */
  slug: z.string(),
  /** The full address on the site, following the tree: "/perkhidmatan/zakat". */
  path: z.string(),
  title: z.string(),
  status: PageStatus,
  kind: z.enum(["page", "listing", "entry"]),
  /** Listing pages: how many entries they hold. */
  entryCount: z.number().int().optional(),
  /** The template it started from, if known. */
  template: z.string().nullable(),
  /** The draft's redirect, if it has one. */
  redirect: PageRedirect.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  /** The draft differs from the published revision (or was never published). */
  hasUnpublishedChanges: z.boolean(),
  /** Who last saved the draft; null before there were accounts. */
  editedBy: z.string().nullable(),
});
export type PageSummary = z.infer<typeof PageSummary>;

export const Page = PageSummary.extend({
  draft: PageDocument,
  /** Changes whenever the draft does: send it back as a save's `base`. */
  draftVersion: z.string(),
});
export type Page = z.infer<typeof Page>;

export const PageTemplate = z.enum(templateIds);
export type PageTemplate = z.infer<typeof PageTemplate>;

export const CreatePageBody = z.object({
  title: z.string().trim().min(1, "Enter a page title").max(160),
  slug: Slug,
  /** Defaults to the home page. */
  parentId: Id.optional(),
  template: PageTemplate.default("blank"),
});
export type CreatePageBody = z.input<typeof CreatePageBody>;

/**
 * `base` is the `draftVersion` the edit started from. When someone else has
 * saved since, the save is refused with 409 `draft_conflict` (`DraftConflict`
 * in `details`) instead of overwriting them; without it, the save always wins.
 */
export const SaveDraftBody = savable(PageDocument);
export type SaveDraftBody = z.infer<typeof SaveDraftBody>;

/**
 * The `details` of a 409 `draft_conflict`: who saved the draft in between,
 * when, and its version now, to save from to replace it ("keep mine").
 */
export const DraftConflict = z.object({
  by: z.string().nullable(),
  at: z.string().nullable(),
  version: z.string(),
});
export type DraftConflict = z.infer<typeof DraftConflict>;

/** What the check before publishing looks at (`GET /pages/checks`): see docs/site-builder.md § Checks before publishing. */
export const PageCheckCode = z.enum([
  "noHeading",
  "altMissing",
  "altFilename",
  "linkNotLive",
  "linkMissing",
  "placeholder",
  "vagueLink",
]);
export type PageCheckCode = z.infer<typeof PageCheckCode>;

export const PageCheck = z.object({
  code: PageCheckCode,
  /** `block` stops the page going live until it's fixed; `warn` can be published past. */
  severity: z.enum(["block", "warn"]),
  /** The block it's in, so the editor can select it; null for the page as a whole. */
  blockId: z.string().nullable(),
  /** What it's about, as the page has it: the alt text, the address, the link or leftover text. */
  subject: z.string().optional(),
});
export type PageCheck = z.infer<typeof PageCheck>;

/** Each page's checks, by id. */
export const PageChecks = z.record(z.string(), z.array(PageCheck));
export type PageChecks = z.infer<typeof PageChecks>;

/** The pages to check: ids separated by commas, up to 200. */
export const PageChecksQuery = z.object({
  ids: z
    .string()
    .regex(
      /^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,199}$/,
      "Give up to 200 page ids, separated by commas",
    ),
});

/** An address that a change moves from one path to another. */
export const PathChange = z.object({
  id: Id,
  title: z.string(),
  from: z.string(),
  to: z.string(),
  /** The page is live, so visitors and links use the old address. */
  published: z.boolean(),
});
export type PathChange = z.infer<typeof PathChange>;

export const MovePageBody = z.object({
  /** The new parent. Leave out to stay under the same one. */
  parentId: Id.optional(),
  /** Position among the new siblings, from 0. Leave out to go last (or stay put). */
  position: z.number().int().min(0).optional(),
  slug: Slug.optional(),
  /** Redirect the old addresses of published pages to their new ones. */
  redirect: z.boolean().default(false),
  /** Report the changes without saving them. */
  dryRun: z.boolean().default(false),
});
export type MovePageBody = z.input<typeof MovePageBody>;

export const MoveResult = z.object({
  page: PageSummary,
  changes: z.array(PathChange),
});
export type MoveResult = z.infer<typeof MoveResult>;

export const DuplicatePageBody = z.object({
  includeChildren: z.boolean().default(false),
});
export type DuplicatePageBody = z.input<typeof DuplicatePageBody>;

export const UnpublishPageBody = z.object({
  /** Send visitors of the page's address to this page instead. */
  redirectTo: Id.optional(),
});
export type UnpublishPageBody = z.infer<typeof UnpublishPageBody>;

export const DeletePageQuery = z.object({
  /** What happens to child pages: deleted too, or moved up a level. Required when there are any. */
  children: z.enum(["delete", "lift"]).optional(),
  redirectTo: Id.optional(),
});
export type DeletePageQuery = z.infer<typeof DeletePageQuery>;

export const PageRef = z.object({ id: Id, title: z.string(), path: z.string() });
export type PageRef = z.infer<typeof PageRef>;

/** What deleting a page would touch, for the confirm dialog. */
export const DeletePreview = z.object({
  published: z.boolean(),
  descendants: z.array(PageRef.extend({ published: z.boolean() })),
  /** Pages whose drafts link to this page or a page under it. */
  linkedFrom: z.array(PageRef),
  /** The page has a place in the site's navigation bar. */
  inNavbar: z.boolean(),
});
export type DeletePreview = z.infer<typeof DeletePreview>;

export const JobStatus = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = z.object({
  id: Id,
  kind: z.string(),
  status: JobStatus,
  error: z.string().nullable(),
  /** What the job was given, e.g. `{ trigger: "scheduled" }` for a publish. */
  payload: z.record(z.string(), z.unknown()),
  /** A scheduled job waits until then. */
  runAt: z.string().nullable(),
  /** Counts a finished job reports, such as `{ pages: 12, redirects: 2 }`. */
  result: z.record(z.string(), z.number()).nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  /** Who queued it; null for the builder's own jobs. */
  createdBy: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

export const JobParams = z.object({ id: Id });

export const PublishResult = z.object({
  revisionId: Id,
  job: Job,
});
export type PublishResult = z.infer<typeof PublishResult>;

/** A site document's publish: the rebuild it queued. */
export const DocPublishResult = z.object({ job: Job });
export type DocPublishResult = z.infer<typeof DocPublishResult>;

export const PublishSiteResult = z.object({
  /** Pages whose changes were published. */
  published: z.number().int(),
  job: Job,
});
export type PublishSiteResult = z.infer<typeof PublishSiteResult>;

/** An undone publish: pages put back, pages skipped because they were published again since, and the rebuild. */
export const UndoPublishResult = z.object({
  putBack: z.number().int(),
  skipped: z.number().int(),
  job: Job,
});
export type UndoPublishResult = z.infer<typeof UndoPublishResult>;

/** What started a publish job. */
export const PublishTrigger = z.enum([
  "manual",
  "page",
  "entry",
  "settings",
  "navigation",
  "announcement",
  "search",
  "theme",
  "tree",
  "scheduled",
  "retry",
  "undo",
  "rebuild",
  /** Queued by a restore, so the site matches the restored content. */
  "restore",
]);
export type PublishTrigger = z.infer<typeof PublishTrigger>;

/** One page a publish made live: `revisionId` replaced `previous` (null when the page was new). */
export const PublishSwap = z.object({ pageId: Id, revisionId: Id, previous: Id.nullable() });
export type PublishSwap = z.infer<typeof PublishSwap>;

/** A publish job's `payload`. */
export const PublishPayload = z.object({
  trigger: PublishTrigger.optional(),
  /** The page a page or entry publish was for. */
  pageId: Id.optional(),
  /** A scheduled publish of these pages only. */
  pageIds: z.array(Id).optional(),
  /** A scheduled publish of these documents only. */
  docs: z.array(SiteDocName).optional(),
  /** The pages it made live, so it can be undone. */
  swaps: z.array(PublishSwap).optional(),
  /** When it was undone. */
  undoneAt: z.string().optional(),
  /** With trigger "undo": the publish it put back. */
  undoes: Id.optional(),
  /** Write every file again instead of only what changed. */
  full: z.boolean().optional(),
});
export type PublishPayload = z.infer<typeof PublishPayload>;

/** A backup job: the daily one, one someone asked for, or a failed one tried again. */
export const BackupPayload = z.object({ trigger: z.enum(["scheduled", "manual", "retry"]) });
export type BackupPayload = z.infer<typeof BackupPayload>;

/** Whether a publish can still be put back: it finished, made pages live, and wasn't undone. */
export const canUndo = (job: Job) => {
  const payload = job.payload as PublishPayload;
  return job.status === "done" && Boolean(payload.swaps?.length) && !payload.undoneAt;
};

/**
 * Something whose saved changes aren't on the site: a page (or entry) or one
 * of the site documents. `new` pages have never been published; the rest are
 * live with newer changes.
 */
export const WaitingItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("page"),
    id: Id,
    title: z.string(),
    path: z.string(),
    /** Never published: listed, but left out of "Publish all" unless chosen. */
    new: z.boolean(),
    updatedAt: z.string(),
    editedBy: z.string().nullable(),
  }),
  z.object({ kind: SiteDocName, editedBy: z.string().nullable() }),
  /** A file replaced since the last publish: any publish takes it live. */
  z.object({ kind: z.literal("media"), id: Id, filename: z.string(), replacedAt: z.string() }),
]);
export type WaitingItem = z.infer<typeof WaitingItem>;

/** An archive in BACKUP_DIR. `file` is what `site-builder restore` takes. */
export const BackupArchive = z.object({
  file: z.string(),
  at: z.string(),
  bytes: z.number().int(),
  /** Made before an upgrade: the database without media. */
  dbOnly: z.boolean(),
});
export type BackupArchive = z.infer<typeof BackupArchive>;

/** The dashboard and the status bar. */
export const Summary = z.object({
  pages: z.object({
    total: z.number().int(),
    /** Drafts that have never been published. */
    drafts: z.number().int(),
  }),
  /** What isn't live yet: the same list as `GET /publish/preview`. */
  waiting: z.array(WaitingItem),
  recentEdits: z.array(PageSummary),
  media: z.object({
    count: z.number().int(),
    /** Bytes on disk, originals and variants. */
    bytes: z.number().int(),
    /** Images still being processed. */
    processing: z.number().int(),
    /** The largest upload allowed (MEDIA_MAX_MB). */
    maxBytes: z.number().int(),
  }),
  publishes: z.array(Job),
  renderer: z.object({ ok: z.boolean() }),
  site: z.object({
    url: z.string().nullable(),
    version: z.string(),
    dataDir: z.string(),
    /** site.db and its WAL, in bytes. */
    databaseBytes: z.number().int(),
  }),
  backup: z.object({
    /** BACKUP_DIR. */
    dir: z.string(),
    /** BACKUP_DIR isn't set, so backups are on the site's own disk. */
    sameDisk: z.boolean(),
    /** The daily backup's Malaysian time (`HH:MM`), or null when it's off. */
    schedule: z.string().nullable(),
    /** When the daily backup next runs, or null when it's off. */
    next: z.string().nullable(),
    /** The newest full archive (database and media): what a restore after a disk failure would use. */
    last: BackupArchive.nullable(),
    /** Every archive in the folder, newest first: full ones and the database-only ones upgrades make. */
    archives: z.array(BackupArchive),
    /** The newest full archive is over 2 days old. */
    stale: z.boolean(),
    /** A backup job that failed after the newest archive was made. */
    failed: z.object({ at: z.string(), error: z.string() }).nullable(),
    /** A backup is queued or running now. */
    running: z.boolean(),
  }),
});
export type Summary = z.infer<typeof Summary>;

export const MediaKind = z.enum(["image", "document"]);
export type MediaKind = z.infer<typeof MediaKind>;

/** A file in the media library. */
export const Media = z.object({
  id: Id,
  filename: z.string(),
  /** image/jpeg, image/png, image/webp, image/svg+xml or application/pdf. */
  type: z.string(),
  kind: MediaKind,
  /** Bytes. */
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Required for images before they're used, unless decorative; missing alt is a warning everywhere. */
  alt: z.string(),
  /** The image adds nothing a screen reader should read: it is published with empty alt text. */
  decorative: z.boolean(),
  caption: z.string(),
  credit: z.string(),
  /** The narrower copies made for images, by width. */
  variants: z.array(z.number().int()),
  /** processing: variants are being made. */
  status: z.enum(["processing", "ready", "failed"]),
  url: z.string(),
  /** A small copy for grids and pickers (the original for SVG and PDF). */
  thumbnailUrl: z.string(),
  /** How many pages use it. */
  usedBy: z.number().int(),
  /** Replaced since the last publish, so the live site still shows the file before it. */
  notLive: z.boolean(),
  /** In Recently deleted since then; null while it's in the library. */
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Media = z.infer<typeof Media>;

export const MediaDetail = Media.extend({
  /** The pages that use it (live, draft or in Recently deleted), and whether site settings do. */
  usedOn: z.array(PageRef.extend({ deleted: z.boolean() })),
  usedBySettings: z.boolean(),
  /** The file before the last replace, which can be put back; `url` serves it to the admin. */
  previous: z
    .object({ filename: z.string(), kind: MediaKind, replacedAt: z.string(), url: z.string() })
    .nullable(),
});
export type MediaDetail = z.infer<typeof MediaDetail>;

export const MediaParams = z.object({ id: Id });

export const MediaQuery = z.object({
  search: z.string().trim().max(100).optional(),
  kind: MediaKind.optional(),
  unused: z.stringbool().optional(),
  /** Images with no alt text that aren't decorative. */
  needsAlt: z.stringbool().optional(),
  /** Only the files in Recently deleted. */
  deleted: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(60),
});
/** As the admin builds it; the server parses the query string. */
export type MediaQuery = Partial<z.output<typeof MediaQuery>>;

export const MediaList = z.object({
  items: z.array(Media),
  total: z.number().int(),
  /** Across the whole library, whatever the filters: images that need alt text, and files in Recently deleted. */
  needsAlt: z.number().int(),
  deleted: z.number().int(),
  /** Days a deleted file stays restorable. */
  trashDays: z.number().int(),
});
export type MediaList = z.infer<typeof MediaList>;

export const UpdateMediaBody = z.object({
  alt: z.string().trim().max(250).optional(),
  decorative: z.boolean().optional(),
  caption: z.string().trim().max(300).optional(),
  credit: z.string().trim().max(200).optional(),
});
export type UpdateMediaBody = z.infer<typeof UpdateMediaBody>;

/** What happened to one address in a publish. */
export const PublishLogEntry = z.object({
  pageId: Id.nullable(),
  path: z.string(),
  title: z.string(),
  /** written: rendered. redirect: a redirect page. removed: no longer on the site. failed: see `error`. */
  outcome: z.enum(["written", "redirect", "removed", "failed"]),
  error: z.string().optional(),
  /** The block that failed to render, when one did. */
  blockId: z.string().optional(),
  blockType: z.string().optional(),
});
export type PublishLogEntry = z.infer<typeof PublishLogEntry>;

export const JobDetail = Job.extend({ log: z.array(PublishLogEntry) });
export type JobDetail = z.infer<typeof JobDetail>;

export const JobsQuery = z.object({
  /** Upcoming scheduled jobs instead of the log. */
  scheduled: z.stringbool().default(false),
  /** Only jobs of this kind, e.g. "publish". */
  kind: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
/** As the admin builds it; the server parses the query string. */
export type JobsQuery = Partial<z.output<typeof JobsQuery>>;

export const JobList = z.object({ items: z.array(Job), total: z.number().int() });
export type JobList = z.infer<typeof JobList>;

export const PublishSiteBody = z.object({
  /** Schedule the publish for this time instead of now. */
  runAt: z.iso.datetime({ offset: true }).optional(),
  /**
   * Only these pages' drafts and site documents. With neither, everything
   * waiting: published pages with newer changes and every changed document,
   * but no page that has never been published.
   */
  pageIds: z.array(Id).max(200).optional(),
  docs: z.array(SiteDocName).max(3).optional(),
});
export type PublishSiteBody = z.input<typeof PublishSiteBody>;

/** What isn't live yet, in the order the admin lists it. */
export const PublishPreview = z.object({ items: z.array(WaitingItem) });
export type PublishPreview = z.infer<typeof PublishPreview>;

export const RevisionParams = z.object({ id: Id, revisionId: Id });

export const Revision = z.object({
  id: Id,
  kind: z.enum(["published", "draft"]),
  createdAt: z.string(),
  /** Blocks added, removed or changed since the revision before it. */
  blocksChanged: z.number().int(),
  /** The revision that is live now. */
  live: z.boolean(),
  /** Who saved or published it; null before there were accounts. */
  by: z.string().nullable(),
  /** The agent they did it through (docs/mcp.md); null when done in the admin. */
  via: z.string().nullable(),
});
export type Revision = z.infer<typeof Revision>;

export const RevisionDetail = Revision.extend({ content: PageDocument });
export type RevisionDetail = z.infer<typeof RevisionDetail>;

/** A soft-deleted page, restorable until `purgeAt`. */
export const DeletedPage = z.object({
  id: Id,
  kind: z.enum(["page", "listing", "entry"]),
  title: z.string(),
  /** Where it was. */
  path: z.string(),
  deletedAt: z.string(),
  purgeAt: z.string(),
  /** Child pages deleted with it, restored with it. */
  children: z.number().int(),
});
export type DeletedPage = z.infer<typeof DeletedPage>;

export { ListingSettings, EntryFields };

export const ListingDetail = z.object({
  settings: ListingSettings,
  /** Entries by status, for the listing's summary line. */
  counts: z.record(PageStatus, z.number().int()),
});
export type ListingDetail = z.infer<typeof ListingDetail>;

export const SaveListingBody = z.object({ settings: ListingSettings });

/** An entry as the entries table shows it. */
export const EntrySummary = PageSummary.extend({ entry: EntryFields });
export type EntrySummary = z.infer<typeof EntrySummary>;

export const EntriesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: PageStatus.optional(),
  category: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
/** As the admin builds it; the server parses the query string. */
export type EntriesQuery = Partial<z.output<typeof EntriesQuery>>;

export const EntryList = z.object({ items: z.array(EntrySummary), total: z.number().int() });
export type EntryList = z.infer<typeof EntryList>;

/** Entries across every listing whose title or address contains `search`. */
export const EntrySearchQuery = z.object({
  search: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(5),
});
/** As the admin builds it; the server parses the query string. */
export type EntrySearchQuery = z.input<typeof EntrySearchQuery>;

export const CreateEntryBody = z.object({
  title: z.string().trim().min(1, "Enter a title").max(160),
});
