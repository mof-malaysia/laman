import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { migrations } from "../src/db/migrations.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-search-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
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
const live = (file: string) => join(dataDir, "public", ...file.split("/"));
const read = (file: string) => readFile(live(file), "utf8");
const exists = (file: string) =>
  stat(live(file)).then(
    () => true,
    () => false,
  );
const pages = async () =>
  (await call("GET", "/api/pages")).json().data as { id: string; slug: string }[];
/** How many pages the live index holds. */
const indexed = async () =>
  (
    JSON.parse(await read("pagefind/pagefind-entry.json")) as {
      languages: Record<string, { page_count: number }>;
    }
  ).languages.ms?.page_count;
const search = async () => (await call("GET", "/api/search")).json().data;
const publishSearch = async () => {
  expect((await call("POST", "/api/search/publish")).statusCode).toBe(202);
  await build();
};

let listing: { id: string };
let contact: { id: string };
let draftPage: { id: string };

describe("site search", () => {
  it("starts on, with filters and no pins", async () => {
    expect(await search()).toMatchObject({
      draft: { on: true, filters: true, pins: [] },
      published: { on: true, filters: true, pins: [] },
      changed: false,
      warnings: [],
      previous: null,
    });
  });

  it("indexes each published page once, by its main content, with its collection", async () => {
    listing = (
      await call("POST", "/api/pages", { title: "Berita", slug: "berita", template: "berita" })
    ).json().data;
    const settings = (await call("GET", `/api/pages/${listing.id}/listing`)).json().data.settings;
    await call("PUT", `/api/pages/${listing.id}/listing`, {
      settings: { ...settings, categories: [{ slug: "tender", name: "Tender" }] },
    });
    // Two pages of entries (12 a page): the second isn't indexed again.
    for (let n = 1; n <= 13; n++) {
      const entry = (
        await call("POST", `/api/pages/${listing.id}/entries`, { title: `Notis ${n}` })
      ).json().data;
      if (n === 1) {
        const page = (await call("GET", `/api/pages/${entry.id}`)).json().data;
        await call("PUT", `/api/pages/${entry.id}/draft`, {
          draft: { ...page.draft, entry: { ...page.draft.entry, category: "tender" } },
        });
      }
      await call("POST", `/api/pages/${entry.id}/publish`);
    }
    await call("POST", `/api/pages/${listing.id}/publish`);
    contact = (await call("POST", "/api/pages", { title: "Hubungi", slug: "hubungi" })).json().data;
    await call("POST", `/api/pages/${contact.id}/publish`);
    draftPage = (await call("POST", "/api/pages", { title: "Borang", slug: "borang" })).json().data;
    await call("POST", `/api/pages/${(await pages())[0]?.id}/publish`);
    await build();

    // Home, Hubungi, the listing and its 13 entries; not the unpublished page or /berita/halaman/2.
    expect(await indexed()).toBe(16);
    expect(await exists("pagefind/pagefind.js")).toBe(true);
    expect(await exists("pagefind/pagefind-ui.js")).toBe(false);

    const home = await read("index.html");
    expect(home).toContain('href="/carian"');
    expect(home).toMatch(/<main[^>]*data-pagefind-body/);
    expect(home).toContain('data-pagefind-filter="koleksi:Halaman"');
    const entry = await read("berita/notis-1/index.html");
    expect(entry).toContain('data-pagefind-filter="koleksi:Berita, kategori:Tender"');
    expect(entry).toMatch(/data-pagefind-meta="date:[^"]+"/);
  });

  it("writes a /carian page that works without JavaScript and isn't indexed by search engines", async () => {
    const page = await read("carian/index.html");
    expect(page).toContain('<form action="/carian" method="get"');
    expect(page).toContain('name="q"');
    expect(page).toContain("<noscript>");
    expect(page).toContain('<meta name="robots" content="noindex"');
    expect(JSON.parse(await read("carian/pins.json"))).toEqual({});
  });

  it("keeps the index as it is when no page changed", async () => {
    const before = (await stat(live("pagefind/pagefind-entry.json"))).ino;
    await call("POST", "/api/publish", {});
    await build();
    expect((await stat(live("pagefind/pagefind-entry.json"))).ino).toBe(before);
  });

  it("writes only the index files a changed page reaches", async () => {
    const files = async () =>
      new Map(
        await Promise.all(
          (await readdir(live("pagefind/fragment"))).map(
            async (f) => [f, (await stat(live(`pagefind/fragment/${f}`))).ino] as const,
          ),
        ),
      );
    const before = await files();
    const page = (await call("GET", `/api/pages/${contact.id}`)).json().data;
    await call("PUT", `/api/pages/${contact.id}/draft`, {
      draft: { ...page.draft, ms: { ...page.draft.ms, description: "Alamat dan waktu pejabat." } },
    });
    await call("POST", `/api/pages/${contact.id}/publish`);
    await build();
    const after = await files();
    // Every other page's fragment is the same file, still linked from the last publish.
    const kept = [...after].filter(([f, ino]) => before.get(f) === ino);
    expect(kept.length).toBeGreaterThan(after.size / 2);
    expect(kept.length).toBeLessThan(after.size);
  });

  it("saves pins with each word kept by its first page, and warns about pages that aren't live", async () => {
    const saved = (
      await call("PUT", "/api/search", {
        draft: {
          on: true,
          filters: true,
          pins: [
            { terms: ["Hubungi", " telefon ", "hubungi"], pageId: contact.id },
            { terms: ["telefon", "borang"], pageId: draftPage.id },
          ],
        },
      })
    ).json().data;
    expect(saved.draft.pins).toEqual([
      { terms: ["hubungi", "telefon"], pageId: contact.id },
      { terms: ["borang"], pageId: draftPage.id },
    ]);
    expect(saved.changed).toBe(true);
    expect(saved.warnings).toEqual([
      { path: "pins.1", message: expect.stringContaining("isn't published yet") },
    ]);
    const summary = (await call("GET", "/api/summary")).json().data;
    expect(summary.waiting).toContainEqual({ kind: "search" });
  });

  it("refuses a pin with no words or no page", async () => {
    const res = await call("PUT", "/api/search", {
      draft: { on: true, filters: true, pins: [{ terms: [], pageId: contact.id }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("publishes only the pins whose page is live", async () => {
    await publishSearch();
    expect(JSON.parse(await read("carian/pins.json"))).toEqual({
      hubungi: { url: "/hubungi", title: "Hubungi", excerpt: "Alamat dan waktu pejabat." },
      telefon: { url: "/hubungi", title: "Hubungi", excerpt: "Alamat dan waktu pejabat." },
    });
    expect((await search()).changed).toBe(false);
  });

  it("keeps the search addresses free under the home page", async () => {
    for (const slug of ["carian", "pagefind"]) {
      const res = await call("POST", "/api/pages", { title: "Carian", slug });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("slug_reserved");
    }
    const res = await call("POST", `/api/pages/${contact.id}/move`, { slug: "carian" });
    expect(res.json().error.code).toBe("slug_reserved");
    // Deeper down, the address is free.
    const child = await call("POST", "/api/pages", {
      title: "Carian",
      slug: "carian",
      parentId: contact.id,
    });
    expect(child.statusCode).toBe(201);
  });

  it("waits to go live on a site published before search existed", async () => {
    const before = await app.db
      .selectFrom("settings")
      .selectAll()
      .where("key", "like", "search.%")
      .execute();
    await app.db.deleteFrom("settings").where("key", "like", "search.%").execute();
    try {
      await migrations["0010_site_search"]?.up(app.db as never);
      expect(await search()).toMatchObject({
        draft: { on: true },
        published: { on: false },
        changed: true,
      });
      const summary = (await call("GET", "/api/summary")).json().data;
      expect(summary.waiting).toContainEqual({ kind: "search" });
    } finally {
      await app.db.deleteFrom("settings").where("key", "like", "search.%").execute();
      if (before.length) await app.db.insertInto("settings").values(before).execute();
    }
  });

  it("switched off, takes the link, the page and the index off the site, and can be put back", async () => {
    const { draft } = await search();
    await call("PUT", "/api/search", { draft: { ...draft, on: false } });
    await publishSearch();
    expect(await read("index.html")).not.toContain('href="/carian"');
    expect(await exists("carian/index.html")).toBe(false);
    expect(await exists("pagefind/pagefind.js")).toBe(false);

    const doc = await search();
    expect(doc.previous).toMatchObject({ on: true });
    await call("PUT", "/api/search", { draft: doc.previous });
    await publishSearch();
    expect(await exists("pagefind/pagefind.js")).toBe(true);
    expect(await read("index.html")).toContain('href="/carian"');
  });
});
