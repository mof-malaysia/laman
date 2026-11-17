/**
 * A small client for the builder's API, for the seed scripts (demo-site.ts,
 * usability-site.ts): sign in, find or make a page, change its draft, publish,
 * and change and publish a site document, all through /api as an officer would.
 */
import type { PageDocument } from "@laman/blocks";
import type { Me, PageSummary } from "@laman/contracts";

export async function connect(base: string) {
  let cookie = "";
  async function call<T = Record<string, unknown>>(method: string, path: string, body?: object) {
    const response = await fetch(base + path, {
      method,
      headers: { cookie, ...(body && { "content-type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const set = response.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    if (response.status >= 400)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return (
      response.status === 204 ? undefined : ((await response.json()) as { data: T }).data
    ) as T;
  }

  const signIn = (username: string, password: string) =>
    call<Me>("POST", "/api/auth/sign-in", { username, password });

  const page = (id: string) =>
    call<{ draft: PageDocument; draftVersion: string }>("GET", `/api/pages/${id}`);
  async function change(id: string, edit: (draft: PageDocument) => PageDocument) {
    const { draft, draftVersion } = await page(id);
    await call("PUT", `/api/pages/${id}/draft`, { draft: edit(draft), base: draftVersion });
  }
  const publish = (id: string) => call("POST", `/api/pages/${id}/publish`);

  const pages = () => call<PageSummary[]>("GET", "/api/pages");
  /** The page with this slug (never the home page), made from `template` if there isn't one. */
  async function createPage(title: string, slug: string, template?: string) {
    const found = (await pages()).find((p) => p.slug === slug && p.parentId !== null);
    return (
      found?.id ?? (await call<{ id: string }>("POST", "/api/pages", { title, slug, template })).id
    );
  }

  /** Saves a site document's draft ("settings", "navigation", "announcement", …). */
  async function saveSite<T>(name: string, edit: (draft: T) => T) {
    const { draft, version } = await call<{ draft: T; version: string }>("GET", `/api/${name}`);
    await call("PUT", `/api/${name}`, { draft: edit(draft), base: version });
  }
  /** Saves a site document's draft, then makes it live. */
  async function site<T>(name: string, edit: (draft: T) => T) {
    await saveSite(name, edit);
    await call("POST", `/api/${name}/publish`);
  }

  return { call, signIn, change, publish, pages, createPage, saveSite, site };
}
