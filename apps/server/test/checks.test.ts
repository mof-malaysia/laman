import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBlock } from "@fiscal-sb/blocks";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import { type App, multipartFile, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-checks-"));
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

const call = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });

async function image(filename: string, alt: string) {
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } })
    .png()
    .toBuffer();
  const { id } = (
    await app.inject({ method: "POST", url: "/api/media", ...multipartFile(filename, png) })
  ).json().data;
  await call("PATCH", `/api/media/${id}`, { alt });
  return id as string;
}

/** A page whose draft is `blocks`, and what the check says about it. */
async function checked(slug: string, blocks: unknown[]) {
  const page = (await call("POST", "/api/pages", { title: slug, slug })).json().data;
  const { draft } = (await call("GET", `/api/pages/${page.id}`)).json().data;
  await call("PUT", `/api/pages/${page.id}/draft`, {
    draft: { ...draft, ms: { ...draft.ms, blocks } },
  });
  const checks = (await call("GET", `/api/pages/checks?ids=${page.id}`)).json().data[page.id];
  return {
    id: page.id as string,
    checks: checks as { code: string; severity: string; subject?: string }[],
  };
}

const intro = () => ({ ...newBlock("pageIntro"), props: { title: "Lesen perniagaan anda" } });
const prose = (content: unknown[]) => ({
  ...newBlock("prose"),
  props: { body: { type: "doc", content: [{ type: "paragraph", content }] } },
});
const linked = (text: string, href: string) => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }],
});

describe("checks before publishing", () => {
  it("finds nothing on a page that's ready", async () => {
    const { checks } = await checked("sedia", [
      intro(),
      prose([{ type: "text", text: "Pejabat dibuka setiap hari bekerja dari 8 pagi." }]),
    ]);
    expect(checks).toEqual([]);
  });

  it("stops a page with no main heading from going live", async () => {
    const { id, checks } = await checked("tiada-tajuk", [
      prose([{ type: "text", text: "Teks tanpa tajuk utama di atasnya." }]),
    ]);
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "noHeading", severity: "block" }),
    );
    const refused = await call("POST", `/api/pages/${id}/publish`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("page_not_ready");
    expect((await call("POST", "/api/publish", { pageIds: [id] })).statusCode).toBe(409);
  });

  it("warns about images without real alt text", async () => {
    const none = await image("bangunan.png", "");
    const file = await image("IMG_2041.png", "IMG_2041.png");
    const { checks } = await checked("gambar", [
      intro(),
      { ...newBlock("image"), props: { image: { mediaId: none } } },
      { ...newBlock("image"), props: { image: { mediaId: file } } },
    ]);
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "altMissing", severity: "warn" }),
    );
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "altFilename", subject: "IMG_2041.png" }),
    );
  });

  it("warns about links that go nowhere live, and link text that says nothing", async () => {
    await call("POST", "/api/pages", { title: "Belum siap", slug: "belum-siap" });
    const { checks } = await checked("pautan", [
      intro(),
      prose([
        linked("borang permohonan", "/belum-siap"),
        linked("klik sini", "/tiada-di-laman"),
        linked("carian", "/carian?q=lesen"),
      ]),
    ]);
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "linkNotLive", subject: "/belum-siap" }),
    );
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "linkMissing", subject: "/tiada-di-laman" }),
    );
    expect(checks).toContainEqual(
      expect.objectContaining({ code: "vagueLink", subject: "klik sini" }),
    );
    // The site's own search page is an address it has.
    expect(checks.filter((c) => c.subject?.startsWith("/carian"))).toEqual([]);
  });

  it("warns about example text left in from a block or template", async () => {
    const { checks } = await checked("contoh", [intro(), newBlock("callout")]);
    expect(checks.some((c) => c.code === "placeholder")).toBe(true);
  });
});
