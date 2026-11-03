import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { blockTypes, newBlock } from "@fiscal-sb/blocks";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const home = async () => {
  const res = await app.inject({ method: "GET", url: "/api/pages" });
  return res.json().data[0];
};

describe("server", () => {
  it("answers the ready check", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("starts with a home page", async () => {
    expect(await home()).toMatchObject({ slug: "", path: "/", title: "Utama", publishedAt: null });
  });

  it("creates pages with a starting block tree and unique slugs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pages",
      payload: { title: " Soalan lazim ", slug: "soalan-lazim" },
    });
    expect(res.statusCode).toBe(201);
    const page = res.json().data;
    expect(page.title).toBe("Soalan lazim");
    expect(page.draft.ms.blocks.map((b: { type: string }) => b.type)).toEqual([
      "pageIntro",
      "prose",
    ]);

    const again = await app.inject({
      method: "POST",
      url: "/api/pages",
      payload: { title: "X", slug: "soalan-lazim" },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("slug_taken");
  });

  it("creates pages from templates, and renders their blocks", async () => {
    for (const [template, text] of [
      ["perkhidmatan", "Borang dan panduan"],
      ["hubungi", "Saluran perhubungan"],
      ["utama", "Selamat datang"],
    ] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/api/pages",
        payload: { title: `Ujian ${template}`, slug: `ujian-${template}`, template },
      });
      expect(res.statusCode).toBe(201);
      const page = res.json().data;
      expect(page.template).toBe(template);
      const html = await app.inject({ method: "GET", url: `/render/pages/${page.id}?mode=edit` });
      expect(html.statusCode).toBe(200);
      expect(html.body).toContain(text);
    }
    const faq = await app.inject({ method: "GET", url: "/api/pages" });
    const perkhidmatan = faq
      .json()
      .data.find((p: { slug: string }) => p.slug === "ujian-perkhidmatan");
    const body = (await app.inject({ method: "GET", url: `/render/pages/${perkhidmatan.id}` }))
      .body;
    expect(body).toContain("Siapa yang layak memohon?");
    // An inner page opens with a Page intro and the trail from the home page.
    expect(body).toMatch(/<nav[^>]*aria-label="[^"]*"[^>]*>[\s\S]*href="\/"[\s\S]*Utama/);
    expect(body).toContain("Cara memohon");
  });

  it("renders every block's defaults on the canvas and as visitors see it", async () => {
    const { id } = await home();
    // One page per block, so each Hero or Page intro is the page's only opening.
    const renders = blockTypes.flatMap((type) =>
      (["edit", "preview"] as const).map(async (mode) => {
        const page = { title: "Utama", blocks: [newBlock(type, "b1")] };
        const res = await app.inject({
          method: "POST",
          url: `/render/pages/${id}`,
          payload: { page, mode },
        });
        return [type, mode, res.statusCode];
      }),
    );
    for (const [type, mode, status] of await Promise.all(renders))
      expect([type, mode, status]).toEqual([type, mode, 200]);
  });

  it("adds the FAQ's contact line and the callout's link", async () => {
    const { id } = await home();
    const faq = newBlock("faq", "f1");
    const res = await app.inject({
      method: "POST",
      url: `/render/pages/${id}`,
      payload: {
        page: {
          title: "Utama",
          blocks: [
            {
              ...faq,
              props: {
                ...faq.props,
                contactText: "Masih perlukan bantuan?",
                contactLink: { label: "Hubungi kami", href: "/hubungi" },
              },
            },
            {
              id: "c1",
              type: "callout",
              props: { title: "Makluman", action: { label: "Semak status", href: "/semak" } },
            },
          ],
        },
      },
    });
    expect(res.body).toContain("Masih perlukan bantuan?");
    expect(res.body).toMatch(/href="\/hubungi"[^>]*>\s*Hubungi kami/);
    expect(res.body).toMatch(/href="\/semak"[^>]*>[\s\S]*?Semak status/);
  });

  it("marks links to other websites, and only those", async () => {
    const { id } = await home();
    const res = await app.inject({
      method: "POST",
      url: `/render/pages/${id}`,
      payload: {
        page: {
          title: "Utama",
          blocks: [
            {
              id: "l1",
              type: "linkList",
              props: {
                items: [
                  { label: "Portal MyGov", href: "https://www.malaysia.gov.my" },
                  { label: "Soalan lazim", href: "/soalan-lazim" },
                ],
              },
            },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.match(/laman web luar/g)).toHaveLength(1);
  });

  it("rejects drafts that don't match the block registry", async () => {
    const { id } = await home();
    const res = await app.inject({
      method: "PUT",
      url: `/api/pages/${id}/draft`,
      payload: { draft: { ms: { title: "x", blocks: [{ id: "a", type: "script", props: {} }] } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("renders the draft with edit hooks on the canvas only", async () => {
    const { id } = await home();
    const edit = await app.inject({ method: "GET", url: `/render/pages/${id}?mode=edit` });
    expect(edit.statusCode).toBe(200);
    expect(edit.body).toContain("data-ftds-block=");
    expect(edit.body).toContain('data-ftds-field="title"');
    expect(edit.body).toContain("Perkhidmatan agensi, di satu tempat");

    const preview = await app.inject({ method: "GET", url: `/render/pages/${id}` });
    expect(preview.body).not.toContain("data-ftds-block");
    expect(preview.body).toContain('<meta name="robots" content="noindex"');
  });

  it("renders unsaved content sent by the editor", async () => {
    const { id } = await home();
    const res = await app.inject({
      method: "POST",
      url: `/render/pages/${id}`,
      payload: {
        page: {
          title: "Utama",
          blocks: [
            { id: "c1", type: "callout", props: { variant: "warning", title: "Belum disimpan" } },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Belum disimpan");
  });

  it("publishes a static site", async () => {
    const { id } = await home();
    const res = await app.inject({ method: "POST", url: `/api/pages/${id}/publish` });
    expect(res.statusCode).toBe(202);
    const { job } = res.json().data;
    expect(job.status).toBe("queued");

    app.jobs.poke();
    await app.jobs.idle();
    const done = await app.inject({ method: "GET", url: `/api/jobs/${job.id}` });
    expect(done.json().data).toMatchObject({ status: "done", error: null });

    const html = await readFile(join(dataDir, "public", "index.html"), "utf8");
    expect(html).toContain("Perkhidmatan agensi, di satu tempat");
    // Optional parts are rendered when filled in (the hero's eyebrow is a slot).
    expect(html).toContain("Selamat datang");
    expect(html).not.toMatch(/data-ftds-(block|field|mode)/);
    // Only published pages are linked; "soalan-lazim" was never published.
    expect(html).not.toContain('href="/soalan-lazim"');

    const served = await app.inject({ method: "GET", url: "/" });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe(html);
    const css = html.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
    expect(css).toBeTruthy();
    expect((await app.inject({ method: "GET", url: css! })).statusCode).toBe(200);

    expect((await home()).hasUnpublishedChanges).toBe(false);

    // Addresses the site doesn't have get its 404 page, in the site's layout.
    const missing = await app.inject({
      method: "GET",
      url: "/tiada-di-sini",
      headers: { accept: "text/html" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain("404");
    expect(missing.body).toContain('<meta name="robots" content="noindex"');
    expect(missing.body).toContain('href="/"');
  });

  it("publishes OpenAPI-documented page operations", async () => {
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();
    for (const path of ["/api/pages/{id}/move", "/api/pages/{id}/delete-preview", "/api/summary"])
      expect(doc.paths[path]).toBeTruthy();
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "not_found", message: "No route for GET /api/nope" },
    });
  });

  it("publishes an OpenAPI document built from the Zod schemas", async () => {
    const res = await app.inject({ method: "GET", url: "/openapi.json" });
    const doc = res.json();
    expect(doc.paths["/api/pages"].post.requestBody).toBeTruthy();
    expect(doc.paths["/render/pages/{id}"]).toBeUndefined();
  });
});
