import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-site-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    SITE_URL: "https://agensi.gov.my",
  });
  app = await buildApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const build = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const home = async () => (await call("GET", "/api/pages")).json().data[0];
const live = () => readFile(join(dataDir, "public", "index.html"), "utf8");
const publishHome = async () => {
  await call("POST", `/api/pages/${(await home()).id}/publish`);
  await build();
  return live();
};
/** Rebuilds waiting for a time still to come. */
const scheduled = () =>
  app.db
    .selectFrom("jobs")
    .select(["run_at"])
    .where("run_at", "is not", null)
    .where("status", "=", "queued")
    .execute();
/** Publishes one site document, as its screen's Publish button does. */
const publishDoc = async (name: "settings" | "navigation" | "announcement" | "theme") => {
  const res = await call("POST", `/api/${name}/publish`);
  expect(res.statusCode).toBe(202);
  await build();
  return live();
};

describe("site settings and navigation", () => {
  it("starts with defaults, and drafts go live with their own publish", async () => {
    expect((await call("GET", "/render/live")).statusCode).toBe(404);
    const doc = (await call("GET", "/api/settings")).json().data;
    expect(doc.draft.identity.siteName).toBe("Laman Web Agensi");
    expect(doc.changed).toBe(false);

    const draft = {
      ...doc.draft,
      identity: {
        ...doc.draft.identity,
        siteName: "Jabatan Contoh",
        agencyName: "Jabatan Contoh Malaysia",
      },
      contact: {
        address: "Aras 3, Putrajaya",
        phone: "03-8000 8000",
        email: "aduan@contoh.gov.my",
        hours: "",
      },
      social: [{ platform: "facebook", url: "https://facebook.com/contoh" }],
      phase: { phase: "beta", feedbackUrl: "/maklum-balas" },
    };
    const saved = await call("PUT", "/api/settings", { draft });
    expect(saved.json().data.changed).toBe(true);
    const bad = await call("PUT", "/api/settings", {
      draft: { ...draft, contact: { ...draft.contact, email: "x" } },
    });
    expect(bad.statusCode).toBe(400);

    // The canvas shows the draft; publishing a page doesn't take the settings with it.
    const preview = await call("GET", `/render/pages/${(await home()).id}`);
    expect(preview.body).toContain("Jabatan Contoh Malaysia");
    expect(await publishHome()).not.toContain("Aras 3, Putrajaya");
    expect((await call("GET", "/api/publish/preview")).json().data.items).toEqual([
      { kind: "settings" },
    ]);
    const html = await publishDoc("settings");
    expect(html).toContain("Aras 3, Putrajaya");
    // The dashboard's thumbnail shows the live home page.
    const thumbnail = await call("GET", "/render/live");
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.body).toContain("Aras 3, Putrajaya");
    expect(html).toContain("https://facebook.com/contoh");
    expect(html).toContain("/maklum-balas");
    expect((await call("GET", "/api/settings")).json().data.changed).toBe(false);
  });

  it("keeps what was live for put back, and applies the publishing defaults on save", async () => {
    const before = (await call("GET", "/api/settings")).json().data;
    const renamed = { ...before.draft, identity: { ...before.draft.identity, siteName: "Baharu" } };
    await call("PUT", "/api/settings", { draft: renamed });
    await publishDoc("settings");
    const after = (await call("GET", "/api/settings")).json().data;
    expect(after.previous.identity.siteName).toBe(before.published.identity.siteName);

    // Keeping fewer revisions changes the admin, not the site: live at once, nothing to publish.
    const fewer = { ...after.draft, publishing: { ...after.draft.publishing, revisionsToKeep: 5 } };
    const saved = (await call("PUT", "/api/settings", { draft: fewer })).json().data;
    expect(saved.changed).toBe(false);
    expect(saved.published.publishing.revisionsToKeep).toBe(5);

    const preview = await call("GET", "/api/settings/prune-preview?keep=5");
    expect(preview.json().data).toEqual({ drafts: expect.any(Number), pages: expect.any(Number) });
    expect((await call("GET", "/api/settings/prune-preview?keep=1")).statusCode).toBe(400);
  });

  it("builds the navbar from the navigation, warning about pages that aren't live", async () => {
    const page = (
      await call("POST", "/api/pages", { title: "Perkhidmatan", slug: "perkhidmatan" })
    ).json().data;
    const nav = (await call("GET", "/api/navigation")).json().data.draft;
    const draft = {
      ...nav,
      navbar: [
        {
          type: "dropdown",
          label: "Servis",
          layout: "described",
          columns: 1,
          links: [
            {
              label: "Perkhidmatan",
              target: { kind: "page", pageId: page.id },
              description: "Semua",
              icon: "money",
            },
            { label: "Portal", target: { kind: "url", url: "https://www.malaysia.gov.my" } },
          ],
          groups: [],
          footerLink: { text: "Semua perkhidmatan", target: { kind: "page", pageId: page.id } },
        },
      ],
      footer: {
        columns: [
          {
            heading: "Pautan",
            links: [
              { label: "Portal", target: { kind: "url", url: "https://www.malaysia.gov.my" } },
            ],
          },
        ],
      },
    };
    const saved = (await call("PUT", "/api/navigation", { draft })).json().data;
    expect(saved.warnings.map((w: { path: string }) => w.path)).toEqual([
      "navbar.0.links.0",
      "navbar.0.footerLink",
    ]);

    expect(await publishHome()).not.toContain("https://www.malaysia.gov.my");
    const html = await publishDoc("navigation");
    expect(html).toContain("https://www.malaysia.gov.my");
    // The unpublished page is left out until it goes live.
    expect(html).not.toContain('href="/perkhidmatan"');
    await call("POST", `/api/pages/${page.id}/publish`);
    await build();
    expect(await readFile(join(dataDir, "public", "index.html"), "utf8")).toContain(
      'href="/perkhidmatan"',
    );
  });

  it("publishes the announcement on its own, between its dates", async () => {
    const announcement = (await call("GET", "/api/announcement")).json().data.draft;
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const draft = {
      ...announcement,
      on: true,
      tag: "Penyelenggaraan",
      variant: "warning",
      message: "Sistem ditutup sebentar.",
      from: later,
    };
    expect((await call("PUT", "/api/announcement", { draft })).json().data.changed).toBe(true);
    const nav = (await call("GET", "/api/navigation")).json().data.draft;
    await call("PUT", "/api/navigation", { draft: { ...nav, navbar: [] } });
    // Saving a draft schedules nothing; the canvas previews it.
    expect(await scheduled()).toEqual([]);
    expect((await call("GET", `/render/pages/${(await home()).id}`)).body).toContain(
      "Sistem ditutup sebentar.",
    );

    // Publishing it schedules a rebuild at its date, and leaves the navbar draft alone.
    expect(await publishDoc("announcement")).not.toContain("Sistem ditutup sebentar.");
    expect((await scheduled()).map((j) => j.run_at)).toEqual([later]);
    expect((await call("GET", "/api/navigation")).json().data.changed).toBe(true);

    await call("PUT", "/api/announcement", { draft: { ...draft, from: undefined } });
    expect(await publishDoc("announcement")).toContain("Sistem ditutup sebentar.");
    expect(await scheduled()).toEqual([]);
    await call("POST", "/api/navigation/discard");
  });

  it("previews an unsaved announcement, and keeps the one before a publish", async () => {
    const before = (await call("GET", "/api/announcement")).json().data;
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const draft = { ...before.draft, message: "Pejabat ditutup hari ini.", from: later };
    const preview = await call("POST", `/render/pages/${(await home()).id}/site`, {
      announcement: draft,
    });
    // Shown whatever its dates, and nothing was saved.
    expect(preview.body).toContain("Pejabat ditutup hari ini.");
    expect((await call("GET", "/api/announcement")).json().data.changed).toBe(false);

    await call("PUT", "/api/announcement", { draft: { ...draft, from: undefined } });
    await publishDoc("announcement");
    const after = (await call("GET", "/api/announcement")).json().data;
    expect(after.previous).toEqual(before.published);
  });

  it("discards draft changes", async () => {
    const doc = (await call("GET", "/api/navigation")).json().data;
    await call("PUT", "/api/navigation", { draft: { ...doc.draft, navbar: [] } });
    expect((await call("GET", "/api/navigation")).json().data.changed).toBe(true);
    const back = (await call("POST", "/api/navigation/discard")).json().data;
    expect(back.changed).toBe(false);
    expect(back.draft.navbar).toHaveLength(1);
  });

  it("checks and previews an unsaved navigation, as the live site will show it", async () => {
    const page = (
      await call("POST", "/api/pages", { title: "Draf sahaja", slug: "draf-sahaja" })
    ).json().data;
    const doc = (await call("GET", "/api/navigation")).json().data;
    const draft = {
      ...doc.draft,
      navbar: [
        { type: "link", label: "Belum siap", target: { kind: "page", pageId: page.id } },
        { type: "link", label: "Portal", target: { kind: "url", url: "https://www.gov.my" } },
      ],
    };
    const check = (await call("POST", "/api/navigation/check", { draft })).json().data;
    expect(check.warnings.map((w: { path: string }) => w.path)).toEqual(["navbar.0"]);
    const preview = await call("POST", `/render/pages/${(await home()).id}/site`, {
      navigation: draft,
    });
    expect(preview.body).toContain("https://www.gov.my");
    // Left out, as it will be when published, though the page exists as a draft.
    expect(preview.body).not.toContain('href="/draf-sahaja"');
    // Nothing was saved.
    expect((await call("GET", "/api/navigation")).json().data.changed).toBe(false);
  });

  it("keeps what was live before a publish, so it can be put back", async () => {
    const doc = (await call("GET", "/api/navigation")).json().data;
    await call("PUT", "/api/navigation", { draft: { ...doc.draft, navbar: [] } });
    await publishDoc("navigation");
    const after = (await call("GET", "/api/navigation")).json().data;
    expect(after.published.navbar).toEqual([]);
    expect(after.previous.navbar).toEqual(doc.published.navbar);
  });
});

