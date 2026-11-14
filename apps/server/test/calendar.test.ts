import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays, dayOf } from "@fiscal-sb/blocks";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { feedAddress, isPrivateAddress } from "../src/calendar/fetch.js";
import { readCalendar } from "../src/calendar/ics.js";
import { looksLikeADrop } from "../src/calendar/sync.js";
import { loadEnv } from "../src/env.js";

/** What each feed address answers: its ICS text, or an error to throw. */
const feeds = new Map<string, string | Error>();
const fetchFeed = async (url: string) => {
  const answer = feeds.get(url);
  if (answer === undefined) throw new Error("No such address");
  if (answer instanceof Error) throw answer;
  return answer;
};

const today = dayOf(Date.now());
const stamp = (day: string, time: string) =>
  `${day.replaceAll("-", "")}T${time.replace(":", "")}00`;

type Vevent = {
  uid?: string;
  summary: string;
  day: string;
  at?: string;
  until?: string;
  extra?: string;
};
const vevent = (e: Vevent) =>
  [
    "BEGIN:VEVENT",
    ...(e.uid ? [`UID:${e.uid}`] : []),
    `SUMMARY:${e.summary}`,
    `DTSTART;TZID=Singapore Standard Time:${stamp(e.day, e.at ?? "09:00")}`,
    `DTEND;TZID=Singapore Standard Time:${stamp(e.day, e.until ?? "10:00")}`,
    "DTSTAMP:20260101T000000Z",
    ...(e.extra ? [e.extra] : []),
    "END:VEVENT",
  ].join("\r\n");
const ics = (...events: Vevent[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:Microsoft Exchange Server 2010",
    "BEGIN:VTIMEZONE",
    "TZID:Singapore Standard Time",
    "BEGIN:STANDARD",
    "DTSTART:16010101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.map(vevent),
    "END:VCALENDAR",
  ].join("\r\n");

let dataDir: string;
let app: App;
let listing: { id: string; path: string };

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-calendar-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false, fetchFeed });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const sync = async () => {
  await call("POST", "/api/calendar-sources/sync");
  await work();
};
/** The listing's entries as the sync left them. */
const entries = async () => {
  const list = (await call("GET", `/api/pages/${listing.id}/entries?pageSize=100`)).json().data
    .items as { id: string; title: string; status: string }[];
  return list.toSorted((a, b) => a.title.localeCompare(b.title));
};
const live = async () => (await entries()).filter((e) => e.status !== "draft").map((e) => e.title);
const draftOf = async (id: string) => (await call("GET", `/api/pages/${id}`)).json().data.draft;

describe("reading ICS", () => {
  it("expands a repeating event with its moved and skipped dates, and drops private and cancelled ones", async () => {
    const feed = await readFile(join(import.meta.dirname, "fixtures/outlook.ics"), "utf8");
    const found = readCalendar(
      feed,
      { from: Date.parse("2026-10-01"), to: Date.parse("2027-01-01") },
      "none",
    );
    expect(found.map((o) => [o.key, o.title, o.start, o.end ?? null, o.online])).toEqual([
      [
        "weekly-1|2026-11-02T09:00:00",
        "Mesyuarat mingguan",
        "2026-11-02T09:00:00+08:00",
        "2026-11-02T10:00:00+08:00",
        false,
      ],
      [
        "weekly-1|2026-11-16T09:00:00",
        "Mesyuarat mingguan (dipinda)",
        "2026-11-17T14:00:00+08:00",
        "2026-11-17T15:00:00+08:00",
        true,
      ],
      [
        "weekly-1|2026-11-23T09:00:00",
        "Mesyuarat mingguan",
        "2026-11-23T09:00:00+08:00",
        "2026-11-23T10:00:00+08:00",
        false,
      ],
      // All day, ending the day before ICS's exclusive end.
      [
        "roadshow-1",
        "Jelajah TERAJU Sabah",
        "2026-11-24T00:00:00+08:00",
        "2026-11-25T00:00:00+08:00",
        false,
      ],
      ["utc-1", "Taklimat bajet", "2026-11-19T14:00:00+08:00", "2026-11-19T16:00:00+08:00", false],
    ]);
    expect(found.find((o) => o.key === "roadshow-1")?.allDay).toBe(true);
  });

  it("refuses a file that isn't iCalendar", () => {
    expect(() => readCalendar("<html></html>", { from: 0, to: 1 }, "x")).toThrow();
  });

  it("stores webcal as https, and refuses other schemes and private addresses", () => {
    expect(feedAddress("webcal://outlook.office365.com/owa/calendar/a/b/calendar.ics")).toBe(
      "https://outlook.office365.com/owa/calendar/a/b/calendar.ics",
    );
    expect(feedAddress("http://example.com/a.ics")).toBeNull();
    expect(feedAddress("https://user:pw@example.com/a.ics")).toBeNull();
    expect(feedAddress("https://127.0.0.1/a.ics")).toBeNull();
    expect(feedAddress("https://[::1]/a.ics")).toBeNull();
    for (const address of [
      "10.1.2.3",
      "192.168.0.9",
      "169.254.169.254",
      "::ffff:127.0.0.1",
      "fd00::1",
    ])
      expect(isPrivateAddress(address)).toBe(true);
    expect(isPrivateAddress("20.190.1.1")).toBe(false);
  });

  it("holds a read that suddenly finds far fewer events", () => {
    expect(looksLikeADrop(0, 0)).toBe(false);
    expect(looksLikeADrop(3, 0)).toBe(true);
    expect(looksLikeADrop(3, 1)).toBe(false);
    expect(looksLikeADrop(10, 4)).toBe(true);
    expect(looksLikeADrop(10, 6)).toBe(false);
  });
});

