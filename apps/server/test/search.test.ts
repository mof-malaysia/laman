import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DraftSearchIndex } from "@fiscal-sb/contracts";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";
import { draftSearchIndex } from "../src/draft-search.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-search-"));
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
    expect(summary.waiting).toContainEqual(expect.objectContaining({ kind: "search" }));
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

describe("draft search index", () => {
  const drafts = async () =>
    (await call("GET", "/api/search/drafts")).json().data as DraftSearchIndex;
  const file = (version: string, path: string) =>
    call("GET", `/api/search/drafts/${version}/${path}`);

  it("indexes every page's draft, unpublished ones included, with each one's status", async () => {
    const { version, pages } = await drafts();
    expect(pages["/borang"]).toBe("draft");
    expect(pages["/"]).toBe("published");
    expect(pages["/berita/notis-1"]).toBe("published");

    const script = await file(version, "pagefind.js");
    expect(script.statusCode).toBe(200);
    expect(script.headers["content-type"]).toContain("javascript");
    const entry = JSON.parse((await file(version, "pagefind-entry.json")).body) as {
      languages: Record<string, { page_count: number }>;
    };
    expect(entry.languages.ms?.page_count).toBe(Object.keys(pages).length);
    expect((await file("not-a-version", "pagefind.js")).statusCode).toBe(404);
  });

  it("sends the index's files as they are: they're gzip data already, never labelled compressed", async () => {
    const { version } = await drafts();
    const wasm = await app.inject({
      method: "GET",
      url: `/api/search/drafts/${version}/wasm.unknown.pagefind`,
      headers: { "accept-encoding": "gzip, br" },
    });
    expect(wasm.statusCode).toBe(200);
    expect(wasm.headers["content-encoding"]).toBeUndefined();
  });

  it("builds again only after a draft changes, and keeps the last build's files", async () => {
    const before = await drafts();
    expect((await drafts()).version).toBe(before.version);

    const page = (await call("GET", `/api/pages/${draftPage.id}`)).json().data;
    await call("PUT", `/api/pages/${draftPage.id}/draft`, {
      draft: { ...page.draft, ms: { ...page.draft.ms, description: "Borang permohonan lesen." } },
    });
    const after = await drafts();
    expect(after.version).not.toBe(before.version);
    // A search that started on the last version can still load it.
    expect((await file(before.version, "pagefind.js")).statusCode).toBe(200);
  });

  it("leaves out pages hidden from search engines, as the live site does", async () => {
    const page = (await call("GET", `/api/pages/${draftPage.id}`)).json().data;
    await call("PUT", `/api/pages/${draftPage.id}/draft`, {
      draft: { ...page.draft, seo: { ...page.draft.seo, noindex: true } },
    });
    expect((await drafts()).pages["/borang"]).toBeUndefined();
  });

  it("counts every write to what a render reads, whoever makes it", async () => {
    const count = async () =>
      (await app.db.selectFrom("content_changes").select("n").executeTakeFirstOrThrow()).n;
    const at = new Date().toISOString();
    const writes = [
      () =>
        app.db.updateTable("pages").set({ position: 0 }).where("id", "=", draftPage.id).execute(),
      () => app.db.updateTable("settings").set({ updated_by: null }).execute(),
      () =>
        app.db
          .insertInto("media")
          .values({
            id: "counted",
            filename: "a.png",
            type: "image/png",
            ext: "png",
            size: 1,
            width: 1,
            height: 1,
            status: "ready",
            deleted_at: null,
            replaced_at: null,
            previous: null,
            created_at: at,
            updated_at: at,
          })
          .execute(),
      () => app.db.deleteFrom("media").where("id", "=", "counted").execute(),
      () =>
        app.db
          .insertInto("redirects")
          .values({
            id: "counted",
            source_path: "/lama",
            target_page_id: null,
            target_url: "https://www.gov.my",
            status: 301,
            page_id: null,
            created_at: at,
          })
          .execute(),
      () => app.db.deleteFrom("redirects").where("id", "=", "counted").execute(),
    ];
    for (const write of writes) {
      const before = await count();
      await write();
      expect(await count()).toBeGreaterThan(before);
    }
  });

  it("keeps the index as it is while nothing it reads changes", async () => {
    const index = draftSearchIndex(app.db, () => {});
    const first = await index.current();
    await index.current();
    expect(index.builds()).toBe(1);

    const page = (await call("GET", `/api/pages/${draftPage.id}`)).json().data;
    await call("PUT", `/api/pages/${draftPage.id}/draft`, {
      draft: { ...page.draft, ms: { ...page.draft.ms, title: "Borang dan permohonan" } },
    });
    await index.current();
    expect(index.builds()).toBe(2);
    expect((await index.current()).key).not.toBe(first.key);
    expect(index.builds()).toBe(2);
  });

  it("is for signed-in users only", async () => {
    const { version } = await drafts();
    const anonymous = { headers: { cookie: "" } };
    expect(
      (await app.inject({ method: "GET", url: "/api/search/drafts", ...anonymous })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/search/drafts/${version}/pagefind.js`,
          ...anonymous,
        })
      ).statusCode,
    ).toBe(401);
  });
});
