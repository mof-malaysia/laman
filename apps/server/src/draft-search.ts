/**
 * The draft search index: site search over every page's draft, so officers can
 * try search before anything is published (the Search screen's "Try a search",
 * with Include draft content ticked). Built like the published index (the same
 * Pagefind, each page's main content, the publisher's rules for which pages are
 * left out: those that redirect, and those hidden from search engines) but from drafts,
 * held in memory and served only to signed-in users under /api. It's built
 * when asked for. Asked again, it's kept as it is while nothing a render reads
 * has been written (the `content_changes` count the database's triggers keep),
 * the renderer is the same and no scheduled entry has gone live. Otherwise
 * a page whose render input is unchanged keeps its HTML, and an unchanged set
 * of pages keeps the whole index.
 */
import type { DraftSearchIndex } from "@laman/contracts";
import { newLoads } from "./content/loads.js";
import { draftPages } from "./content/pages.js";
import { liveRedirects } from "./content/redirects.js";
import { renderInputFor } from "./content/render-input.js";
import type { Db } from "./db/index.js";
import { canonicalJson, fingerprint } from "./manifest.js";
import { renderHtml, rendererBuild } from "./render.js";
import { buildSearchIndex, pagefindVersion, searchableHtml } from "./search.js";

type Built = DraftSearchIndex & {
  files: Map<string, Uint8Array>;
  /** What it was built from: the write count and the renderer. */
  key: string;
  /** When a scheduled entry goes live, changing a status: it's built again after. */
  until: number;
};

/** The write count and the renderer build: while both are the same, so is every draft render. */
async function changeKey(db: Db) {
  const [row, renderer] = await Promise.all([
    db.selectFrom("content_changes").select("n").where("id", "=", 1).executeTakeFirst(),
    rendererBuild(),
  ]);
  return `${row?.n ?? 0}:${renderer}`;
}

export function draftSearchIndex(db: Db, log: (message: string, error: unknown) => void) {
  /** What the index read of each address's last render, kept while its input is the same. */
  const rendered = new Map<string, { hash: string; html: string }>();
  let built: Built | undefined;
  /** The one before, so a search that started on it can still load its files. */
  let before: Built | undefined;
  /** A build under way, which every request waits for rather than starting its own. */
  let building: Promise<Built> | undefined;
  /** How many times the drafts were read and checked: for the tests. */
  let builds = 0;

  async function build(key: string): Promise<Built> {
    builds++;
    const [pages, renderer] = await Promise.all([draftPages(db), rendererBuild()]);
    const until = Math.min(Infinity, ...pages.flatMap((p) => p.goesLiveAt ?? []));
    // The publisher's rules: not a page visitors are sent away from, nor one hidden
    // from search engines. Each page once, by its main content.
    const redirected = new Set((await liveRedirects(db, pages)).map((r) => r.source));
    const loads = newLoads();
    const indexed: { url: string; hash: string; html: string }[] = [];
    const statuses: DraftSearchIndex["pages"] = {};
    for (const page of pages) {
      if (redirected.has(page.path) || page.content.seo?.noindex) continue;
      try {
        const input = await renderInputFor(db, {
          pageId: page.id,
          kind: page.kind,
          path: page.path,
          doc: page.content,
          mode: "publish",
          scope: "draft",
          loads,
        });
        const hash = fingerprint(renderer, canonicalJson(input));
        const kept = rendered.get(page.path);
        const html = kept?.hash === hash ? kept.html : searchableHtml(await renderHtml(input));
        rendered.set(page.path, { hash, html });
        indexed.push({ url: page.path, hash, html });
        statuses[page.path] = page.status;
      } catch (error) {
        // A draft that won't render isn't searchable; the editor's checks say why.
        log(`Draft search: ${page.path} didn't render`, error);
      }
    }
    for (const path of rendered.keys()) if (!(path in statuses)) rendered.delete(path);

    const version = fingerprint(pagefindVersion, ...indexed.map((p) => `${p.url}:${p.hash}`));
    // The same pages as last time (statuses can still change, by a publish).
    if (built?.version === version) return (built = { ...built, pages: statuses, key, until });
    const files = await buildSearchIndex(
      indexed.map((p) => ({ url: p.url, read: () => Promise.resolve(p.html) })),
    );
    before = built;
    return (built = {
      version,
      key,
      until,
      pages: statuses,
      files: new Map(files.map((f) => [f.path, f.content])),
    });
  }

  return {
    /** The index as the drafts are now, built first when they've changed. */
    async current(): Promise<Built> {
      building ??= (async () => {
        // Read first, so a write during the build makes the next request build again.
        const key = await changeKey(db);
        if (built?.key === key && Date.now() < built.until) return built;
        return build(key);
      })().finally(() => {
        building = undefined;
      });
      return building;
    },
    /** How many times it read and checked every draft, rather than keeping what it had. */
    builds: () => builds,
    /** One of an index's files, from the current build or the one before. */
    file(version: string, path: string): Uint8Array | undefined {
      return [built, before].find((b) => b?.version === version)?.files.get(path);
    },
  };
}
