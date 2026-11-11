/**
 * Event dates and times as people read them, in Malaysia's time: "Khamis,
 * 12 November 2026", "9.00 pagi – 1.00 petang", "Esok". The calendar, the
 * upcoming events block and an event entry's header share them.
 */
import {
  EVENT_TIME_ZONE,
  type CalendarRender,
  type EntryItem,
  addDays,
  atSiteTime,
  daysBetween,
  dayOf,
  eventDays,
  siteClock,
} from "@fiscal-sb/blocks";
import type { Lang } from "@/lib/ftds/i18n";

export type EventInfo = NonNullable<EntryItem["event"]>;

/** Noon on a YYYY-MM-DD in Malaysia, so formatting it never slips a day. */
const noon = (day: string) => new Date(atSiteTime(day, "12:00"));

/** One formatter per language and options, built once: calendars format dozens of days a page. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function format(lang: Lang, options: Intl.DateTimeFormatOptions, day: string) {
  const key = `${lang}:${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ms-MY", {
      ...options,
      timeZone: EVENT_TIME_ZONE,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(noon(day));
}

/** "Khamis, 12 November 2026". */
export const dayLabel = (day: string, lang: Lang) =>
  format(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, day);

/** "November 2026", from YYYY-MM. */
export const monthLabel = (month: string, lang: Lang) =>
  format(lang, { month: "long", year: "numeric" }, `${month}-15`);

/** "Nov", from a YYYY-MM-DD. */
export const monthAbbr = (day: string, lang: Lang) => format(lang, { month: "short" }, day);

/** A weekday from Monday: 0 to 6. 2026-11-02 is a Monday. */
export const weekdayOf = (day: string) => ((daysBetween("2026-11-02", day) % 7) + 7) % 7;

const weekdays = new Map<string, string[]>();
/** The weekday names from Monday, short ("Isn", "Sel", …) or long. */
export function weekdayNames(lang: Lang, style: "short" | "long" = "short") {
  const key = `${lang}:${style}`;
  let names = weekdays.get(key);
  if (!names) {
    names = Array.from({ length: 7 }, (_, i) =>
      format(lang, { weekday: style }, addDays("2026-11-02", i)),
    );
    weekdays.set(key, names);
  }
  return names;
}

/** "9.00 pagi" or "2.30 petang"; in English "9.00 am". */
export function timeLabel(iso: string, lang: Lang) {
  const [hh, minutes] = siteClock(iso).slice(11).split(":") as [string, string];
  const hours = Number(hh);
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
    format(
      lang,
      { day: "numeric", ...(month && { month: "long" }), ...(year && { year: "numeric" }) },
      day,
    );
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

/** A month's days with their events: an event on every day of the month it runs. */
export function monthDays(items: EntryItem[], month: string) {
  const days = new Map<string, EntryItem[]>();
  for (const item of items)
    for (const day of eventDays(item.event!))
      if (day.startsWith(month)) days.set(day, [...(days.get(day) ?? []), item]);
  return days;
}

/** The weeks a month's grid shows, Monday first, with the days either side that square it off. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const weeks: string[][] = [];
  for (let day = addDays(first, -weekdayOf(first)); day.slice(0, 7) <= month; day = addDays(day, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  return weeks;
}

/**
 * Each location's colour, in the order the listing lists them, from four FTDS
 * tones; events with no location are grey. Full class names, so Tailwind sees them.
 */
const tones = [
  {
    tag: "primary",
    dot: "bg-bg-primary-600",
    soft: "bg-bg-primary-50 text-txt-primary border-bg-primary-600",
    solid: "bg-bg-primary-600 text-txt-white border-bg-primary-600",
  },
  {
    tag: "success",
    dot: "bg-bg-success-600",
    soft: "bg-bg-success-50 text-txt-success border-bg-success-600",
    solid: "bg-bg-success-600 text-txt-white border-bg-success-600",
  },
  {
    tag: "warning",
    dot: "bg-bg-warning-600",
    soft: "bg-bg-warning-50 text-txt-warning border-bg-warning-600",
    solid: "bg-bg-warning-600 text-txt-white border-bg-warning-600",
  },
  {
    tag: "default",
    dot: "bg-bg-black-500",
    soft: "bg-bg-washed text-txt-black-700 border-bg-black-500",
    solid: "bg-bg-black-700 text-txt-white border-bg-black-700",
  },
] as const;
export type Tone = (typeof tones)[number];
export const toneOf = (locations: { slug: string }[], slug: string | undefined): Tone => {
  const index = slug ? locations.findIndex((l) => l.slug === slug) : -1;
  return index === -1 ? tones[3] : tones[index % tones.length]!;
};

/** When an event is, in a card or a list row: its days if it runs over several, else its time. */
export const whenShort = (event: EventInfo, lang: Lang) =>
  isMultiDay(event) ? dayRange(event, lang) : timeRange(event, lang);

/** The time Event details shows: none for a multi-day all-day event, the start for a multi-day one, else the range. */
export function detailsTime(event: EventInfo, lang: Lang) {
  if (!isMultiDay(event)) return timeRange(event, lang);
  return event.allDay ? undefined : timeLabel(event.start, lang);
}

/** A filter's choices: "All", then each category or location, with its address, the month's count and whether it's this page's. */
export function filterOptions(
  calendar: CalendarRender,
  kind: "category" | "location",
  allName: string,
) {
  const list = kind === "category" ? calendar.categories : calendar.locations;
  const counts = kind === "category" ? calendar.counts.categories : calendar.counts.locations;
  const active = calendar.filter?.kind === kind ? calendar.filter.slug : undefined;
  return [
    {
      slug: undefined,
      name: allName,
      href: calendar.all,
      count: calendar.counts.all,
      current: !active,
    },
    ...list.map((o) => ({
      slug: o.slug as string | undefined,
      name: o.name,
      href: o.href,
      count: counts[o.slug] ?? 0,
      current: o.slug === active,
    })),
  ];
}

/** A filter's "All" choice: "Semua pasukan", "Semua lokasi"; in English "All". */
export const allOf = (label: string, lang: Lang) =>
  lang === "en" ? "All" : `Semua ${label.toLowerCase()}`;
