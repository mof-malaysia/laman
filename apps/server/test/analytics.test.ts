import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { parseAgent } from "../src/analytics/agent.js";
import { localDay } from "../src/analytics/db.js";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-analytics-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    TRUST_PROXY: "true",
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** A beacon from a visitor at `ip`, sent as a page would: text/plain, from the site's origin. */
const beacon = (
  body: object | string,
  { ip = "10.0.0.1", ua = firefox, origin = "http://localhost", gpc = false } = {},
) =>
  app.inject({
    method: "POST",
    url: "/_v",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": ua,
      "x-forwarded-for": ip,
      ...(origin && { origin }),
      ...(gpc && { "sec-gpc": "1" }),
    },
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });

const today = localDay(Date.now()).day;
const get = async (url: string) => {
  const res = await app.inject({ method: "GET", url });
  expect(res.statusCode).toBe(200);
  return res.json().data;
};
const summary = (extra = "") => get(`/api/analytics/summary?from=${today}&to=${today}${extra}`);
const top = (by: string, extra = "") =>
  get(`/api/analytics/breakdown?from=${today}&to=${today}&by=${by}${extra}`);

describe("analytics", () => {
  it("parses user agents coarsely", () => {
    expect(parseAgent(firefox)).toEqual({ browser: "Firefox", os: "Windows", device: "desktop" });
    expect(parseAgent(iphone)).toEqual({ browser: "Safari", os: "iOS", device: "mobile" });
  });

  it("drops beacons from bots, GPC browsers, other sites and bad bodies, always with 204", async () => {
    const view = { type: "view", id: "dropped01", path: "/" };
    const answers = await Promise.all([
      beacon(view, { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" }),
      beacon(view, { gpc: true }),
      beacon(view, { origin: "https://elsewhere.example" }),
      beacon(view, { origin: "" }),
      beacon("not json"),
      beacon({ type: "view", id: "x", path: "nope" }),
    ]);
    expect(answers.map((r) => r.statusCode)).toEqual([204, 204, 204, 204, 204, 204]);
    expect((await summary()).current.views).toBe(0);
  });

  it("counts views, visitors, visits, bounces and time visible", async () => {
    const home = (await get("/api/pages"))[0];
    // One visitor reads two pages; another reads one and leaves.
    await beacon({
      type: "view",
      id: "aaaaaaaa1",
      path: "/",
      page: home.id,
      referrer: "https://www.google.com/search?q=agensi",
      screen: 1280,
      language: "ms-MY",
      utm: { source: "newsletter" },
    });
    await beacon({ type: "leave", id: "aaaaaaaa1", visible: 4000 });
    await beacon({ type: "view", id: "aaaaaaaa2", path: "/perkhidmatan" });
    await beacon({ type: "leave", id: "aaaaaaaa2", visible: 6000 });
    await beacon(
      { type: "view", id: "bbbbbbbb1", path: "/", page: home.id, screen: 390, language: "en-GB" },
      { ip: "10.0.0.2", ua: iphone },
    );
    // A leave can't be added to someone else's view.
    await beacon({ type: "leave", id: "bbbbbbbb1", visible: 99_000 });
    await beacon({ type: "download", path: "/", target: "/media/abc/laporan.pdf" });
    await beacon({ type: "outbound", path: "/", target: "www.malaysia.gov.my" });

    const { current, series, interval } = await summary();
    expect(current).toEqual({
      views: 3,
      visitors: 2,
      visits: 2,
      bounceRate: 0.5,
      duration: 5000,
    });
    expect(interval).toBe("hour");
    expect(series).toHaveLength(24);
    expect(series.reduce((n: number, p: { views: number }) => n + p.views, 0)).toBe(3);

    const pages = await top("page");
    expect(pages.total).toBe(3);
    expect(pages.rows[0]).toMatchObject({ value: "/", pageId: home.id, count: 2, visitors: 2 });
    expect((await top("referrer")).rows).toEqual([
      { value: "www.google.com", count: 1, visitors: 1 },
    ]);
    expect((await top("utm_source")).rows[0].value).toBe("newsletter");
    expect((await top("device")).rows.map((r: { value: string }) => r.value).toSorted()).toEqual([
      "desktop",
      "mobile",
    ]);
    // The second page's beacon said no language: "" is unknown.
    expect((await top("language")).rows.map((r: { value: string }) => r.value).toSorted()).toEqual([
      "",
      "en",
      "ms",
    ]);
    expect((await top("entry")).rows[0]).toMatchObject({ value: "/", count: 2 });
    expect((await top("exit")).rows.map((r: { value: string }) => r.value).toSorted()).toEqual([
      "/",
      "/perkhidmatan",
    ]);
    expect((await top("download")).rows[0]).toMatchObject({ value: "/media/abc/laporan.pdf" });
    expect((await top("outbound")).rows[0]).toMatchObject({ value: "www.malaysia.gov.my" });

    // One page: its views, and time on it.
    const page = await summary(`&pageId=${home.id}`);
    expect(page.current).toMatchObject({ views: 2, visitors: 2, visits: 2, duration: 2000 });
  });

  it("keeps no address, and says how it stands", async () => {
    const rows = await app.analytics.db.selectFrom("views").selectAll().execute();
    expect(JSON.stringify(rows)).not.toContain("10.0.0.");
    const status = await get("/api/analytics/status");
    expect(status).toMatchObject({ on: true, countries: false, since: today });
  });

  it("writes the beacon into published pages only, takes it out when switched off, and marks publishes", async () => {
    const home = (await get("/api/pages"))[0];
    await app.inject({ method: "POST", url: `/api/pages/${home.id}/publish` });
    app.jobs.poke();
    await app.jobs.idle();
    const html = await readFile(join(dataDir, "public", "index.html"), "utf8");
    expect(html).toContain('navigator.sendBeacon("/_v"');
    expect(html).toContain(`data-page="${home.id}"`);
    const preview = await app.inject({ method: "GET", url: `/render/pages/${home.id}` });
    expect(preview.body).not.toContain("sendBeacon");

    const settings = (await get("/api/settings")).draft;
    await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { draft: { ...settings, analytics: { on: false, retentionDays: 60 } } },
    });
    // Retention applies on save; the switch waits for the publish.
    expect((await get("/api/settings")).published.analytics).toEqual({
      on: true,
      retentionDays: 60,
    });
    await app.inject({ method: "POST", url: "/api/settings/publish" });
    app.jobs.poke();
    await app.jobs.idle();
    expect(await readFile(join(dataDir, "public", "index.html"), "utf8")).not.toContain(
      "sendBeacon",
    );
    // Both publishes are marked on the chart.
    const marks = (await summary()).series.reduce(
      (n: number, p: { publishes: number }) => n + p.publishes,
      0,
    );
    expect(marks).toBe(2);
  });
});
