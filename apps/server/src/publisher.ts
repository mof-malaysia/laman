/**
 * Writes the published site: every published revision through the renderer,
 * the redirects, the media they use, the renderer's assets, a sitemap and the
 * search index with its /carian page, into public.next, then swaps it into place. A failed build leaves the live site untouched.
 * A page that fails to render doesn't stop the rest: it keeps its live copy
 * (or, new, stays off the site) and the log says which block broke it.
 *
 * It's incremental: public.next starts as hard links to the live files, and
 * a file is only written again when its fingerprint (for a page, its whole
 * render input and the renderer build) differs from the one in the live
 * folder's manifest. `full` ignores the manifest and writes everything.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { basename, dirname, join } from "node:path";
import {
  NOT_FOUND_FILE,
  type RenderInput,
  SEARCH_INDEX_DIR,
  SEARCH_PATH,
  calendarPath,
  mediaIdsOf,
} from "@fiscal-sb/blocks";
import type { PublishLogEntry } from "@fiscal-sb/contracts";
import { mediaFolders } from "./content/media.js";
import { publishedPages } from "./content/pages.js";
import { type LiveRedirect, liveRedirects } from "./content/redirects.js";
import { listingPagePath, rssFeed } from "./content/entries.js";
import { newLoads } from "./content/loads.js";
import { renderInputFor } from "./content/render-input.js";
import { readDoc, siteContext } from "./content/site.js";
import type { Db } from "./db/index.js";
import { inPool, linkTree } from "./files.js";
import {
  MANIFEST_DIR,
  MANIFEST_FILE,
  type Manifest,
  canonicalJson,
  filesIn,
  fingerprint,
  readManifest,
} from "./manifest.js";
import { renderHtml, rendererBuild, rendererClientDir } from "./render.js";
import { SEARCH_PINS_FILE, buildSearchIndex, pagefindVersion, pinnedResults } from "./search.js";

export type PublishOptions = {
  db: Db;
  dataDir: string;
  siteUrl?: string | undefined;
  /** Write every file, ignoring what the last publish left. */
  full?: boolean | undefined;
};

/** Renders a failing page's blocks one at a time to name the block that breaks it. */
async function failingBlock(input: RenderInput) {
  for (const block of input.page.blocks) {
    try {
      await renderHtml({ ...input, page: { ...input.page, blocks: [block] } });
    } catch {
      return { blockId: block.id, blockType: block.type };
    }
  }
  return {};
}

/** The map the public server reads to answer with a real 301 or 302. */
export const REDIRECTS_FILE = "redirects.json";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The page file for an address, relative to the folder: "/" is index.html, "/a/b" is a/b/index.html. */
/** Files worth sending compressed: images, fonts and the search index's fragments already are. */
const COMPRESSIBLE = /\.(html|css|js|mjs|json|xml|svg|txt|wasm)$/;
/** Smaller than this, compressing saves less than the bytes it costs to say so. */
const COMPRESS_MIN_BYTES = 1024;
/** The compressed copies written beside a file, and removed with it. */
const COPIES = [".br", ".gz"] as const;
const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/**
 * Writes `file.br` and `file.gz` beside a text file, so the server (or a
 * reverse proxy with `gzip_static` / `brotli_static`) sends them without
 * compressing on every visit. Higher settings save under 1% for half again the time.
 */
async function precompress(file: string) {
  const body = await readFile(file);
  if (body.length < COMPRESS_MIN_BYTES) return;
  const [br, gz] = await Promise.all([
    brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
    gzipped(body, { level: 6 }),
  ]);
  await Promise.all([writeFile(`${file}${COPIES[0]}`, br), writeFile(`${file}${COPIES[1]}`, gz)]);
}

/** Removes a file and its compressed copies: links into the live folder, never written through. */
const removeWithCopies = (file: string) =>
  Promise.all(["", ...COPIES].map((suffix) => rm(file + suffix, { force: true })));

