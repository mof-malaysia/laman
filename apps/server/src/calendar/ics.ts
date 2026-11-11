/**
 * Reads an ICS feed into single occurrences inside a window: repeating events
 * expanded with their moved and cancelled dates, cancelled and private events
 * dropped, and only what the site shows kept (title, times, place). The
 * description and attendees are never read.
 */
import { atSiteTime, dayOf, siteClock } from "@fiscal-sb/blocks";
import ICAL from "ical.js";

/** One occurrence of an event, keyed so the same meeting on several calendars matches. */
export type Occurrence = {
  /** The event's UID, plus which occurrence for a repeating one. */
  key: string;
  title: string;
  /** ISO with Malaysia's offset; midnight there for an all-day event. */
  start: string;
  /** Inclusive: the last day of an all-day event, the end time of a timed one. */
  end?: string;
  allDay: boolean;
  /** The LOCATION text, as typed in the calendar. */
  place?: string;
  /** Held online: a meeting link in the place, or the calendar says so. */
  online: boolean;
  /** For choosing between copies on several calendars: higher wins, then later. */
  sequence: number;
  modified: number;
  /** Milliseconds, for the window and for leaving past events alone. */
  at: number;
};

/** A repeating event is expanded at most this many times, however its rule reads. */
const MAX_OCCURRENCES = 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as Malaysian wall-clock time with its offset, as the site stores event times. */
const atSite = (ms: number) => atSiteTime(dayOf(ms), siteClock(ms).slice(11));

const dayOfTime = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

/**
 * The instant a timed value means. A time with a zone the feed defined (or
 * UTC) converts; a floating time, or one naming a zone the feed didn't define,
 * is read as Malaysian time, which has no daylight saving to get wrong.
 */
function instantOf(t: ICAL.Time) {
  const known = t.zone && t.zone !== ICAL.Timezone.localTimezone && t.zone.tzid !== "floating";
  if (known) return t.toUnixTime() * 1000;
  return Date.parse(atSiteTime(dayOfTime(t), `${pad(t.hour)}:${pad(t.minute)}`)) + t.second * 1000;
}

/** When a value starts: midnight in Malaysia for a day. */
const instantOrDay = (t: ICAL.Time) =>
  t.isDate ? Date.parse(atSiteTime(dayOfTime(t))) : instantOf(t);

const text = (component: ICAL.Component, name: string) => {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value.trim() : "";
};

/** Cancelled, or not for everyone's eyes. */
function hidden(component: ICAL.Component) {
  if (text(component, "status").toUpperCase() === "CANCELLED") return true;
  const access = text(component, "class").toUpperCase();
  return access === "PRIVATE" || access === "CONFIDENTIAL";
}

const MEETING_LINK = /https?:\/\/\S*(teams\.microsoft|teams\.live|zoom\.us|meet\.google|webex)\S*/i;

function onlineOf(component: ICAL.Component, place: string) {
  if (MEETING_LINK.test(place) || /microsoft teams|zoom meeting|google meet/i.test(place))
    return true;
  return Boolean(
    component.getFirstPropertyValue("x-microsoft-skypeteamsmeetingurl") ||
    component.getFirstPropertyValue("x-microsoft-onlinemeetingconflink"),
  );
}

function stampOf(component: ICAL.Component) {
  const value =
    component.getFirstPropertyValue("last-modified") ?? component.getFirstPropertyValue("dtstamp");
  return value instanceof ICAL.Time ? value.toUnixTime() * 1000 : 0;
}

function occurrence(
  key: string,
  item: ICAL.Component,
  start: ICAL.Time,
  end: ICAL.Time | undefined,
): Occurrence | null {
  const title = text(item, "summary");
  if (!title) return null;
  const place = text(item, "location");
  const base = {
    key,
    title,
    online: onlineOf(item, place),
    sequence: Number(item.getFirstPropertyValue("sequence")) || 0,
    modified: stampOf(item),
    ...(place && { place }),
  };
  if (start.isDate) {
    const first = dayOfTime(start);
    // ICS ends an all-day event on the day after it; the site names its last day.
    let last = first;
    if (end) {
      const before = end.clone();
      before.adjust(-1, 0, 0, 0);
      if (dayOfTime(before) > first) last = dayOfTime(before);
    }
    return {
      ...base,
      start: atSiteTime(first),
      ...(last !== first && { end: atSiteTime(last) }),
      allDay: true,
      at: instantOrDay(start),
    };
  }
  const at = instantOf(start);
  const until = end ? instantOf(end) : undefined;
  return {
    ...base,
    start: atSite(at),
    ...(until !== undefined && until > at && { end: atSite(until) }),
    allDay: false,
    at,
  };
}

/**
 * The feed's occurrences that start in `from`…`to` (milliseconds). An event
 * with no UID is keyed by `ownKey`, its start and its title, so it's still
 * kept, though never merged with another calendar's. Throws on a file that
 * isn't iCalendar.
 */
export function readCalendar(
  ics: string,
  window: { from: number; to: number },
  ownKey: string,
): Occurrence[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  if (root.name !== "vcalendar") throw new Error("This isn't an iCalendar file");
  // Outlook names its zones the Windows way ("Singapore Standard Time") and defines them in the file.
  for (const zone of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(zone);

  const masters = new Map<string, ICAL.Component>();
  const exceptions = new Map<string, ICAL.Component[]>();
  const loose: ICAL.Component[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const uid = text(vevent, "uid");
    if (!uid) loose.push(vevent);
    else if (vevent.hasProperty("recurrence-id")) {
      const list = exceptions.get(uid) ?? [];
      list.push(vevent);
      exceptions.set(uid, list);
    } else masters.set(uid, vevent);
  }

  const out: Occurrence[] = [];
  const add = (o: Occurrence | null) => {
    if (o && o.at >= window.from && o.at <= window.to) out.push(o);
  };

  for (const [uid, master] of masters) {
    const event = new ICAL.Event(master);
    for (const exception of exceptions.get(uid) ?? []) event.relateException(exception);
    exceptions.delete(uid);
    if (!event.isRecurring()) {
      if (!hidden(master)) add(occurrence(uid, master, event.startDate, event.endDate));
      continue;
    }
    // A cancelled or private series hides every occurrence, moved ones included.
    if (hidden(master)) continue;
    const expansion = event.iterator();
    for (let n = 0, next = expansion.next(); next && n < MAX_OCCURRENCES; n++) {
      const details = event.getOccurrenceDetails(next);
      if (instantOrDay(details.startDate) > window.to) break;
      if (!hidden(details.item.component))
        add(
          occurrence(
            `${uid}|${details.recurrenceId.toString()}`,
            details.item.component,
            details.startDate,
            details.endDate,
          ),
        );
      next = expansion.next();
    }
  }

  // Moved occurrences whose series isn't in the feed, and events without a UID.
  for (const vevent of [...[...exceptions.values()].flat(), ...loose]) {
    if (hidden(vevent)) continue;
    const event = new ICAL.Event(vevent);
    const uid = text(vevent, "uid");
    const found = occurrence(
      uid ? `${uid}|${event.recurrenceId.toString()}` : "",
      vevent,
      event.startDate,
      event.endDate,
    );
    add(found && !uid ? { ...found, key: `${ownKey}|${found.start}|${found.title}` } : found);
  }
  return out;
}
