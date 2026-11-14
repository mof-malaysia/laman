/**
 * Site search on the published site: a Pagefind index of every published
 * page's main content, and the pinned results the /carian page puts first.
 * The publisher writes both into public.next once its pages are there.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { PageDocument } from "@laman/blocks";
import type { SiteSearch } from "@laman/contracts";
import * as pagefind from "pagefind";

/**
 * Pagefind's version: a new one indexes the whole site again. Its package
 * exports only lib/, so its package.json is found on Node's lookup paths.
 */
export const pagefindVersion = (() => {
  const dirs = createRequire(import.meta.url).resolve.paths("pagefind") ?? [];
  const file = dirs.map((d) => join(d, "pagefind", "package.json")).find((f) => existsSync(f));
  return file ? (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version : "";
})();

/** Where the search page finds its pinned results. */
export const SEARCH_PINS_FILE = "carian/pins.json";

/** The type to send one of the index's files with; the rest Pagefind reads as bytes. */
export const searchFileType = (path: string) =>
  path.endsWith(".js")
    ? "text/javascript; charset=utf-8"
    : path.endsWith(".json")
      ? "application/json"
      : "application/octet-stream";

/**
 * The part of a rendered page the index reads: its `data-pagefind-body` (the
 * page's main content, with its filters and meta), in a bare document. Much
 * smaller than the page, so a cache of them stays small.
 */
export function searchableHtml(html: string) {
  const start = html.search(/<main\b[^>]*data-pagefind-body/);
  const end = html.lastIndexOf("</main>");
  const body = start === -1 || end === -1 ? html : html.slice(start, end + "</main>".length);
  return `<!doctype html><html lang="ms"><body>${body}</body></html>`;
}

/** Files Pagefind writes that /carian doesn't use: its ready-made interfaces. */
const unused = /^pagefind-(ui|modular-ui|component-ui|highlight)\b/;

/** The build running now: Pagefind's service is shared, and each build closes it when done. */
let running: Promise<unknown> = Promise.resolve();

/**
 * Indexes `files` (address → its HTML, read when it's indexed) and returns the
 * index's files, by their path inside the index folder. Pages are indexed by
 * their `data-pagefind-body`, in BM. One build runs at a time: a publish and
 * the draft index share Pagefind.
 */
export function buildSearchIndex(files: { url: string; read: () => Promise<string> }[]) {
  const build = running.then(() => indexFiles(files));
  running = build.catch(() => undefined);
  return build;
}

async function indexFiles(files: { url: string; read: () => Promise<string> }[]) {
  const created = await pagefind.createIndex({ forceLanguage: "ms" });
  const index = created.index;
  if (!index) throw new Error(`Search index: ${created.errors.join("; ")}`);
  try {
    for (const file of files) {
      const added = await index.addHTMLFile({ url: file.url, content: await file.read() });
      if (added.errors.length) throw new Error(`Search index, ${file.url}: ${added.errors[0]}`);
    }
    const out = await index.getFiles();
    if (out.errors.length) throw new Error(`Search index: ${out.errors.join("; ")}`);
    return out.files.filter((f) => !unused.test(f.path));
  } finally {
    await index.deleteIndex();
    await pagefind.close();
  }
}

/**
 * Each pinned word and the page it puts first, from the published `pages`.
 * Saving already gave each word to one pin; pins to pages that aren't
 * published are left out, and the Search screen warns about them.
 */
export function pinnedResults(
  search: SiteSearch,
  pages: { id: string; path: string; content: PageDocument }[],
) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: Record<string, { url: string; title: string; excerpt?: string }> = {};
  for (const pin of search.pins) {
    const page = byId.get(pin.pageId);
    if (!page) continue;
    const { title, description } = page.content.ms;
    for (const term of pin.terms)
      out[term] = { url: page.path, title, ...(description && { excerpt: description }) };
  }
  return out;
}