/** A page's file in the published folder: "/berita" is "berita/index.html". */
export const pageFile = (path: string) =>
  [...path.split("/").filter(Boolean), "index.html"].join("/");

/** An address's file in a folder, from a path inside it ("berita/rss.xml"). */
const fileIn = (root: string, file: string) => join(root, ...file.split("/"));

/** The address a page file is for: the reverse of `pageFile`. */
const addressOf = (file: string) => `/${file.replace(/(^|\/)index\.html$/, "")}`;

/** Removes `dir` and the folders above it while they're empty, up to `root`. */
async function pruneEmpty(root: string, dir: string) {
  for (let d = dir; d.startsWith(root) && d !== root; d = dirname(d)) {
    try {
      await rmdir(d);
    } catch {
      return;
    }
  }
}

/**
 * A redirect that works on any static host: a meta refresh, a canonical link
 * and a plain link for anyone it doesn't move on.
 */
function redirectPage({ target }: LiveRedirect) {
  const href = escapeXml(target);
  return `<!doctype html>
<html lang="ms">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${href}" />
    <link rel="canonical" href="${href}" />
    <title>Halaman ini telah berpindah</title>
  </head>
  <body>
    <p><a href="${href}">Halaman ini telah berpindah</a></p>
  </body>
</html>
`;
}

