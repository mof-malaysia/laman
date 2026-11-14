import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, sessionCookie, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-site-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    SITE_URL: "https://agensi.gov.my",
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
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
    // It says who saved the draft: the signed-in super admin.
    expect((await call("GET", "/api/publish/preview")).json().data.items).toEqual([
      { kind: "settings", editedBy: "pentadbir" },
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
    expect(waiting).toContainEqual(expect.objectContaining({ kind: "theme" }));
    expect(await live()).toContain("--_primary-600:37 99 235;");
    await publishDoc("theme");
    const html = await live();
    expect(html).toContain('<style id="site-theme">html:root{--_primary-50:');
    expect(html).toContain(`--_primary-200:250 204 21;`);
    const after = (await call("GET", "/api/theme")).json().data;
    expect(after).toMatchObject({ changed: false, previous: { preset: "ftds" } });
  });

  it("adds an accent for decoration, and takes it away again", async () => {
    const saved = await call("PUT", "/api/theme", {
      draft: { preset: "teal", accent: "#CB2043" },
    });
    expect(saved.statusCode).toBe(200);
    const doc = saved.json().data;
    expect(doc.draft.accent).toBe("#cb2043");
    expect(doc.draft.accentRamp["50"]).toHaveLength(3);
    await publishDoc("theme");
    const html = await live();
    expect(html).toContain("--_accent-brand:203 32 67;--_accent-bar:4px;");
    expect(html).toContain('class="site-accent-bar"');

    await call("PUT", "/api/theme", { draft: { preset: "teal" } });
    await publishDoc("theme");
    expect(await live()).not.toContain("--_accent-");
  });

  it("refuses an accent that isn't a colour", async () => {
    const res = await call("PUT", "/api/theme", { draft: { preset: "ftds", accent: "red" } });
    expect(res.statusCode).toBe(400);
  });

  it("needs a colour for a custom theme", async () => {
    const res = await call("PUT", "/api/theme", { draft: { preset: "custom" } });
    expect(res.statusCode).toBe(400);
    const bad = await call("PUT", "/api/theme", { draft: { preset: "custom", seed: "green" } });
    expect(bad.statusCode).toBe(400);
  });

  it("shows every place the colours go on a sample page", async () => {
    const sample = await call("POST", "/render/theme-sample", {
      theme: { preset: "teal", accent: "#cb2043" },
    });
    expect(sample.statusCode).toBe(200);
    expect(sample.body).toContain("--_accent-brand:203 32 67;");
    // Its made-up events, and the buttons, links and tags in their states.
    expect(sample.body).toContain("Taklimat pembekal baharu");
    expect(sample.body).toContain('id="contoh-keadaan"');
    expect(sample.body).toContain('name="robots" content="noindex"');
    // Nothing was saved.
    expect((await call("GET", "/api/theme")).json().data.changed).toBe(false);
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

describe("embeds", () => {
  const address = "https://peta.agensi.gov.my/embed?id=42";
  const frames = (html: string) => html.match(/<iframe[^>]*>/g) ?? [];
  const checksOf = async (id: string) =>
    (await call("GET", `/api/pages/checks?ids=${id}`)).json().data[id] as {
      code: string;
      subject?: string;
    }[];
  /** Saves the settings draft with these embeds, from its latest version. */
  const putEmbeds = async (embeds: { services?: string[]; hosts?: string[] }) => {
    const settings = (await call("GET", "/api/settings")).json().data;
    return call("PUT", "/api/settings", {
      draft: { ...settings.draft, embeds: { services: [], hosts: [], ...embeds } },
      base: settings.version,
    });
  };
  /** Adds blocks to the end of a page's draft. */
  const addBlocks = async (pageId: string, blocks: object[]) => {
    const { draft, draftVersion } = (await call("GET", `/api/pages/${pageId}`)).json().data;
    return call("PUT", `/api/pages/${pageId}/draft`, {
      draft: { ...draft, ms: { ...draft.ms, blocks: [...draft.ms.blocks, ...blocks] } },
      base: draftVersion,
    });
  };

  it("frames a site only once it's on the published list, and stops when it's taken off", async () => {
    const page = await home();
    const embed = { id: "peta", type: "embed", props: { title: "Peta pejabat", url: address } };
    expect((await addBlocks(page.id, [embed])).statusCode).toBe(200);

    // Not on the list: the check says so, and the published page leaves the block out.
    expect(await checksOf(page.id)).toContainEqual(
      expect.objectContaining({ code: "embedNotAllowed", subject: "peta.agensi.gov.my" }),
    );
    expect(frames(await publishHome())).toEqual([]);
    expect(await live()).not.toContain("Peta pejabat");

    // Listed in the draft only: still not framed, since the live list is what counts.
    const put = await putEmbeds({ hosts: ["Peta.Agensi.gov.my"] });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.draft.embeds.hosts).toEqual(["peta.agensi.gov.my"]);
    expect((await checksOf(page.id)).map((c) => c.code)).toContain("embedNotAllowed");

    // Published: every page is rendered again, now with the frame.
    const html = await publishDoc("settings");
    expect(frames(html)).toHaveLength(1);
    expect(html).toContain('src="https://peta.agensi.gov.my/embed?id=42"');
    expect(html).toContain('title="Peta pejabat"');
    expect((await checksOf(page.id)).map((c) => c.code)).not.toContain("embedNotAllowed");

    // The canvas and previews never frame another site: the builder's pages may frame only themselves.
    for (const mode of ["edit", "preview"]) {
      const render = await call("GET", `/render/pages/${page.id}?mode=${mode}&locale=ms`);
      expect(frames(render.body)).toEqual([]);
      expect(render.body).toContain("peta.agensi.gov.my");
    }

    // Taken off the list and published: the frame goes at once.
    await putEmbeds({});
    expect(frames(await publishDoc("settings"))).toEqual([]);
  });

  it("takes host names only on the list", async () => {
    for (const host of [
      "https://peta.agensi.gov.my",
      "peta.agensi.gov.my/embed",
      "*.gov.my",
      "localhost",
    ])
      expect((await putEmbeds({ hosts: [host] })).statusCode, host).toBe(400);
    expect((await putEmbeds({ services: ["tiada"] })).statusCode).toBe(400);
  });

  it("frames a built-in service's embed address once it's switched on, not the rest of its site", async () => {
    const created = (await call("POST", "/api/pages", { title: "Video", slug: "video" })).json();
    const page = { id: created.data.id as string };
    const video = (id: string, url: string) => ({ id, type: "embed", props: { title: id, url } });
    await addBlocks(page.id, [
      video("benam", "https://www.youtube.com/embed/dQw4w9WgXcQ"),
      video("tonton", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ]);
    const published = () => readFile(join(dataDir, "public", "video", "index.html"), "utf8");
    await call("POST", `/api/pages/${page.id}/publish`);
    await build();
    expect(frames(await published())).toEqual([]);
    // Off the published site, the card says what to do about each.
    const canvas = (await call("GET", `/render/pages/${page.id}?mode=edit&locale=en`)).body;
    expect(canvas).toContain("t switched on for this site");

    await putEmbeds({ services: ["youtube"] });
    await publishDoc("settings");
    const html = await published();
    expect(frames(html)).toHaveLength(1);
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain("watch?v=");
    expect((await checksOf(page.id)).filter((c) => c.code === "embedNotAllowed")).toHaveLength(1);
    const preview = (await call("GET", `/render/pages/${page.id}?mode=preview&locale=en`)).body;
    expect(preview).toContain("t an address YouTube gives for embedding");
  });

  it("lets only an Admin change what may be embedded", async () => {
    const settings = (await call("GET", "/api/settings")).json().data;
    const as = async (role: "editor" | "contentManager" | "admin", draft: object) => {
      const { cookie } = await sessionCookie(app, role);
      const { version } = (await call("GET", "/api/settings")).json().data;
      return app.inject({
        method: "PUT",
        url: "/api/settings",
        headers: { cookie },
        payload: { draft, base: version },
      });
    };
    const withVimeo = {
      ...settings.draft,
      embeds: { ...settings.draft.embeds, services: [...settings.draft.embeds.services, "vimeo"] },
    };
    for (const role of ["editor", "contentManager"] as const) {
      const refused = await as(role, withVimeo);
      expect(refused.statusCode, role).toBe(403);
      // The rest of the settings stay theirs to draft.
      const renamed = { ...settings.draft, contact: { ...settings.draft.contact, hours: role } };
      expect((await as(role, renamed)).statusCode, role).toBe(200);
    }
    const allowed = await as("admin", { ...withVimeo, contact: settings.draft.contact });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data.draft.embeds.services).toContain("vimeo");
  });
});
