import { existsSync } from "node:fs";
import { link, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { newLoads } from "../src/content/loads.js";
import { publishedPages } from "../src/content/pages.js";
import { renderInputFor } from "../src/content/render-input.js";
import { loadEnv } from "../src/env.js";
import { MANIFEST_FILE, type Manifest, readManifest } from "../src/manifest.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-publisher-"));
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

  it("serves pages at their address without a slash, compressed", async () => {
    // Compressed copies beside each page, but not beside files under 1 KB.
    expect(existsSync(live("berita/index.html.br"))).toBe(true);
    expect(existsSync(live("berita/index.html.gz"))).toBe(true);
    expect(existsSync(live("redirects.json.br"))).toBe(false);
    const page = await app.inject({
      method: "GET",
      url: "/berita",
      headers: { accept: "text/html", "accept-encoding": "br, gzip" },
    });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-encoding"]).toBe("br");
    const plain = await app.inject({ method: "GET", url: "/berita/halaman/2" });
    expect(plain.statusCode).toBe(200);
    expect(plain.body).toContain("<html");
    const slash = await app.inject({ method: "GET", url: "/berita/?kategori=1" });
    expect(slash.statusCode).toBe(301);
    expect(slash.headers.location).toBe("/berita?kategori=1");
    // An address the site doesn't have isn't redirected anywhere.
    expect((await app.inject({ method: "GET", url: "/tiada/" })).statusCode).toBe(404);
    // The search index is already-compressed data: it goes out as it is, never labelled compressed.
    const wasm = (await readdir(live("pagefind"))).find((f) => f.startsWith("wasm."))!;
    const index = await app.inject({
      method: "GET",
      url: `/pagefind/${wasm}`,
      headers: { "accept-encoding": "br, gzip" },
    });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-encoding"]).toBeUndefined();
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
      // After the hero, which holds the page's h1.
      draft: { ...homeDraft, ms: { ...homeDraft.ms, blocks: [homeDraft.ms.blocks[0], block] } },
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

  it("publishes the rest when a page won't render, and tries that one again next time", async () => {
    const pageBySlug = (slug: string) =>
      app.db
        .selectFrom("pages")
        .select(["id", "published_revision_id"])
        .where("slug", "=", slug)
        .executeTakeFirstOrThrow();
    // notis-1's live revision is one the renderer can't read, as if written by an older version.
    const { published_revision_id: revision } = await pageBySlug("notis-1");
    const { content } = await app.db
      .selectFrom("revisions")
      .select("content")
      .where("id", "=", revision!)
      .executeTakeFirstOrThrow();
    const doc = JSON.parse(content);
    const setContent = (value: unknown) =>
      app.db
        .updateTable("revisions")
        .set({ content: JSON.stringify(value) })
        .where("id", "=", revision!)
        .execute();
    await setContent({
      ...doc,
      ms: { ...doc.ms, blocks: [{ id: "bad1", type: "hero", props: null }] },
    });
    const keptPage = await read("berita/notis-1/index.html");
    const keptFingerprint = (await manifest()).outputs["berita/notis-1/index.html"];

    const contact = (await pageBySlug("hubungi")).id;
    const { draft } = (await call("GET", `/api/pages/${contact}`)).json().data;
    await call("PUT", `/api/pages/${contact}/draft`, {
      draft: { ...draft, ms: { ...draft.ms, title: "Hubungi kami sekarang" } },
    });
    const job = await publish(`/api/pages/${contact}/publish`);
    expect(job.status).toBe("done");
    expect(job.result.failed).toBe(1);
    expect(job.log).toContainEqual(
      expect.objectContaining({ path: "/berita/notis-1", outcome: "failed", blockId: "bad1" }),
    );
    expect(await read("hubungi/index.html")).toContain("Hubungi kami sekarang");
    // The live copy stays, under its old fingerprint, so the next publish tries again.
    expect(await read("berita/notis-1/index.html")).toBe(keptPage);
    expect((await manifest()).outputs["berita/notis-1/index.html"]).toBe(keptFingerprint);

    await setContent(doc);
    expect(written(await publish())).toContain("/berita/notis-1");
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
    // Its compressed copies go with it, and so does its folder.
    await expect(stat(live("hubungi/index.html.br"))).rejects.toThrow();
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
