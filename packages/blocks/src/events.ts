/**
 * Event dates as the calendar reads them: days and months in Malaysia's time
 * (UTC+8, no daylight saving). The
 * server and the renderer share these, so a day means the same to both.
 */
import type { EntryEvent } from "./content.js";

export const EVENT_TIME_ZONE = "Asia/Kuala_Lumpur";
const OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
/** A multi-day event shows on at most this many days. */
const MAX_DAYS = 62;

/** The YYYY-MM-DD an instant falls on in Malaysia. */
export const dayOf = (iso: string | number) =>
  new Date((typeof iso === "number" ? iso : Date.parse(iso)) + OFFSET_MS)
    .toISOString()
    .slice(0, 10);

/** The YYYY-MM an instant falls in, in Malaysia. */
export const monthOf = (iso: string | number) => dayOf(iso).slice(0, 7);

/** A YYYY-MM-DD's day number, for counting days between two. */
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Whole days from `from` to `to` (YYYY-MM-DD): 0 is the same day. */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** `day` (YYYY-MM-DD) moved by `n` days. */
export const addDays = (day: string, n: number) =>
  new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);

/** `month` (YYYY-MM) moved by `n` months. */
export function addMonths(month: string, n: number) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The days an event is on, first to last. */
export function eventDays(event: Pick<EntryEvent, "start" | "end">): string[] {
  const first = dayOf(event.start);
  const last = event.end ? dayOf(event.end) : first;
  const count = Math.min(Math.max(daysBetween(first, last), 0), MAX_DAYS - 1);
  return Array.from({ length: count + 1 }, (_, i) => addDays(first, i));
}

/** When an event is over: its end, or for an all-day event the end of its last day. */
function eventEndsAt(event: Pick<EntryEvent, "start" | "end" | "allDay">): number {
  const end = event.end ?? event.start;
  if (event.allDay) return Date.parse(`${dayOf(end)}T23:59:59.999+08:00`);
  return Date.parse(end);
}

/** Whether an event isn't over at `now`. */
export const isUpcoming = (event: Pick<EntryEvent, "start" | "end" | "allDay">, now: number) =>
  eventEndsAt(event) >= now;

/** A wall-clock time in Malaysia as an ISO time: ("2026-11-12", "09:00") → "2026-11-12T09:00:00+08:00". */
export const atSiteTime = (day: string, time = "00:00") => `${day}T${time}:00+08:00`;

/** An instant as Malaysia's wall clock, "YYYY-MM-DDTHH:MM": what a date-time input shows. */
export const siteClock = (iso: string | number) =>
  new Date((typeof iso === "number" ? iso : Date.parse(iso)) + OFFSET_MS)
    .toISOString()
    .slice(0, 16);

/** When a new event starts: tomorrow at nine in Malaysia. */
export const newEventStart = (now = Date.now()) => atSiteTime(addDays(dayOf(now), 1), "09:00");
