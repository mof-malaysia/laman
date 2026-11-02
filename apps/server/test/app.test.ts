import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await buildApp({ env, databasePath: ":memory:", runJobs: false });
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
    expect(page.draft.ms.blocks.map((b: { type: string }) => b.type)).toEqual(["hero", "prose"]);

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
