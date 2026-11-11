import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDays, addMonths, dayOf, monthOf } from "@fiscal-sb/blocks";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { showsEvents } from "../src/content/entries.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-events-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const read = (path: string) => readFile(join(dataDir, "public", path), "utf8");

const today = dayOf(Date.now());
const thisMonth = monthOf(Date.now());
const lastMonth = addMonths(thisMonth, -1);
const inTwoMonths = addMonths(thisMonth, 2);

let listing: { id: string; path: string };

/** An Upcoming events block for the calendar. */
const upcomingBlock = (id: string, props: object) => ({
  id,
  type: "upcomingEvents",
  props: { listing: listing.id, ...props },
});

/** A published entry under the calendar with these event fields. */
async function event(title: string, fields: Record<string, unknown>) {
  const entry = (await call("POST", `/api/pages/${listing.id}/entries`, { title })).json().data;
  const page = (await call("GET", `/api/pages/${entry.id}`)).json().data;
  const res = await call("PUT", `/api/pages/${entry.id}/draft`, {
    draft: { ...page.draft, entry: { ...page.draft.entry, ...fields } },
  });
  expect(res.statusCode).toBe(200);
  await call("POST", `/api/pages/${entry.id}/publish`);
  return entry as { id: string; path: string };
}

describe("events and the event calendar", () => {
  it("makes a Takwim listing with an event calendar in place of the entry list", async () => {
    listing = (
      await call("POST", "/api/pages", { title: "Takwim", slug: "takwim", template: "takwim" })
    ).json().data;
    const settings = (await call("GET", `/api/pages/${listing.id}/listing`)).json().data.settings;
    expect(settings.sort).toBe("eventStart");
    const saved = await call("PUT", `/api/pages/${listing.id}/listing`, {
      settings: {
        ...settings,
        categories: [{ slug: "pasukan-a", name: "Pasukan A" }],
        locations: [
          { slug: "sabah", name: "Sabah" },
          { slug: "dalam-talian", name: "Dalam talian" },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    const page = (await call("GET", `/api/pages/${listing.id}`)).json().data;
    expect(page.draft.ms.blocks.map((b: { type: string }) => b.type)).toEqual([
      "pageIntro",
      "eventCalendar",
    ]);
  });

  it("refuses an entry list beside the calendar, and an event that ends before it starts", async () => {
    const page = (await call("GET", `/api/pages/${listing.id}`)).json().data;
    const both = await call("PUT", `/api/pages/${listing.id}/draft`, {
      draft: {
        ...page.draft,
        ms: {
          ...page.draft.ms,
          blocks: [...page.draft.ms.blocks, { id: "list1", type: "entryList", props: {} }],
        },
      },
    });
    expect(both.json().error.code).toBe("blocks_not_allowed");
    const entry = (
      await call("POST", `/api/pages/${listing.id}/entries`, { title: "Salah" })
    ).json().data;
    const draft = (await call("GET", `/api/pages/${entry.id}`)).json().data.draft;
    const backwards = await call("PUT", `/api/pages/${entry.id}/draft`, {
      draft: {
        ...draft,
        entry: {
          ...draft.entry,
          event: { start: `${today}T10:00:00+08:00`, end: `${today}T09:00:00+08:00` },
        },
      },
    });
    expect(backwards.statusCode).toBe(400);
  });

  it("publishes the agenda, a page per month, and a page per category and location", async () => {
    await event("Taklimat Sabah", {
      category: "pasukan-a",
      event: {
        start: `${addDays(today, 1)}T09:00:00+08:00`,
        end: `${addDays(today, 1)}T12:30:00+08:00`,
        location: "sabah",
        venue: "Dewan Kinabalu",
      },
    });
    await event("Bengkel lalu", { event: { start: `${lastMonth}-15T14:00:00+08:00` } });
    await event("Persidangan dalam talian", {
      pinned: true,
      event: {
        start: `${inTwoMonths}-10T00:00:00+08:00`,
        end: `${inTwoMonths}-12T00:00:00+08:00`,
        allDay: true,
        location: "dalam-talian",
      },
    });
    await call("POST", `/api/pages/${listing.id}/publish`);
    await work();

    // Tomorrow's month: its own page, whether or not it's this month.
    const soon = monthOf(Date.parse(`${addDays(today, 1)}T12:00:00+08:00`));
    const month = await read(`takwim/${soon}/index.html`);
    expect(month).toContain("Taklimat Sabah");
    expect(month).not.toContain("Bengkel lalu");
    expect(month).toContain("Esok");
    expect(month).toContain("9.00 pagi – 12.30 tengah hari");
    expect(month).toContain("Dewan Kinabalu");
    // The day in the calendar links down to it in the list under it.
    expect(month).toContain(`href="#hari-${addDays(today, 1)}"`);
    expect(month).toContain(`id="hari-${addDays(today, 1)}"`);

    // The listing's own address is the current month, with no agenda/month switch.
    const home = await read("takwim/index.html");
    expect(home).toContain(`<caption class="sr-only">`);
    expect(home).not.toContain("Persidangan dalam talian");

    // Months from last month to six ahead, stretched to the events; arrows and the row of months link them.
    const past = await read(`takwim/${lastMonth}/index.html`);
    expect(past).toContain("Bengkel lalu");
    expect(past).toContain('href="/takwim"');
    expect(past).not.toContain("Bulan sebelumnya");
    await read(`takwim/${addMonths(thisMonth, 6)}/index.html`);
    expect(home).toContain(`href="/takwim/${addMonths(thisMonth, 6)}"`);
    const later = await read(`takwim/${inTwoMonths}/index.html`);
    expect(later).toContain("Persidangan dalam talian");
    expect(later).toContain(
      `Acara ${new Intl.DateTimeFormat("ms-MY", { month: "long", year: "numeric" }).format(new Date(`${inTwoMonths}-15T12:00:00+08:00`))}`,
    );

    const sabah = await read(`takwim/lokasi/sabah/${soon}/index.html`);
    expect(sabah).toContain("Taklimat Sabah");
    await read("takwim/lokasi/sabah/index.html");
    const team = await read(`takwim/kategori/pasukan-a/${inTwoMonths}/index.html`);
    expect(team).not.toContain("Persidangan dalam talian");

    // An event's own page heads it with when and where, not the publish date.
    const entries = (await call("GET", `/api/pages/${listing.id}/entries`)).json().data.items;
    const taklimat = entries.find((e: { title: string }) => e.title === "Taklimat Sabah");
    const article = await read(`${taklimat.path.slice(1)}/index.html`);
    expect(article).toContain("Sabah · Dewan Kinabalu");
  });

  it("lists the listing's entries by event date: coming ones first, then past ones", async () => {
    const items = (await call("GET", `/api/pages/${listing.id}/entries`)).json().data.items as {
      title: string;
    }[];
    // Pinned on top, as in every listing; then by event date.
    expect(items.map((i) => i.title).filter((t) => t !== "Salah")).toEqual([
      "Persidangan dalam talian",
      "Taklimat Sabah",
      "Bengkel lalu",
    ]);
  });

  it("shows coming events on another page with an Upcoming events block", async () => {
    expect(await showsEvents(app.db)).toBe(true);
    const tree = (await call("GET", "/api/pages")).json().data;
    const home = tree.find((p: { parentId: string | null }) => p.parentId === null);
    const page = (await call("GET", `/api/pages/${home.id}`)).json().data;
    const saved = await call("PUT", `/api/pages/${home.id}/draft`, {
      draft: {
        ...page.draft,
        ms: {
          ...page.draft.ms,
          blocks: [
            ...page.draft.ms.blocks,
            upcomingBlock("coming", { title: "Akan datang" }),
            upcomingBlock("pinned", { title: "Acara utama", featuredOnly: true }),
          ],
        },
      },
    });
    expect(saved.statusCode).toBe(200);
    await call("POST", `/api/pages/${home.id}/publish`);
    await work();
    const html = await read("index.html");
    const coming = html.slice(html.indexOf("Akan datang"), html.indexOf("Acara utama"));
    expect(coming).toContain("Taklimat Sabah");
    expect(coming).toContain("Esok");
    expect(coming).not.toContain("Bengkel lalu");
    const pinned = html.slice(html.indexOf("Acara utama"));
    expect(pinned).toContain("Persidangan dalam talian");
    expect(pinned).not.toContain("Taklimat Sabah");
  });
  it("starts Acara entries as events, and lists them by their own day", async () => {
    const acara = (
      await call("POST", "/api/pages", { title: "Acara", slug: "acara", template: "acara" })
    ).json().data;
    const settings = (await call("GET", `/api/pages/${acara.id}/listing`)).json().data.settings;
    expect(settings.sort).toBe("eventStart");
    const entry = (
      await call("POST", `/api/pages/${acara.id}/entries`, { title: "Hari terbuka" })
    ).json().data;
    const draft = (await call("GET", `/api/pages/${entry.id}`)).json().data.draft;
    expect(draft.entry.event).toEqual({ start: `${addDays(today, 1)}T09:00:00+08:00` });
    expect(draft.ms.blocks.map((b: { type: string }) => b.type)).toEqual(["eventDetails"]);
    // Moved to next month, it lists under that day, not today's publish date.
    const day = `${addMonths(thisMonth, 1)}-20`;
    await call("PUT", `/api/pages/${entry.id}/draft`, {
      draft: { ...draft, entry: { ...draft.entry, event: { start: `${day}T10:00:00+08:00` } } },
    });
    await call("POST", `/api/pages/${entry.id}/publish`);
    await call("POST", `/api/pages/${acara.id}/publish`);
    await work();
    const html = await read("acara/index.html");
    expect(html).toContain(`datetime="${day}"`);
    expect(html).not.toContain(`datetime="${today}"`);
    // Its Event details block shows the entry's own date and time, with none typed in.
    const article = await read(`${entry.path.slice(1)}/index.html`);
    expect(article).toContain("10.00 pagi");
    expect(article).toContain("20 ");
    const checks = (await call("GET", `/api/pages/checks?ids=${entry.id}`)).json().data[entry.id];
    expect(checks.map((c: { code: string }) => c.code)).not.toContain("eventNoDate");
  });

  it("warns when Event details has no date and the entry isn't an event", async () => {
    const acara = (await call("GET", "/api/pages"))
      .json()
      .data.find((p: { path: string }) => p.path === "/acara");
    const entry = (
      await call("POST", `/api/pages/${acara.id}/entries`, { title: "Tanpa tarikh" })
    ).json().data;
    const draft = (await call("GET", `/api/pages/${entry.id}`)).json().data.draft;
    const { event: _, ...plain } = draft.entry;
    await call("PUT", `/api/pages/${entry.id}/draft`, { draft: { ...draft, entry: plain } });
    const checks = (await call("GET", `/api/pages/checks?ids=${entry.id}`)).json().data[entry.id];
    expect(checks.map((c: { code: string }) => c.code)).toContain("eventNoDate");
  });
});