describe("theme", () => {
  it("starts as FTDS Blue", async () => {
    const doc = (await call("GET", "/api/theme")).json().data;
    expect(doc).toMatchObject({ changed: false, previous: null, draft: { preset: "ftds" } });
    expect(doc.draft.primary["600"]).toEqual([37, 99, 235]);
    expect(await publishHome()).toContain("--_primary-600:37 99 235;");
  });

  it("makes a readable ramp from one colour on save, and publishes it on its own", async () => {
    const saved = await call("PUT", "/api/theme", {
      draft: { preset: "custom", seed: "#FACC15" },
    });
    expect(saved.statusCode).toBe(200);
    const doc = saved.json().data;
    expect(doc.changed).toBe(true);
    expect(doc.draft.seed).toBe("#facc15");
    // The yellow stays for washes; links and buttons get a darker shade.
    expect(doc.draft.primary["200"]).toEqual([250, 204, 21]);
    expect(doc.draft.primary["600"]).not.toEqual([250, 204, 21]);

    const waiting = (await call("GET", "/api/publish/preview")).json().data.items;
    expect(waiting).toContainEqual({ kind: "theme" });
    expect(await live()).toContain("--_primary-600:37 99 235;");
    await publishDoc("theme");
    const html = await live();
    expect(html).toContain('<style id="site-theme">html:root{--_primary-50:');
    expect(html).toContain(`--_primary-200:250 204 21;`);
    const after = (await call("GET", "/api/theme")).json().data;
    expect(after).toMatchObject({ changed: false, previous: { preset: "ftds" } });
  });

  it("needs a colour for a custom theme", async () => {
    const res = await call("PUT", "/api/theme", { draft: { preset: "custom" } });
    expect(res.statusCode).toBe(400);
    const bad = await call("PUT", "/api/theme", { draft: { preset: "custom", seed: "green" } });
    expect(bad.statusCode).toBe(400);
  });

  it("previews an unsaved theme without saving it", async () => {
    const preview = await call("POST", `/render/pages/${(await home()).id}/site`, {
      theme: { preset: "maroon" },
    });
    expect(preview.body).toContain("--_primary-600:138 28 43;");
    expect((await call("GET", "/api/theme")).json().data.changed).toBe(false);
  });
});

describe("admin preferences", () => {
  it("start in English, and a language applies on save without publishing", async () => {
    expect((await call("GET", "/api/preferences")).json().data).toEqual({ language: "en" });
    const saved = await call("PUT", "/api/preferences", { language: "ms" });
    expect(saved.statusCode).toBe(200);
    expect((await call("GET", "/api/preferences")).json().data).toEqual({ language: "ms" });
    expect((await call("PUT", "/api/preferences", { language: "fr" })).statusCode).toBe(400);
    expect((await call("GET", "/api/settings")).json().data.changed).toBe(false);
  });
});
