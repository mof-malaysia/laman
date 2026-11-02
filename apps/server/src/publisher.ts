/**
 * Writes the published site: every published revision through the renderer,
 * the redirects, the media they use, the renderer's assets, a sitemap and the
 * search index with its /carian page, into public.next, then swaps it into place. A failed build leaves the live site untouched.
 *
 * It's incremental: public.next starts as hard links to the live files, and
 * a file is only written again when its fingerprint (for a page, its whole
 * render input and the renderer build) differs from the one in the live
 * folder's manifest. `full` ignores the manifest and writes everything.
 */
import {
  copyFile,
  link,
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { type RenderInput, SEARCH_INDEX_DIR, SEARCH_PATH, mediaIdsOf } from "@fiscal-sb/blocks";
import type { PublishLogEntry } from "@fiscal-sb/contracts";
import { mediaFolders } from "./content/media.js";
import { publishedPages } from "./content/pages.js";
import { type LiveRedirect, liveRedirects } from "./content/redirects.js";
import { listingPagePath, rssFeed } from "./content/entries.js";
import { newLoads } from "./content/loads.js";
import { renderInputFor } from "./content/render-input.js";
import { readDoc, siteContext } from "./content/site.js";
import type { Db } from "./db/index.js";
import {
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

/** A publish that failed, with what happened to each page. The live site is untouched. */
export class PublishError extends Error {
  readonly log: PublishLogEntry[];
  constructor(message: string, log: PublishLogEntry[]) {
    super(message);
    this.log = log;
  }
}

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
const pageFile = (path: string) => [...path.split("/").filter(Boolean), "index.html"].join("/");

/** An address's file in a folder, from a path inside it ("berita/rss.xml"). */
const fileIn = (root: string, file: string) => join(root, ...file.split("/"));

/** The address a page file is for: the reverse of `pageFile`. */
const addressOf = (file: string) => `/${file.replace(/(^|\/)index\.html$/, "")}`;

/** Runs `task` over `items` a few at a time; waits for all of them before throwing. */
async function inPool<T>(items: T[], task: (item: T) => Promise<unknown>, size = 16) {
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) await task(items[i] as T);
  };
  const results = await Promise.allSettled(Array.from({ length: size }, worker));
  const failure = results.find((r) => r.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * `to` as a copy of `from` made of hard links: no file is copied, so it's
 * quick and costs no disk. Folders first, then the links, a few at a time so
 * a large site neither waits on each one nor runs out of file handles.
 */
async function linkTree(from: string, to: string) {
  const entries = await readdir(from, { recursive: true, withFileTypes: true });
  const target = (e: (typeof entries)[number]) => join(to, relative(from, e.parentPath), e.name);
  await mkdir(to, { recursive: true });
  await inPool(
    entries.filter((e) => e.isDirectory()),
    (e) => mkdir(target(e), { recursive: true }),
  );
  await inPool(
    entries.filter((e) => !e.isDirectory()),
    (e) => link(join(e.parentPath, e.name), target(e)),
  );
}

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
    await rm(dest, { force: true });
    await write(dest);
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
  const used = new Set<string>();
  mediaIdsOf(settings.identity, used);
  const log: PublishLogEntry[] = [];
  let unchanged = 0;
  /** Renders one address if it changed; a failure is logged and the publish carries on to log the rest. */
  const write = async (
    page: (typeof rendered)[number],
    path: string,
    extra: { listingPage?: number; category?: string } = {},
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
    try {
      const html = (dest: string) => renderHtml(input).then((text) => writeFile(dest, text));
      if (await put(pageFile(path), fingerprint(build, canonicalJson(input)), html))
        log.push({ ...entry, outcome: "written" });
      else unchanged++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.push({ ...entry, outcome: "failed", error: message, ...(await failingBlock(input)) });
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
    for (const category of input.listing?.categories ?? []) await writeListing(category.slug);
    if (input.listing?.rss)
      await putText(
        input.listing.rss.slice(1),
        await rssFeed(db, page.id, input.site.name, siteUrl, loads),
      );
  }
  const failed = log.filter((e) => e.outcome === "failed");
  if (failed.length) {
    await rm(next, { recursive: true, force: true });
    throw new PublishError(
      `${failed.length} page${failed.length === 1 ? "" : "s"} could not be rendered: ${failed.map((f) => f.path).join(", ")}`,
      log,
    );
  }
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
    const input: RenderInput = {
      mode: "publish",
      locale: "ms",
      path: SEARCH_PATH,
      page: { title: "Carian", blocks: [] },
      site: await siteContext(db, "published", SEARCH_PATH, siteUrl, {}, loads),
      noindex: true,
      searchPage: { filters: search.filters },
    };
    await put(pageFile(input.path), fingerprint(build, canonicalJson(input)), (dest) =>
      renderHtml(input).then((html) => writeFile(dest, html)),
    );
    // Each page once, by its main content: not a listing's later or category pages.
    const indexed = rendered.filter((p) => !p.content.seo?.noindex);
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
        indexed.map((p) => ({ url: p.path, path: fileIn(next, pageFile(p.path)) })),
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

  if (siteUrl && settings.search.sitemap && !settings.search.hideSite) {
    const origin = siteUrl.replace(/\/$/, "");
    const urls = rendered
      .filter((p) => !p.content.seo?.noindex && p.content.seo?.sitemap !== false)
      .map((p) => `  <url><loc>${escapeXml(origin + p.path)}</loc></url>`)
      .join("\n");
    await putText(
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  }

  // What the last publish wrote and this one didn't: gone from the site.
  for (const file of Object.keys(previous)) {
    if (file in outputs) continue;
    const dest = fileIn(next, file);
    await rm(dest, { force: true });
    await pruneEmpty(next, dirname(dest));
    if (file === "index.html" || file.endsWith("/index.html"))
      log.push({ pageId: null, path: addressOf(file), title: addressOf(file), outcome: "removed" });
  }
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
      unchanged,
      full: base ? 0 : 1,
    },
    log,
  };
}
