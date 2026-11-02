/**
 * Date ranges for the analytics reports, as local days in the server's time
 * zone (days are counted there), and how figures are written out.
 */
import type { AnalyticsInterval } from "@fiscal-sb/contracts";
import { locale, t } from "@/i18n";

export const presets = ["today", "7d", "30d", "12m"] as const;
export type Preset = (typeof presets)[number];

export type RangeSearch = { range?: Preset | "custom"; from?: string; to?: string };

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function rangeSearch(search: Record<string, unknown>): RangeSearch {
  if (search.range === "custom" && isDay(search.from) && isDay(search.to))
    return { range: "custom", from: search.from, to: search.to };
  return presets.includes(search.range as Preset) ? { range: search.range as Preset } : {};
}

const dayFormats = new Map<string | undefined, Intl.DateTimeFormat>();

/** Today in `timeZone`, "2026-11-02". The formatter is made once per zone. */
export function todayIn(timeZone?: string) {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormats.set(timeZone, format);
  }
  return format.format(new Date());
}

/** `day` moved by `days`. */
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The first and last day a range covers. */
export function rangeDays(search: RangeSearch, today: string) {
  if (search.range === "custom" && search.from && search.to)
    return search.from <= search.to
      ? { from: search.from, to: search.to }
      : { from: search.to, to: search.from };
  switch (search.range ?? "30d") {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "12m": {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 11);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    default:
      return { from: addDays(today, -29), to: today };
  }
}

const numbers = new Intl.NumberFormat(locale());
export const formatCount = (n: number) => numbers.format(n);

const percent = new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 });
export const formatPercent = (share: number) => percent.format(share);

/** "45 s", "2 min 05 s", "1 h 12 min". */
export function formatSeconds(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return t("analytics.seconds", { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("analytics.minutes", { m, s: String(s % 60).padStart(2, "0") });
  return t("analytics.hours", { h: Math.floor(m / 60), m: m % 60 });
}

const dayLabel = new Intl.DateTimeFormat(locale(), {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthLabel = new Intl.DateTimeFormat(locale(), {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fullDay = new Intl.DateTimeFormat(locale(), {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A chart bucket, short ("14:00", "3 Nov", "Nov 2026") or long, for the tooltip. */
export function bucketLabel(at: string, interval: AnalyticsInterval, long = false) {
  if (interval === "hour") return `${at.slice(11, 13)}:00`;
  if (interval === "month") return monthLabel.format(new Date(`${at}-01T00:00:00Z`));
  return (long ? fullDay : dayLabel).format(new Date(`${at}T00:00:00Z`));
}

const longDay = (day: string) => fullDay.format(new Date(`${day}T00:00:00Z`));

/** "Mon, 3 Nov 2026 – Tue, 2 Dec 2026", or one day. */
export const rangeLabel = (from: string, to: string) =>
  from === to ? longDay(from) : `${longDay(from)} – ${longDay(to)}`;
