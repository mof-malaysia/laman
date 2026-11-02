import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { newLoads } from "../src/content/loads.js";
import { publishedPages } from "../src/content/pages.js";
import { renderInputFor } from "../src/content/render-input.js";
import { loadEnv } from "../src/env.js";
import { MANIFEST_FILE, type Manifest, readManifest } from "../src/manifest.js";

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-publisher-"));
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
const live = (file: string) => join(dataDir, "public", ...file.split("/"));
const read = (file: string) => readFile(live(file), "utf8");
const inode = async (file: string) => (await stat(live(file))).ino;
const manifest = async () => (await readManifest(join(dataDir, "public"))) as Manifest;

/** Runs a publish to the end and returns its job, with its log. */
async function publish(url = "/api/publish") {
  const job = (await call("POST", url, {})).json().data.job;
  app.jobs.poke();
  await app.jobs.idle();
  return (await call("GET", `/api/jobs/${job.id}`)).json().data as {
    status: string;
    result: Record<string, number>;
    log: { path: string; outcome: string }[];
  };
}
/**
 * The site's files apart from the search index, whose files are named by their
 * content: that records each render's element ids, so a rebuild names them afresh.
 */
const files = async () =>
  Object.keys((await manifest()).outputs)
    .filter((f) => !f.startsWith("pagefind/"))
    .toSorted();
const written = (job: Awaited<ReturnType<typeof publish>>) =>
  job.log
    .filter((e) => e.outcome === "written")
    .map((e) => e.path)
    .toSorted();

let listing: { id: string };
let entries: { id: string }[] = [];

