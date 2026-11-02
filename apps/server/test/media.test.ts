import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { detectType, sanitizeSvg } from "../src/content/media.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-media-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    MEDIA_MAX_MB: "1",
  });
  app = await buildApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

/** A multipart/form-data body with one file. */
function form(filename: string, bytes: Buffer) {
  const boundary = "----sitebuilder";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const upload = (filename: string, bytes: Buffer) =>
  app.inject({ method: "POST", url: "/api/media", ...form(filename, bytes) });

const png = (width: number) =>
  sharp({ create: { width, height: 400, channels: 3, background: "#1f6feb" } })
    .png()
    .toBuffer();

const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};

describe("media", () => {
  it("knows files by their bytes, not their names", async () => {
    expect(detectType(await png(10))?.type).toBe("image/png");
    expect(detectType(Buffer.from("%PDF-1.7\n"))?.kind).toBe("document");
    expect(detectType(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))?.ext).toBe(
      "svg",
    );
    expect(detectType(Buffer.from("<html><script>"))).toBeNull();
  });

  it("strips scripts and handlers from SVG", () => {
    const clean = sanitizeSvg(
      '<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:x"><rect/></a><foreignObject><p/></foreignObject></svg>',
    );
    expect(clean).toBe("<svg><a><rect/></a></svg>");
  });

  it("uploads an image, then makes narrower copies in a job", async () => {
    const res = await upload("peta.png", await png(1200));
    expect(res.statusCode).toBe(201);
    const media = res.json().data;
    expect(media).toMatchObject({
      filename: "peta.png",
      kind: "image",
      width: 1200,
      status: "processing",
    });
    await work();
    const ready = (await app.inject({ method: "GET", url: `/api/media/${media.id}` })).json().data;
    expect(ready).toMatchObject({ status: "ready", variants: [480, 960] });
    const file = await app.inject({ method: "GET", url: ready.thumbnailUrl });
    expect(file.statusCode).toBe(200);
  });

  it("refuses other types and files over the limit", async () => {
    const html = await upload("x.html", Buffer.from("<html></html>"));
    expect(html.json().error.code).toBe("file_type_not_allowed");
    const big = await upload(
      "big.pdf",
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(1.2 * 1024 * 1024)]),
    );
    expect(big.statusCode).toBe(413);
  });

  it("tracks where a file is used, refuses to delete it, and publishes it", async () => {
    const { id } = (await upload("logo.png", await png(300))).json().data;
    await work();
    await app.inject({
      method: "PATCH",
      url: `/api/media/${id}`,
      payload: { alt: "Logo agensi", credit: "JPA" },
    });
    const home = (await app.inject({ method: "GET", url: "/api/pages" })).json().data[0];
    const { draft } = (await app.inject({ method: "GET", url: `/api/pages/${home.id}` })).json()
      .data;
    draft.ms.blocks.push({
      id: "img1",
      type: "image",
      props: { image: { mediaId: id }, width: "content" },
    });
    expect(
      (await app.inject({ method: "PUT", url: `/api/pages/${home.id}/draft`, payload: { draft } }))
        .statusCode,
    ).toBe(200);

    const used = (await app.inject({ method: "GET", url: `/api/media/${id}` })).json().data;
    expect(used.usedOn.map((p: { title: string }) => p.title)).toEqual(["Utama"]);
    const unused = (await app.inject({ method: "GET", url: "/api/media?unused=true" })).json().data;
    expect(unused.items.some((m: { id: string }) => m.id === id)).toBe(false);
    const del = await app.inject({ method: "DELETE", url: `/api/media/${id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe("media_in_use");

    const canvas = await app.inject({ method: "GET", url: `/render/pages/${home.id}?mode=edit` });
    expect(canvas.body).toContain(`/media/${id}/w`);
    expect(canvas.body).toContain('alt="Logo agensi"');
    expect(canvas.body).toContain("Kredit: JPA");

    await app.inject({ method: "POST", url: `/api/pages/${home.id}/publish` });
    await work();
    await access(join(dataDir, "public", "media", id, "original.png"));
    const html = await readFile(join(dataDir, "public", "index.html"), "utf8");
    expect(html).toContain(`srcset="/media/${id}/w`);
  });

  it("moves unused files to Recently deleted, and brings them back", async () => {
    const { id } = (await upload("lama.pdf", Buffer.from("%PDF-1.7\n%%EOF"))).json().data;
    const del = await app.inject({ method: "DELETE", url: `/api/media/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deletedAt).toBeTruthy();
    const library = (await app.inject({ method: "GET", url: "/api/media" })).json().data;
    expect(library.items.some((m: { id: string }) => m.id === id)).toBe(false);
    const trash = (await app.inject({ method: "GET", url: "/api/media?deleted=true" })).json().data;
    expect(trash.items.map((m: { id: string }) => m.id)).toEqual([id]);
    expect(trash.deleted).toBe(1);
    await access(join(dataDir, "media", id));

    const back = await app.inject({ method: "POST", url: `/api/media/${id}/restore` });
    expect(back.json().data.deletedAt).toBeNull();
    // Gone again, for the dashboard count below.
    await app.inject({ method: "DELETE", url: `/api/media/${id}` });
  });

  it("reports media on the dashboard", async () => {
    const { media } = (await app.inject({ method: "GET", url: "/api/summary" })).json().data;
    expect(media.count).toBe(2);
    expect(media.bytes).toBeGreaterThan(0);
  });

  it("counts images that need alt text, and lets an image be decorative", async () => {
    const { id } = (await upload("garis.png", await png(200))).json().data;
    const before = (await app.inject({ method: "GET", url: "/api/media?needsAlt=true" })).json()
      .data;
    expect(before.items.map((m: { id: string }) => m.id)).toContain(id);
    const saved = await app.inject({
      method: "PATCH",
      url: `/api/media/${id}`,
      payload: { decorative: true },
    });
    expect(saved.json().data.decorative).toBe(true);
    const after = (await app.inject({ method: "GET", url: "/api/media?needsAlt=true" })).json()
      .data;
    expect(after.items.map((m: { id: string }) => m.id)).not.toContain(id);
    expect(after.needsAlt).toBe(before.needsAlt - 1);
  });

  it("replaces a file, says it isn't live until a publish, and can put the old one back", async () => {
    const used = (await app.inject({ method: "GET", url: "/api/media?search=logo" })).json().data
      .items[0];
    const res = await app.inject({
      method: "PUT",
      url: `/api/media/${used.id}/file`,
      ...form("logo-baru.png", await png(500)),
    });
    expect(res.statusCode).toBe(200);
    const replaced = res.json().data;
    expect(replaced).toMatchObject({
      filename: "logo-baru.png",
      notLive: true,
      previous: { filename: "logo.png" },
    });
    // The live site keeps the old file until the next publish.
    expect(
      (await readFile(join(dataDir, "public", "media", used.id, "original.png"))).length,
    ).not.toBe((await readFile(join(dataDir, "media", used.id, "original.png"))).length);
    const waiting = (await app.inject({ method: "GET", url: "/api/publish/preview" })).json().data;
    expect(waiting.items).toContainEqual(
      expect.objectContaining({ kind: "media", id: used.id, filename: "logo-baru.png" }),
    );

    const before = await app.inject({ method: "GET", url: replaced.previous.url });
    expect(before.statusCode).toBe(200);
    expect(before.headers["content-type"]).toBe("image/png");

    const undone = await app.inject({ method: "POST", url: `/api/media/${used.id}/previous` });
    expect(undone.json().data).toMatchObject({
      filename: "logo.png",
      width: 300,
      previous: { filename: "logo-baru.png" },
    });

    // A publish with nothing chosen still rebuilds, taking the file live.
    await app.inject({ method: "POST", url: "/api/publish", payload: { pageIds: [], docs: [] } });
    await work();
    const live = (await app.inject({ method: "GET", url: `/api/media/${used.id}` })).json().data;
    expect(live.notLive).toBe(false);
  });

  it("keeps counting a page in Recently deleted as a use", async () => {
    const used = (await app.inject({ method: "GET", url: "/api/media?search=logo" })).json().data
      .items[0];
    const page = (
      await app.inject({
        method: "POST",
        url: "/api/pages",
        payload: { title: "Sementara", slug: "sementara" },
      })
    ).json().data;
    const { draft } = (await app.inject({ method: "GET", url: `/api/pages/${page.id}` })).json()
      .data;
    draft.ms.blocks.push({
      id: "img2",
      type: "image",
      props: { image: { mediaId: used.id }, width: "content" },
    });
    await app.inject({ method: "PUT", url: `/api/pages/${page.id}/draft`, payload: { draft } });
    await app.inject({ method: "DELETE", url: `/api/pages/${page.id}` });
    const detail = (await app.inject({ method: "GET", url: `/api/media/${used.id}` })).json().data;
    expect(detail.usedOn).toContainEqual(expect.objectContaining({ id: page.id, deleted: true }));
  });
});
