import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-tree-"));
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

type Summary = { id: string; parentId: string | null; path: string; title: string; status: string };

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const pages = async (): Promise<Summary[]> => (await call("GET", "/api/pages")).json().data;
const byPath = async (path: string) => (await pages()).find((p) => p.path === path)!;
const create = async (title: string, slug: string, parentId?: string) => {
  const res = await call("POST", "/api/pages", { title, slug, ...(parentId ? { parentId } : {}) });
  expect(res.statusCode).toBe(201);
  return res.json().data as Summary;
};
const publish = async (id: string) => {
  expect((await call("POST", `/api/pages/${id}/publish`)).statusCode).toBe(202);
};
const build = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const save = async (page: Summary, redirect: object | null) => {
  const { draft } = (await call("GET", `/api/pages/${page.id}`)).json().data;
  return call("PUT", `/api/pages/${page.id}/draft`, { draft: { ...draft, redirect } });
};
const read = (path: string) => readFile(join(dataDir, "public", path), "utf8");

describe("page tree", () => {
  it("puts new pages under the home page, and paths follow the tree", async () => {
    const home = await byPath("/");
    const services = await create("Perkhidmatan", "perkhidmatan");
    expect(services.parentId).toBe(home.id);
    const zakat = await create("Zakat", "zakat", services.id);
    expect(zakat.path).toBe("/perkhidmatan/zakat");
    // Slugs are unique among siblings only.
    await create("Zakat", "zakat");
    const clash = await call("POST", "/api/pages", {
      title: "X",
      slug: "zakat",
      parentId: services.id,
    });
    expect(clash.json().error.code).toBe("slug_taken");
  });

  it("previews a move, then moves the subtree and redirects published addresses", async () => {
    const services = await byPath("/perkhidmatan");
    await publish(services.id);
    await publish((await byPath("/perkhidmatan/zakat")).id);
    await build();

    const dry = await call("POST", `/api/pages/${services.id}/move`, {
      slug: "servis",
      dryRun: true,
    });
    expect(dry.json().data.changes.map((c: { to: string }) => c.to)).toEqual([
      "/servis",
      "/servis/zakat",
    ]);
    expect((await byPath("/perkhidmatan")).id).toBe(services.id);

    const res = await call("POST", `/api/pages/${services.id}/move`, {
      slug: "servis",
      redirect: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.page.path).toBe("/servis");

    // A move goes live when it's confirmed: it queues its own rebuild.
    await build();
    const jobs = (await call("GET", "/api/jobs?kind=publish")).json().data.items;
    expect(jobs[0]).toMatchObject({ status: "done", payload: { trigger: "tree" } });
    expect(await read("servis/zakat/index.html")).toContain("Zakat");
    const stub = await read("perkhidmatan/zakat/index.html");
    expect(stub).toContain('content="0; url=/servis/zakat"');
    expect(stub).toContain("Halaman ini telah berpindah");
    expect(JSON.parse(await read("redirects.json"))["/perkhidmatan"]).toEqual({
      to: "/servis",
      status: 301,
    });
    const served = await call("GET", "/perkhidmatan/zakat/");
    expect(served.statusCode).toBe(301);
    expect(served.headers.location).toBe("/servis/zakat");
    expect(await read("sitemap.xml")).not.toContain("/perkhidmatan");
  });

  it("won't move a page under itself, or move the home page", async () => {
    const services = await byPath("/servis");
    const zakat = await byPath("/servis/zakat");
    const res = await call("POST", `/api/pages/${services.id}/move`, { parentId: zakat.id });
    expect(res.json().error.code).toBe("move_into_itself");
    const home = await byPath("/");
    expect((await call("POST", `/api/pages/${home.id}/move`, { slug: "x" })).statusCode).toBe(400);
  });

  it("reorders siblings", async () => {
    const zakat = await byPath("/zakat");
    await call("POST", `/api/pages/${zakat.id}/move`, { position: 0 });
    const home = await byPath("/");
    const order = (await pages()).filter((p) => p.parentId === home.id).map((p) => p.path);
    expect(order[0]).toBe("/zakat");
  });

  it("rejects redirect loops and chains", async () => {
    const a = await create("A", "a");
    const b = await create("B", "b");
    expect((await save(a, { to: "page", pageId: a.id, status: 301 })).json().error.code).toBe(
      "redirect_loop",
    );
    expect((await save(a, { to: "page", pageId: b.id, status: 302 })).statusCode).toBe(200);
    expect((await save(b, { to: "page", pageId: a.id, status: 301 })).json().error.code).toBe(
      "redirect_loop",
    );
    const c = await create("C", "c");
    expect((await save(c, { to: "page", pageId: a.id, status: 301 })).json().error.code).toBe(
      "redirect_chain",
    );
    expect((await save(b, { to: "url", url: "http://x.my", status: 301 })).statusCode).toBe(400);

    await publish(a.id);
    await publish(b.id);
    await build();
    expect(JSON.parse(await read("redirects.json"))["/a"]).toEqual({ to: "/b", status: 302 });
    expect((await pages()).find((p) => p.id === a.id)?.title).toBe("A");
  });

  it("duplicates a page beside it, with its child pages when asked", async () => {
    const services = await byPath("/servis");
    const res = await call("POST", `/api/pages/${services.id}/duplicate`, {
      includeChildren: true,
    });
    expect(res.statusCode).toBe(201);
    const copy = res.json().data;
    expect(copy).toMatchObject({
      title: "Perkhidmatan (salinan)",
      path: "/servis-salinan",
      status: "draft",
    });
    expect((await byPath("/servis-salinan/zakat")).status).toBe("draft");
    const again = await call("POST", `/api/pages/${services.id}/duplicate`, {});
    expect(again.json().data.path).toBe("/servis-salinan-2");
  });

  it("unpublishes a page and redirects its address", async () => {
    const zakat = await byPath("/zakat");
    const target = await byPath("/servis/zakat");
    await publish(zakat.id);
    const res = await call("POST", `/api/pages/${zakat.id}/unpublish`, { redirectTo: target.id });
    expect(res.json().data.status).toBe("draft");
    await build();
    expect(JSON.parse(await read("redirects.json"))["/zakat"].to).toBe("/servis/zakat");
  });

  it("previews and soft-deletes a page, asking what happens to its child pages", async () => {
    const services = await byPath("/servis");
    const home = await byPath("/");
    const { draft } = (await call("GET", `/api/pages/${home.id}`)).json().data;
    draft.ms.blocks[0].props.primaryAction.href = "/servis/zakat#syarat";
    await call("PUT", `/api/pages/${home.id}/draft`, { draft });

    const preview = (await call("GET", `/api/pages/${services.id}/delete-preview`)).json().data;
    expect(preview).toMatchObject({ published: true, inNavbar: true });
    expect(preview.descendants.map((d: { path: string }) => d.path)).toEqual(["/servis/zakat"]);
    expect(preview.linkedFrom.map((d: { path: string }) => d.path)).toEqual(["/"]);

    const ask = await call("DELETE", `/api/pages/${services.id}`);
    expect(ask.json().error.code).toBe("children_choice_required");
    // "zakat" is taken under the home page already, so the child pages can't move up.
    const clash = await call("DELETE", `/api/pages/${services.id}?children=lift`);
    expect(clash.json().error.code).toBe("slug_taken");
    expect((await call("DELETE", `/api/pages/${services.id}?children=delete`)).statusCode).toBe(
      204,
    );
    expect((await pages()).some((p) => p.path.startsWith("/servis/") || p.path === "/servis")).toBe(
      false,
    );

    const parent = await create("Induk", "induk");
    const child = await create("Anak", "anak", parent.id);
    expect((await call("DELETE", `/api/pages/${parent.id}?children=lift`)).statusCode).toBe(204);
    const lifted = (await pages()).find((p) => p.id === child.id);
    expect(lifted).toMatchObject({ path: "/anak", parentId: home.id });
  });

  it("says a page is in the navbar only when the navigation links to it", async () => {
    const top = await create("Lain-lain", "lain-lain");
    const parent = await create("Panduan", "panduan");
    const deep = await create("Panduan Zakat", "zakat-panduan", parent.id);
    const preview = async (id: string) =>
      (await call("GET", `/api/pages/${id}/delete-preview`)).json().data.inNavbar;
    const { draft } = (await call("GET", "/api/navigation")).json().data;
    await call("PUT", "/api/navigation", {
      draft: {
        ...draft,
        navbar: [{ type: "link", label: "Zakat", target: { kind: "page", pageId: deep.id } }],
      },
    });
    // Live too: until it's published, visitors see the default navbar of top-level pages.
    await call("POST", "/api/navigation/publish");
    // Top level but not in the navbar; deeper but linked from it (and so is its parent's subtree).
    expect(await preview(top.id)).toBe(false);
    expect(await preview(deep.id)).toBe(true);
    expect(await preview(parent.id)).toBe(true);
  });

  it("summarises the dashboard", async () => {
    await build();
    const data = (await call("GET", "/api/summary")).json().data;
    expect(data.waiting).toEqual((await call("GET", "/api/publish/preview")).json().data.items);
    expect(data.pages.total).toBe((await pages()).length);
    expect(data.recentEdits.length).toBeLessThanOrEqual(10);
    expect(data.publishes[0]).toMatchObject({ kind: "publish", status: "done" });
    expect(data.publishes[0].result.pages).toBeGreaterThan(0);
    expect(data.renderer.ok).toBe(true);
    expect(data.site.url).toBe("https://agensi.gov.my");
  });
});