describe("calendar sources", () => {
  const A = "https://calendars.example/a.ics";
  const B = "https://calendars.example/b.ics";
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  let sourceA: string;
  let sourceB: string;

  it("adds sources to a Takwim listing, keeping the address secret", async () => {
    listing = (
      await call("POST", "/api/pages", { title: "Takwim", slug: "takwim", template: "takwim" })
    ).json().data;
    await call("POST", `/api/pages/${listing.id}/publish`);
    const settings = (await call("GET", `/api/pages/${listing.id}/listing`)).json().data.settings;
    await call("PUT", `/api/pages/${listing.id}/listing`, {
      settings: {
        ...settings,
        categories: [
          { slug: "dasar", name: "Bahagian Dasar" },
          { slug: "pelaburan", name: "Bahagian Pelaburan" },
        ],
        locations: [
          { slug: "hq", name: "Ibu Pejabat" },
          { slug: "sabah", name: "Sabah" },
          { slug: "dalam-talian", name: "Dalam talian" },
        ],
      },
    });
    feeds.set(
      A,
      ics(
        { uid: "shared-1", summary: "Mesyuarat bersama", day: tomorrow },
        {
          uid: "a-1",
          summary: "Taklimat Sabah",
          day: nextWeek,
          extra: "LOCATION:Kota Kinabalu\\, Sabah",
        },
        {
          uid: "a-2",
          summary: "Sesi dalam talian",
          day: nextWeek,
          at: "14:00",
          until: "15:00",
          extra: "LOCATION:Microsoft Teams Meeting",
        },
      ),
    );
    feeds.set(
      B,
      ics(
        { uid: "shared-1", summary: "Mesyuarat bersama", day: tomorrow },
        { uid: "b-1", summary: "Bengkel pelaburan", day: nextWeek, extra: "LOCATION:Aras 20" },
      ),
    );
    const bad = await call("POST", `/api/pages/${listing.id}/calendar-sources`, {
      name: "Salah",
      address: "http://calendars.example/a.ics",
    });
    expect(bad.json().error.code).toBe("bad_address");
    const added = await call("POST", `/api/pages/${listing.id}/calendar-sources`, {
      name: "Bahagian Dasar",
      address: A.replace("https://", "webcal://"),
      category: "dasar",
      location: "hq",
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().data.address).not.toContain("a.ics");
    sourceA = added.json().data.id;
    const addedB = await call("POST", `/api/pages/${listing.id}/calendar-sources`, {
      name: "Bahagian Pelaburan",
      address: B,
      category: "pelaburan",
      location: "hq",
    });
    sourceB = addedB.json().data.id;
    const again = await call("POST", `/api/pages/${listing.id}/calendar-sources`, {
      name: "Sekali lagi",
      address: B,
    });
    expect(again.json().error.code).toBe("source_exists");
  });

  it("writes one live entry per event, merging the meeting both calendars have", async () => {
    await work();
    expect(await live()).toEqual([
      "Bengkel pelaburan",
      "Mesyuarat bersama",
      "Sesi dalam talian",
      "Taklimat Sabah",
    ]);
    const all = await entries();
    const byTitle = (title: string) => all.find((e) => e.title === title)!;
    const shared = await draftOf(byTitle("Mesyuarat bersama").id);
    // The first source in the listing's order owns a shared meeting.
    expect(shared.entry.category).toBe("dasar");
    expect(shared.entry.event).toMatchObject({
      start: `${tomorrow}T09:00:00+08:00`,
      location: "hq",
      source: { system: "Bahagian Dasar", calendar: sourceA },
    });
    expect((await draftOf(byTitle("Taklimat Sabah").id)).entry.event.location).toBe("sabah");
    expect((await draftOf(byTitle("Sesi dalam talian").id)).entry.event.location).toBe(
      "dalam-talian",
    );
    const sources = (await call("GET", `/api/pages/${listing.id}/calendar-sources`)).json().data;
    expect(sources.map((s: { events: number; error: null }) => [s.events, s.error])).toEqual([
      [3, null],
      [2, null],
    ]);
    // The sync published the calendar.
    const html = await readFile(
      join(dataDir, "public", listing.path.slice(1), "index.html"),
      "utf8",
    );
    expect(html).toContain("Mesyuarat bersama");
  });

  it("changes nothing when nothing changed", async () => {
    const before = (await call("GET", "/api/jobs")).json().data.total;
    await sync();
    const jobs = (await call("GET", "/api/jobs")).json().data;
    // Only the sync itself: no publish followed.
    expect(jobs.total).toBe(before + 1);
    expect(jobs.items[0].result).toMatchObject({ created: 0, updated: 0, removed: 0 });
  });

  it("keeps a failing calendar's events, and the meeting another calendar still has", async () => {
    feeds.set(A, new Error("The calendar answered 503"));
    await sync();
    expect(await live()).toHaveLength(4);
    const [a] = (await call("GET", `/api/pages/${listing.id}/calendar-sources`)).json().data;
    expect(a).toMatchObject({ error: "The calendar answered 503", failures: 1 });
  });

  it("holds a calendar that suddenly comes back empty, until an admin accepts it", async () => {
    feeds.set(A, ics());
    await sync();
    expect(await live()).toHaveLength(4);
    const [a] = (await call("GET", `/api/pages/${listing.id}/calendar-sources`)).json().data;
    expect(a).toMatchObject({ held: 0, events: 3 });
    expect((await call("POST", `/api/calendar-sources/${sourceA}/accept`)).statusCode).toBe(202);
    await work();
    // The shared meeting stays: the other calendar still has it.
    expect(await live()).toEqual(["Bengkel pelaburan", "Mesyuarat bersama"]);
  });

  it("updates a moved event, and puts back one that returns", async () => {
    feeds.set(
      A,
      ics(
        { uid: "shared-1", summary: "Mesyuarat bersama", day: tomorrow },
        {
          uid: "a-1",
          summary: "Taklimat Sabah",
          day: nextWeek,
          extra: "LOCATION:Kota Kinabalu\\, Sabah",
        },
      ),
    );
    feeds.set(
      B,
      ics(
        { uid: "shared-1", summary: "Mesyuarat bersama", day: tomorrow },
        { uid: "b-1", summary: "Bengkel pelaburan", day: nextWeek, at: "11:00", until: "12:00" },
      ),
    );
    const before = (await entries()).length;
    await sync();
    expect(await live()).toEqual(["Bengkel pelaburan", "Mesyuarat bersama", "Taklimat Sabah"]);
    // The same entry came back rather than a second one.
    expect((await entries()).length).toBe(before);
    const moved = (await entries()).find((e) => e.title === "Bengkel pelaburan")!;
    expect((await draftOf(moved.id)).entry.event.start).toBe(`${nextWeek}T11:00:00+08:00`);
  });

  it("takes off the events only a removed source had", async () => {
    expect((await call("DELETE", `/api/calendar-sources/${sourceB}`)).statusCode).toBe(204);
    await work();
    expect(await live()).toEqual(["Mesyuarat bersama", "Taklimat Sabah"]);
  });
});