export async function publishSite({ db, dataDir, siteUrl, full = false }: PublishOptions) {
  const live = join(dataDir, "public");
  const next = join(dataDir, "public.next");
  const old = join(dataDir, "public.old");
  await rm(next, { recursive: true, force: true });

  // Start from the live site, or from nothing when there's no manifest to trust.
  let base: Manifest | undefined = full ? undefined : await readManifest(live);
  if (base)
    await linkTree(live, next).catch(async () => {
      base = undefined;
      await rm(next, { recursive: true, force: true });
    });
  await mkdir(next, { recursive: true });
  const previous = base?.outputs ?? {};
  const outputs: Record<string, string> = {};
  /** Text files written this publish, compressed together before the swap. */
  const written = new Set<string>();
  /**
   * Writes `file` unless the live folder has it with the same fingerprint.
   * The file in public.next may be a link to the live one, so it's removed
   * first and written new, never written through.
   */
  const put = async (file: string, hash: string, write: (dest: string) => Promise<void>) => {
    outputs[file] = hash;
    if (previous[file] === hash) return false;
    const dest = fileIn(next, file);
    await mkdir(dirname(dest), { recursive: true });
    await removeWithCopies(dest);
    await write(dest);
    if (COMPRESSIBLE.test(file) && !file.startsWith(`${MANIFEST_DIR}/`)) written.add(dest);
    return true;
  };
  const putText = (file: string, text: string) =>
    put(file, fingerprint(text), (dest) => writeFile(dest, text));

  const [pages, settings, search, build] = await Promise.all([
    publishedPages(db),
    readDoc(db, "settings", "published"),
    readDoc(db, "search", "published"),
    rendererBuild(),
  ]);
  const redirects = await liveRedirects(db, pages);
  const redirected = new Set(redirects.map((r) => r.source));
  const rendered = pages.filter((p) => !redirected.has(p.path));

  const loads = newLoads();
  /** A page the site keeps for itself, not one in the tree: no blocks, never indexed. */
  const putSystemPage = async (
    path: string,
    file: string,
    title: string,
    kind: Pick<RenderInput, "searchPage" | "notFound">,
  ) => {
    const input: RenderInput = {
      mode: "publish",
      locale: "ms",
      path,
      page: { title, blocks: [] },
      site: await siteContext(db, "published", path, siteUrl, {}, loads),
      noindex: true,
      ...kind,
    };
    return put(file, fingerprint(build, canonicalJson(input)), (dest) =>
      renderHtml(input).then((html) => writeFile(dest, html)),
    );
  };
  const used = new Set<string>();
  mediaIdsOf(settings.identity, used);
  const log: PublishLogEntry[] = [];
  /** Pages that wouldn't render but stay on the site as they were: not swept away below. */
  const kept = new Set<string>();
  let unchanged = 0;
  /**
   * Renders one address if it changed. One that fails keeps what the live
   * site has (a new page just isn't published), out of the manifest so the
   * next publish tries it again, and the publish carries on without it.
   */
  const write = async (
    page: (typeof rendered)[number],
    path: string,
    extra: { listingPage?: number; category?: string; location?: string; month?: string } = {},
  ) => {
    const input = await renderInputFor(db, {
      pageId: page.id,
      kind: page.kind,
      path,
      doc: page.content,
      mode: "publish",
      scope: "published",
      siteUrl,
      noindex: settings.search.hideSite || (page.content.seo?.noindex ?? false),
      loads,
      ...extra,
    });
    const entry = { pageId: page.id, path, title: page.content.ms.title };
    const file = pageFile(path);
    try {
      const html = (dest: string) => renderHtml(input).then((text) => writeFile(dest, text));
      if (await put(file, fingerprint(build, canonicalJson(input)), html))
        log.push({ ...entry, outcome: "written" });
      else unchanged++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.push({ ...entry, outcome: "failed", error: message, ...(await failingBlock(input)) });
      // Not this render's fingerprint, so the next publish renders it again.
      if (file in previous) outputs[file] = previous[file]!;
      else delete outputs[file];
      const liveCopy = fileIn(live, file);
      if (existsSync(liveCopy)) {
        const dest = fileIn(next, file);
        if (!existsSync(dest)) {
          await copyFile(liveCopy, dest);
          written.add(dest);
        }
        kept.add(file);
      }
    }
    return input;
  };
  for (const page of rendered) {
    mediaIdsOf(page.content.ms, used);
    mediaIdsOf(page.content.entry, used);
    if (page.kind !== "listing") {
      await write(page, page.path);
      continue;
    }
    // A listing has its later pages, the same again per category, and RSS.
    const writeListing = async (category?: string) => {
      const first = await write(page, listingPagePath(page.path, 1, category), {
        ...(category && { category }),
      });
      for (let n = 2; n <= (first.listing?.pages ?? 1); n++)
        await write(page, listingPagePath(page.path, n, category), {
          listingPage: n,
          ...(category && { category }),
        });
      return first;
    };
    const input = await writeListing();
    const calendar = input.listing?.calendar;
    if (calendar) {
      // An event calendar: the current month at its own address, then each month, the same again per category and location.
      for (const filter of [
        undefined,
        ...calendar.categories.map((c) => ({ kind: "category" as const, slug: c.slug })),
        ...calendar.locations.map((l) => ({ kind: "location" as const, slug: l.slug })),
      ]) {
        const by = filter && { [filter.kind]: filter.slug };
        if (filter) await write(page, calendarPath(page.path, { filter }), by);
        for (const { month } of calendar.months)
          await write(page, calendarPath(page.path, { month, filter }), { ...by, month });
      }
    } else
      for (const category of input.listing?.categories ?? []) await writeListing(category.slug);
    if (input.listing?.rss)
      await putText(
        input.listing.rss.slice(1),
        await rssFeed(db, page.id, input.site.name, siteUrl, loads),
      );
  }
  // Pages that failed and were never live aren't on the site: not in the sitemap or the search index.
  const onSite = (p: (typeof rendered)[number]) =>
    pageFile(p.path) in outputs || kept.has(pageFile(p.path));
  const byPath = new Map(pages.map((p) => [p.path, p]));
  for (const redirect of redirects) {
    const page = byPath.get(redirect.source);
    if (await putText(pageFile(redirect.source), redirectPage(redirect)))
      log.push({
        pageId: page?.id ?? null,
        path: redirect.source,
        title: page?.content.ms.title ?? redirect.target,
        outcome: "redirect",
      });
  }
  await putText(
    REDIRECTS_FILE,
    `${JSON.stringify(
      Object.fromEntries(redirects.map((r) => [r.source, { to: r.target, status: r.status }])),
      null,
      2,
    )}\n`,
  );
  for (const file of await filesIn(rendererClientDir))
    await put(file, fingerprint(build, file), (dest) =>
      copyFile(fileIn(rendererClientDir, file), dest),
    );
  // Only the files published pages use; a file is copied again when it changes on disk.
  for (const folder of await mediaFolders(dataDir, used))
    for (const file of await filesIn(folder)) {
      const source = fileIn(folder, file);
      const { size, mtimeMs } = await stat(source);
      await put(`media/${basename(folder)}/${file}`, `${size}:${mtimeMs}`, (dest) =>
        copyFile(source, dest),
      );
    }

  if (search.on) {
    await putSystemPage(SEARCH_PATH, pageFile(SEARCH_PATH), "Carian", {
      searchPage: { filters: search.filters },
    });
    // Each page once, by its main content: not a listing's later or category pages.
    const indexed = rendered.filter((p) => !p.content.seo?.noindex && onSite(p));
    const hash = fingerprint(
      pagefindVersion,
      ...indexed.map((p) => `${p.path}:${outputs[pageFile(p.path)]}`),
    );
    // The entry file carries what the index was built from; the rest are named
    // by their content, so a rebuild writes only the files that changed.
    const entry = `${SEARCH_INDEX_DIR}/pagefind-entry.json`;
    if (previous[entry] === hash) {
      for (const [file, value] of Object.entries(previous))
        if (file.startsWith(`${SEARCH_INDEX_DIR}/`)) outputs[file] = value;
    } else {
      const files = await buildSearchIndex(
        indexed.map((p) => ({
          url: p.path,
          read: () => readFile(fileIn(next, pageFile(p.path)), "utf8"),
        })),
      );
      await inPool(files, (file) => {
        const path = `${SEARCH_INDEX_DIR}/${file.path}`;
        return put(path, path === entry ? hash : fingerprint(file.content), (dest) =>
          writeFile(dest, file.content),
        );
      });
    }
    await putText(SEARCH_PINS_FILE, `${JSON.stringify(pinnedResults(search, rendered))}\n`);
  }

  // For every address the site doesn't have, in the site's layout so people
  // can find their way on. The public server (or a reverse proxy) sends it with a 404.
  await putSystemPage("/404", NOT_FOUND_FILE, "Halaman tidak dijumpai", { notFound: true });

  if (siteUrl && settings.search.sitemap && !settings.search.hideSite) {
    const origin = siteUrl.replace(/\/$/, "");
    const urls = rendered
      .filter((p) => onSite(p) && !p.content.seo?.noindex && p.content.seo?.sitemap !== false)
      .map((p) => `  <url><loc>${escapeXml(origin + p.path)}</loc></url>`)
      .join("\n");
    await putText(
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  }

  // What the last publish wrote and this one didn't: gone from the site.
  for (const file of Object.keys(previous)) {
    if (file in outputs || kept.has(file)) continue;
    const dest = fileIn(next, file);
    await removeWithCopies(dest);
    await pruneEmpty(next, dirname(dest));
    if (file === "index.html" || file.endsWith("/index.html"))
      log.push({ pageId: null, path: addressOf(file), title: addressOf(file), outcome: "removed" });
  }
  await inPool([...written], precompress);
  await putText(MANIFEST_FILE, `${JSON.stringify({ version: 1, outputs } satisfies Manifest)}\n`);

  // Two renames: the live folder is missing only between them, never half-written.
  await rm(old, { recursive: true, force: true });
  await rename(live, old).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await rename(next, live);
  await rm(old, { recursive: true, force: true });
  return {
    counts: {
      pages: rendered.length,
      redirects: redirects.length,
      media: used.size,
      written: log.filter((e) => e.outcome === "written").length,
      failed: log.filter((e) => e.outcome === "failed").length,
      unchanged,
      full: base ? 0 : 1,
    },
    log,
  };
}
