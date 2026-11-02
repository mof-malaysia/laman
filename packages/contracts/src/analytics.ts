/**
 * Analytics: what the published site's beacon sends to `/_v`, and the reports
 * the admin reads from `/api/analytics`. See docs/analytics.md.
 */
import { z } from "zod";

const Id = z.uuid();
/** A view's random id, made per page load and kept only in the page's memory. */
const ViewId = z.string().regex(/^[a-z0-9]{8,32}$/);
const SitePath = z.string().max(500).regex(/^\//);
const Short = z.string().trim().max(100);

/** One beacon. The server answers 204 whatever it sends. */
export const Beacon = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("view"),
    id: ViewId,
    path: SitePath,
    /** The page's id, so its stats follow renames and moves. */
    page: Id.optional(),
    /** The address the visitor came from, when it's another site. */
    referrer: z.string().max(500).optional(),
    /** Screen width in CSS pixels. */
    screen: z.number().int().min(0).max(20_000).optional(),
    language: z.string().max(35).optional(),
    utm: z
      .object({ source: Short.optional(), medium: Short.optional(), campaign: Short.optional() })
      .optional(),
  }),
  /** The page was hidden or closed: how long it was visible since the last beacon. */
  z.object({
    type: z.literal("leave"),
    id: ViewId,
    visible: z.number().int().min(0).max(86_400_000),
  }),
  /** A click on a file (downloads) or another site (outbound). */
  z.object({
    type: z.enum(["download", "outbound"]),
    path: SitePath,
    page: Id.optional(),
    target: z.string().min(1).max(500),
  }),
]);
export type Beacon = z.infer<typeof Beacon>;

const Day = z.iso.date();

export const AnalyticsQuery = z.object({
  /** First and last day, inclusive, in the server's time zone. */
  from: Day,
  to: Day,
  /** One page's stats. */
  pageId: Id.optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

export const AnalyticsTotals = z.object({
  views: z.number().int(),
  /** Visitors per day, summed: a visitor can't be matched across days. */
  visitors: z.number().int(),
  visits: z.number().int(),
  /** Visits with one view, out of all visits (0–1). With a page: visits that saw only it. */
  bounceRate: z.number(),
  /** Average visit length in ms. With a page: average time on it per view. */
  duration: z.number(),
});
export type AnalyticsTotals = z.infer<typeof AnalyticsTotals>;

export const AnalyticsInterval = z.enum(["hour", "day", "month"]);
export type AnalyticsInterval = z.infer<typeof AnalyticsInterval>;

export const AnalyticsSummary = z.object({
  current: AnalyticsTotals,
  /** The same length of time just before `from`. */
  previous: AnalyticsTotals,
  /** The days `previous` covers. */
  before: z.object({ from: Day, to: Day }),
  interval: AnalyticsInterval,
  /** One point per hour, day or month, oldest first, gaps filled with zeros. */
  series: z.array(
    z.object({
      /** "2026-11-02T14", "2026-11-02" or "2026-11". */
      at: z.string(),
      views: z.number().int(),
      visitors: z.number().int(),
      /** Publishes that finished then, to read traffic against. With a page: those that made it live. */
      publishes: z.number().int(),
    }),
  ),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummary>;

export const breakdowns = [
  "page",
  "entry",
  "exit",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "browser",
  "os",
  "device",
  "screen",
  "language",
  "country",
  "download",
  "outbound",
] as const;
export const Breakdown = z.enum(breakdowns);
export type Breakdown = z.infer<typeof Breakdown>;

export const BreakdownQuery = AnalyticsQuery.extend({
  by: Breakdown,
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const BreakdownRow = z.object({
  /** The path, host, name or code; "" when it wasn't known. */
  value: z.string(),
  /** By page, entry and exit: the page it was, if it still exists. */
  pageId: Id.nullable().optional(),
  /** Views, or clicks for downloads and outbound links. */
  count: z.number().int(),
  visitors: z.number().int(),
});
export type BreakdownRow = z.infer<typeof BreakdownRow>;

export const BreakdownList = z.object({
  rows: z.array(BreakdownRow),
  /** All views (or clicks) in the range, for shares. */
  total: z.number().int(),
});
export type BreakdownList = z.infer<typeof BreakdownList>;

export const AnalyticsStatus = z.object({
  /** Counting is on in the live settings. */
  on: z.boolean(),
  /** A country database (GEOIP_DB) is loaded. */
  countries: z.boolean(),
  /** The oldest day with data, if any. */
  since: Day.nullable(),
  /** The server's time zone, which days are counted in. */
  timeZone: z.string(),
});
export type AnalyticsStatus = z.infer<typeof AnalyticsStatus>;
