import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-listings-"));
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

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const read = (path: string) => readFile(join(dataDir, "public", path), "utf8");
type Entry = { id: string; path: string; status: string; draft: { entry: { publishAt: string } } };

let listing: { id: string; path: string };

describe("listing pages and entries", () => {
  it("makes a listing page from the Berita template, and keeps entries out of the tree", async () => {
    const res = await call("POST", "/api/pages", {
      title: "Berita",
      slug: "berita",
      template: "berita",
    });
    listing = res.json().data;
    expect(res.json().data).toMatchObject({ kind: "listing", entryCount: 0 });
    const settings = (await call("GET", `/api/pages/${listing.id}/listing`)).json().data.settings;
    await call("PUT", `/api/pages/${listing.id}/listing`, {
      settings: { ...settings, categories: [{ slug: "siaran-media", name: "Siaran media" }] },
    });
    const entry = (
      await call("POST", `/api/pages/${listing.id}/entries`, { title: "Belanjawan 2027" })
    ).json().data;
    expect(entry).toMatchObject({ kind: "entry", path: "/berita/belanjawan-2027" });
    const tree = (await call("GET", "/api/pages")).json().data;
    expect(tree.some((p: { id: string }) => p.id === entry.id)).toBe(false);
    expect(tree.find((p: { id: string }) => p.id === listing.id).entryCount).toBe(1);
  });

  it("rejects blocks a kind can't use, and a second entry list", async () => {
    const entries = (await call("GET", `/api/pages/${listing.id}/entries`)).json().data.items;
    const { draft } = (await call("GET", `/api/pages/${entries[0].id}`)).json().data;
    const hero = { id: "h1", type: "hero", props: { title: "x" } };
    const res = await call("PUT", `/api/pages/${entries[0].id}/draft`, {
      draft: { ...draft, ms: { ...draft.ms, blocks: [hero] } },
    });
    expect(res.json().error.code).toBe("blocks_not_allowed");
    const page = (await call("GET", `/api/pages/${listing.id}`)).json().data;
    const twice = await call("PUT", `/api/pages/${listing.id}/draft`, {
      draft: {
        ...page.draft,
        ms: { ...page.draft.ms, blocks: [...page.draft.ms.blocks, page.draft.ms.blocks[1]] },
      },
    });
    expect(twice.json().error.code).toBe("blocks_not_allowed");
  });

  it("publishes entries into the listing, its categories, pages and RSS", async () => {
    const items = (await call("GET", `/api/pages/${listing.id}/entries`)).json().data
      .items as Entry[];
    const first = items[0]!;
    const page = (await call("GET", `/api/pages/${first.id}`)).json().data;
    await call("PUT", `/api/pages/${first.id}/draft`, {
      draft: {
        ...page.draft,
        entry: { ...page.draft.entry, category: "siaran-media", summary: "Ringkasan belanjawan." },
      },
    });
    // Enough entries for a second page (12 a page).
    for (let n = 1; n <= 12; n++) {
      const e = (
        await call("POST", `/api/pages/${listing.id}/entries`, { title: `Notis ${n}` })
      ).json().data;
      await call("POST", `/api/pages/${e.id}/publish`);
    }
    await call("POST", `/api/pages/${first.id}/publish`);
    await call("POST", `/api/pages/${listing.id}/publish`);
    await work();

    const index = await read("berita/index.html");
    expect(index).toContain("Notis 12");
    expect(index).toContain("/berita/halaman/2");
    // Newest first: the twelve notices fill page 1, the older budget entry is on page 2.
    const second = await read("berita/halaman/2/index.html");
    expect(second).toContain("Belanjawan 2027");
    expect(second).not.toContain("Notis 12");
    const category = await read("berita/kategori/siaran-media/index.html");
    expect(category).toContain("Belanjawan 2027");
    expect(category).not.toContain("Notis 3");
    const rss = await read("berita/rss.xml");
    expect(rss).toContain("<title>Belanjawan 2027</title>");
    expect(rss).toContain("https://agensi.gov.my/berita/belanjawan-2027");
    const article = await read("berita/belanjawan-2027/index.html");
    expect(article).toContain("Siaran media");
    expect(await read("sitemap.xml")).toContain("/berita/belanjawan-2027");
  });

  it("schedules an entry dated in the future instead of publishing it", async () => {
    const entry = (
      await call("POST", `/api/pages/${listing.id}/entries`, { title: "Akan datang" })
    ).json().data;
    const page = (await call("GET", `/api/pages/${entry.id}`)).json().data;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await call("PUT", `/api/pages/${entry.id}/draft`, {
      draft: { ...page.draft, entry: { ...page.draft.entry, publishAt: later } },
    });
    const job = (await call("POST", `/api/pages/${entry.id}/publish`)).json().data.job;
    expect(job.runAt).toBe(later);
    expect((await call("GET", `/api/pages/${entry.id}`)).json().data.status).toBe("scheduled");
    await call("POST", "/api/publish");
    await work();
    expect(await read("berita/index.html")).not.toContain("Akan datang");
    await expect(
      access(join(dataDir, "public", "berita", "akan-datang", "index.html")),
    ).rejects.toThrow();
    const filtered = (await call("GET", `/api/pages/${listing.id}/entries?status=scheduled`)).json()
      .data;
    expect(filtered.items.map((e: Entry) => e.id)).toEqual([entry.id]);
  });

  it("shows a listing's latest entries on another page", async () => {
    const home = (await call("GET", "/api/pages")).json().data[0];
    const { draft } = (await call("GET", `/api/pages/${home.id}`)).json().data;
    const block = {
      id: "le1",
      type: "latestEntries",
      props: {
        title: "Berita terkini",
        listing: listing.id,
        count: "3",
        style: "list",
        seeAll: "Semua berita",
      },
    };
    expect(
      (
        await call("PUT", `/api/pages/${home.id}/draft`, {
          // After the hero, which holds the page's h1.
          draft: { ...draft, ms: { ...draft.ms, blocks: [draft.ms.blocks[0], block] } },
        })
      ).statusCode,
    ).toBe(200);
    await call("POST", `/api/pages/${home.id}/publish`);
    await work();
    const html = await read("index.html");
    expect(html).toContain("Berita terkini");
    expect(html).toContain("Notis 12");
    expect(html).not.toContain("Notis 9");
    expect(html).toContain('href="/berita"');
  });

  it("makes an ordinary page a listing page", async () => {
    const page = (await call("POST", "/api/pages", { title: "Tender", slug: "tender" })).json()
      .data;
    const res = await call("POST", `/api/pages/${page.id}/make-listing`);
    expect(res.json().data.kind).toBe("listing");
    expect(res.json().data.draft.ms.blocks.map((b: { type: string }) => b.type)).toContain(
      "entryList",
    );
    expect(
      (await call("POST", "/api/pages", { title: "X", slug: "x", parentId: page.id })).json().error
        .code,
    ).toBe("listing_parent");
  });

  it("previews a template before the page exists", async () => {
    const res = await call(
      "GET",
      "/render/templates/berita?title=Siaran%20media&path=/siaran-media",
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Siaran media");
    expect((await call("GET", "/render/templates/nope")).statusCode).toBe(400);
  });

  it("makes a collection from the blank template, and one with its template's categories", async () => {
    const page = (
      await call("POST", "/api/pages", {
        title: "Pekeliling",
        slug: "pekeliling",
        template: "koleksi",
      })
    ).json().data;
    expect(page.kind).toBe("listing");
    const settings = (await call("GET", `/api/pages/${page.id}/listing`)).json().data.settings;
    expect(settings.categories).toEqual([]);
    const tender = (
      await call("POST", "/api/pages", { title: "Tender", slug: "tender-2", template: "tender" })
    ).json().data;
    const tenderSettings = (await call("GET", `/api/pages/${tender.id}/listing`)).json().data
      .settings;
    expect(tenderSettings.categories.map((c: { slug: string }) => c.slug)).toEqual([
      "tender",
      "sebut-harga",
    ]);
  });

  it("starts an events collection's entries with their event details", async () => {
    const acara = (
      await call("POST", "/api/pages", { title: "Acara", slug: "acara", template: "acara" })
    ).json().data;
    const entry = (
      await call("POST", `/api/pages/${acara.id}/entries`, { title: "Taklimat Belanjawan" })
    ).json().data;
    expect(entry.draft.ms.blocks.map((b: { type: string }) => b.type)).toEqual(["eventDetails"]);
    const html = (await call("GET", `/render/pages/${entry.id}`)).body;
    expect(html).toContain("Khamis, 12 November 2026");
    expect(html).toContain("Pendaftaran");
  });

  it("searches entries across every listing by title or address, in one request", async () => {
    const pekeliling = (
      await call("POST", "/api/pages", { title: "Arahan", slug: "arahan", template: "koleksi" })
    ).json().data;
    const entry = (
      await call("POST", `/api/pages/${pekeliling.id}/entries`, {
        title: "Pelancaran Portal 100% Digital",
      })
    ).json().data;
    const search = async (query: string) => {
      const res = await call("GET", `/api/entries?${query}`);
      expect(res.statusCode).toBe(200);
      return res.json().data as { id: string; kind: string; parentId: string; path: string }[];
    };
    expect(await search("search=PELANCARAN")).toEqual([
      expect.objectContaining({ id: entry.id, kind: "entry", parentId: pekeliling.id }),
    ]);
    // By address, and with % taken literally rather than as a wildcard.
    expect((await search("search=portal-100")).map((e) => e.id)).toEqual([entry.id]);
    expect((await search("search=100%25")).map((e) => e.id)).toEqual([entry.id]);
    expect(await search("search=1%25D")).toEqual([]);
    // Entries in another listing match too; pages that aren't entries never do.
    expect((await search("search=belanjawan")).map((e) => e.path)).toContain(
      "/berita/belanjawan-2027",
    );
    expect(await search("search=arahan")).toEqual([]);
    expect(await search("search=a&limit=1")).toHaveLength(1);
    expect((await call("GET", "/api/entries")).statusCode).toBe(400);
  });
});