describe("incremental publishing", () => {
  it("builds the whole site the first time, with a manifest", async () => {
    listing = (
      await call("POST", "/api/pages", { title: "Berita", slug: "berita", template: "berita" })
    ).json().data;
    const settings = (await call("GET", `/api/pages/${listing.id}/listing`)).json().data.settings;
    await call("PUT", `/api/pages/${listing.id}/listing`, {
      settings: { ...settings, categories: [{ slug: "siaran-media", name: "Siaran media" }] },
    });
    // Two pages of entries (12 a page).
    for (let n = 1; n <= 14; n++) {
      const entry = (
        await call("POST", `/api/pages/${listing.id}/entries`, { title: `Notis ${n}` })
      ).json().data;
      entries.push(entry);
      await call("POST", `/api/pages/${entry.id}/publish`);
    }
    await call("POST", `/api/pages/${listing.id}/publish`);
    await call("POST", "/api/pages", { title: "Hubungi", slug: "hubungi" });
    const about = (await call("GET", "/api/pages"))
      .json()
      .data.find((p: { slug: string }) => p.slug === "hubungi");
    await call("POST", `/api/pages/${about.id}/publish`);
    const home = (await call("GET", "/api/pages")).json().data[0];
    await call("POST", `/api/pages/${home.id}/publish`);

    // The first of the publishes queued above built everything; this one confirms it.
    expect((await publish()).status).toBe("done");
    const outputs = (await manifest()).outputs;
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        "index.html",
        "berita/index.html",
        "berita/halaman/2/index.html",
        "berita/rss.xml",
        "hubungi/index.html",
        "sitemap.xml",
        "redirects.json",
      ]),
    );
    expect(Object.keys(outputs).some((f) => f.startsWith("_astro/"))).toBe(true);
  });

  it("writes nothing when nothing changed, and keeps the live files as they are", async () => {
    const before = await inode("hubungi/index.html");
    const job = await publish();
    expect(job.status).toBe("done");
    expect(job.log).toEqual([]);
    expect(job.result).toMatchObject({ full: 0, written: 0 });
    expect(job.result.unchanged).toBeGreaterThan(0);
    expect(await inode("hubungi/index.html")).toBe(before);
  });

  it("writes only what an entry's change reaches", async () => {
    // Show the newest entries on the home page, then publish once so that's settled.
    const home = (await call("GET", "/api/pages")).json().data[0];
    const { draft: homeDraft } = (await call("GET", `/api/pages/${home.id}`)).json().data;
    const block = {
      id: "le1",
      type: "latestEntries",
      props: { title: "Terkini", listing: listing.id, count: "3", style: "list", seeAll: "" },
    };
    await call("PUT", `/api/pages/${home.id}/draft`, {
      draft: { ...homeDraft, ms: { ...homeDraft.ms, blocks: [block] } },
    });
    await call("POST", `/api/pages/${home.id}/publish`);
    await publish();

    const newest = entries.at(-1)!;
    const { draft } = (await call("GET", `/api/pages/${newest.id}`)).json().data;
    await call("PUT", `/api/pages/${newest.id}/draft`, {
      draft: {
        ...draft,
        ms: { ...draft.ms, title: "Notis 14 dikemas kini" },
        entry: { ...draft.entry, category: "siaran-media" },
      },
    });
    const kept = await readFile(live("hubungi/index.html"), "utf8");
    const job = await publish(`/api/pages/${newest.id}/publish`);
    expect(job.status).toBe("done");
    // The entry stays on the listing's first page, so the second isn't touched.
    expect(written(job)).toEqual(
      ["/", "/berita", "/berita/kategori/siaran-media", "/berita/notis-14"].toSorted(),
    );
    expect(await read("berita/rss.xml")).toContain("Notis 14 dikemas kini");
    expect(await read("index.html")).toContain("Notis 14 dikemas kini");
    expect(await read("hubungi/index.html")).toBe(kept);
  });

  it("writes every page of the listing when a new entry pushes the others along", async () => {
    const entry = (
      await call("POST", `/api/pages/${listing.id}/entries`, { title: "Notis 15" })
    ).json().data;
    const job = await publish(`/api/pages/${entry.id}/publish`);
    expect(written(job)).toEqual(
      expect.arrayContaining(["/berita", "/berita/halaman/2", "/berita/notis-15"]),
    );
    expect(written(job)).not.toContain("/berita/notis-1");
  });

  it("leaves the live site and its manifest alone when a page can't be written", async () => {
    // A folder where the page's file should be, and a fingerprint saying it changed.
    const file = "berita/notis-1/index.html";
    await rm(live(file));
    await mkdir(join(live(file), "blocked"), { recursive: true });
    const m = await manifest();
    m.outputs[file] = "stale";
    await writeFile(live(MANIFEST_FILE), JSON.stringify(m));
    const before = await readFile(live(MANIFEST_FILE), "utf8");
    const job = await publish();
    expect(job.status).toBe("failed");
    expect(job.log).toContainEqual(
      expect.objectContaining({ path: "/berita/notis-1", outcome: "failed" }),
    );
    expect(await readFile(live(MANIFEST_FILE), "utf8")).toBe(before);
    await expect(stat(join(dataDir, "public.next"))).rejects.toThrow();
    await rm(live(file), { recursive: true });
    expect(written(await publish())).toEqual(["/berita/notis-1"]);
  });

  it("writes every page when the site around them changes", async () => {
    const settings = (await call("GET", "/api/settings")).json().data.draft;
    await call("PUT", "/api/settings", {
      draft: { ...settings, identity: { ...settings.identity, siteName: "Agensi Baharu" } },
    });
    const job = (await call("POST", "/api/settings/publish")).json().data.job;
    app.jobs.poke();
    await app.jobs.idle();
    const detail = (await call("GET", `/api/jobs/${job.id}`)).json().data;
    expect(detail.result.unchanged).toBe(0);
    expect(written(detail)).toContain("/hubungi");
    expect(await read("hubungi/index.html")).toContain("Agensi Baharu");
  });

  it("never writes through a link into the folder that was live", async () => {
    // Hold on to the live file as it was, the way a visitor's open download would.
    const held = join(dataDir, "held.html");
    await link(live("berita/index.html"), held);
    const before = await readFile(held, "utf8");
    const { draft } = (await call("GET", `/api/pages/${listing.id}`)).json().data;
    await call("PUT", `/api/pages/${listing.id}/draft`, {
      draft: { ...draft, ms: { ...draft.ms, title: "Berita terkini" } },
    });
    await publish(`/api/pages/${listing.id}/publish`);
    expect(await readFile(held, "utf8")).toBe(before);
    expect(await read("berita/index.html")).toContain("Berita terkini");
    await rm(held);
  });

  it("removes what's no longer published", async () => {
    const about = (await call("GET", "/api/pages"))
      .json()
      .data.find((p: { slug: string }) => p.slug === "hubungi");
    await call("POST", `/api/pages/${about.id}/unpublish`, {});
    app.jobs.poke();
    await app.jobs.idle();
    await expect(stat(live("hubungi/index.html"))).rejects.toThrow();
    await expect(stat(live("hubungi"))).rejects.toThrow();
    expect((await manifest()).outputs["hubungi/index.html"]).toBeUndefined();
  });

  it("writes a file again when its fingerprint doesn't match", async () => {
    const m = await manifest();
    m.outputs["berita/halaman/2/index.html"] = "stale";
    await writeFile(live(MANIFEST_FILE), JSON.stringify(m));
    expect(written(await publish())).toEqual(["/berita/halaman/2"]);
  });

  it("rebuilds everything without a manifest, or when asked", async () => {
    const before = await files();
    await rm(live(MANIFEST_FILE));
    const job = await publish();
    expect(job.result).toMatchObject({ full: 1, unchanged: 0 });
    expect(await files()).toEqual(before);
    const rebuild = await publish("/api/publish/rebuild");
    expect(rebuild.result).toMatchObject({ full: 1, unchanged: 0 });
    expect(await files()).toEqual(before);
  });

  it("keeps the manifest off the public site", async () => {
    expect((await app.inject({ method: "GET", url: `/${MANIFEST_FILE}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/.publish/" })).statusCode).toBe(404);
  });

  it("builds the same render input with a publish's shared reads as without", async () => {
    const loads = newLoads();
    for (const page of await publishedPages(app.db)) {
      const options = {
        pageId: page.id,
        kind: page.kind,
        path: page.path,
        doc: page.content,
        mode: "publish" as const,
        scope: "published" as const,
        siteUrl: "https://agensi.gov.my",
      };
      for (const extra of [{}, { listingPage: 2 }, { category: "siaran-media" }]) {
        if (page.kind !== "listing" && Object.keys(extra).length) continue;
        expect(await renderInputFor(app.db, { ...options, ...extra, loads })).toEqual(
          await renderInputFor(app.db, { ...options, ...extra }),
        );
      }
    }
  });
});
