/**
 * Redirects: old addresses that send visitors on. A page's own redirect lives
 * in its draft and publishes with it; the rows here come from moving,
 * unpublishing and deleting pages. Targets are page ids where they can be,
 * so a redirect follows its target through later renames and moves.
 */
import { randomUUID } from "node:crypto";
import type { PageDocument, RedirectStatus } from "@laman/blocks";
import { type Db, now } from "../db/index.js";

export async function addRedirect(
  db: Db,
  input: { source: string; pageId: string; createdBy: string; status?: RedirectStatus },
) {
  const values = {
    target_page_id: input.pageId,
    target_url: null,
    status: input.status ?? 301,
    page_id: input.createdBy,
    created_at: now(),
  };
  await db
    .insertInto("redirects")
    .values({ id: randomUUID(), source_path: input.source, ...values })
    .onConflict((oc) => oc.column("source_path").doUpdateSet(values))
    .execute();
}

export type LiveRedirect = { source: string; target: string; status: RedirectStatus };

type LivePage = { id: string; path: string; content: PageDocument };

/**
 * The redirects the published site serves, from the published pages and the
 * redirects table. Each goes straight to its final address: a target page
 * that redirects is followed one step, and anything that would loop, point
 * at a page that isn't live, or shadow a live page is left out.
 */
export async function liveRedirects(db: Db, pages: LivePage[]): Promise<LiveRedirect[]> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const own = (page: LivePage | undefined) => page?.content.redirect ?? null;
  /** Where visitors of a page end up: its own address, or where its redirect points. */
  const destination = (page: LivePage, seen: Set<string>): string | undefined => {
    const redirect = own(page);
    if (!redirect) return page.path;
    if (redirect.to === "url") return redirect.url;
    if (seen.has(redirect.pageId)) return undefined;
    const target = byId.get(redirect.pageId);
    return target && !own(target) ? target.path : undefined;
  };

  const out = new Map<string, LiveRedirect>();
  for (const page of pages) {
    const redirect = own(page);
    if (!redirect || page.path === "/") continue;
    const target = destination(page, new Set([page.id]));
    if (target && target !== page.path)
      out.set(page.path, { source: page.path, target, status: redirect.status });
  }

  // A page whose own redirect goes nowhere live is published as a page.
  const live = new Set(pages.map((p) => p.path).filter((path) => !out.has(path)));
  const rows = await db.selectFrom("redirects").selectAll().execute();
  for (const row of rows) {
    if (live.has(row.source_path) || out.has(row.source_path)) continue;
    const target =
      row.target_url ?? (row.target_page_id ? byId.get(row.target_page_id) : undefined);
    const to = typeof target === "string" ? target : target && destination(target, new Set());
    if (to && to !== row.source_path)
      out.set(row.source_path, { source: row.source_path, target: to, status: row.status });
  }
  return [...out.values()].toSorted((a, b) => a.source.localeCompare(b.source));
}
