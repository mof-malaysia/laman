/**
 * Event dates and times as people read them, in Malaysia's time: "Khamis,
 * 12 November 2026", "9.00 pagi – 1.00 petang", "Esok". The calendar, the
 * upcoming events block and an event entry's header share them.
 */
import {
  EVENT_TIME_ZONE,
  type EntryItem,
  addDays,
  daysBetween,
  dayOf,
  eventDays,
} from "@fiscal-sb/blocks";

type Lang = "ms" | "en";
export type EventInfo = NonNullable<EntryItem["event"]>;

const locale = (lang: Lang) => (lang === "en" ? "en-GB" : "ms-MY");
/** Noon on a YYYY-MM-DD in Malaysia, so formatting it never slips a day. */
const noon = (day: string) => new Date(`${day}T12:00:00+08:00`);

/** "Khamis, 12 November 2026". */
export const dayLabel = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(noon(day));

/** "12 Nov". */
export const shortDay = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    timeZone: EVENT_TIME_ZONE,
  }).format(noon(day));

/** "November 2026", from YYYY-MM. */
export const monthLabel = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    month: "long",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(noon(`${month}-15`));

/** "Nov 2026", from YYYY-MM: the calendar's row of months. */
export const shortMonthLabel = (month: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), {
    month: "short",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  }).format(noon(`${month}-15`));

/** "Nov", from a YYYY-MM-DD. */
export const monthAbbr = (day: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { month: "short", timeZone: EVENT_TIME_ZONE }).format(
    noon(day),
  );

/** The weekday names from Monday, short: "Isn", "Sel", … */
export const weekdayNames = (lang: Lang, style: "short" | "long" = "short") =>
  // 2026-11-02 is a Monday.
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale(lang), { weekday: style, timeZone: EVENT_TIME_ZONE }).format(
      noon(addDays("2026-11-02", i)),
    ),
  );

/** "9.00 pagi" or "2.30 petang"; in English "9.00 am". */
export function timeLabel(iso: string, lang: Lang) {
  const local = new Date(Date.parse(iso) + 8 * 3_600_000);
  const hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const twelve = hours % 12 || 12;
  if (lang === "en") return `${twelve}.${minutes} ${hours < 12 ? "am" : "pm"}`;
  const part = hours < 12 ? "pagi" : hours < 14 ? "tengah hari" : hours < 19 ? "petang" : "malam";
  return `${twelve}.${minutes} ${part}`;
}

/** When an event is, under its day: "9.00 pagi – 1.00 petang", or "Sepanjang hari". */
export function timeRange(event: EventInfo, lang: Lang) {
  if (event.allDay) return lang === "en" ? "All day" : "Sepanjang hari";
  const start = timeLabel(event.start, lang);
  if (!event.end || event.end === event.start) return start;
  if (dayOf(event.end) !== dayOf(event.start)) return start;
  return `${start} – ${timeLabel(event.end, lang)}`;
}

/** The days of an event that runs over more than one: "12 – 14 November 2026". */
export function dayRange(event: EventInfo, lang: Lang) {
  const days = eventDays(event);
  const first = days[0]!;
  const last = days.at(-1)!;
  if (first === last) return dayLabel(first, lang);
  const part = (day: string, month: boolean, year: boolean) =>
    new Intl.DateTimeFormat(locale(lang), {
      day: "numeric",
      ...(month && { month: "long" }),
      ...(year && { year: "numeric" }),
      timeZone: EVENT_TIME_ZONE,
    }).format(noon(day));
  // "10 – 12 Januari 2027", "30 November – 2 Disember 2026", "30 Disember 2026 – 2 Januari 2027".
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = sameYear && first.slice(5, 7) === last.slice(5, 7);
  return `${part(first, !sameMonth, !sameYear)} – ${part(last, true, true)}`;
}

/** Whether an event runs over more than one day. */
export const isMultiDay = (event: EventInfo) => eventDays(event).length > 1;

/** Everything about when an event is, in one line: for an entry's header. */
export function whenLabel(event: EventInfo, lang: Lang) {
  if (isMultiDay(event)) {
    const range = dayRange(event, lang);
    return event.allDay ? range : `${range}, ${timeLabel(event.start, lang)}`;
  }
  return `${dayLabel(dayOf(event.start), lang)}, ${timeRange(event, lang)}`;
}

/** How far off a day is from today: "Hari ini", "Esok", "Lagi 3 hari". Undefined once it's past. */
export function daysToGo(today: string, day: string, lang: Lang) {
  const n = daysBetween(today, day);
  if (n < 0) return undefined;
  if (n === 0) return lang === "en" ? "Today" : "Hari ini";
  if (n === 1) return lang === "en" ? "Tomorrow" : "Esok";
  return lang === "en" ? `In ${n} days` : `Lagi ${n} hari`;
}

/** Where an event is, in one line: its location and venue. */
export const whereLabel = (event: EventInfo) =>
  [event.location, event.venue].filter(Boolean).join(" · ");
