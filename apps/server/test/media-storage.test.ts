import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "@rstest/core";
import type { MediaStorageSave } from "@laman/contracts";
import { type App, multipartFile, signedInApp, TEST_BUCKETS, testMediaStore } from "./helpers.js";
import { checkStoredDocuments } from "../src/db/documents.js";
import { DEV_MEDIA_STORE, loadEnv } from "../src/env.js";
import { describeError } from "../src/offsite/stores.js";
import type { Kysely } from "kysely";
import sharp from "sharp";

const SECRET_KEY = "a-backup-secret-key-of-thirty-two-plus-characters";
/** The agency's "own" provider: a second bucket pair in the same RustFS. */
const OWN = { private: "laman-test-own-media", published: "laman-test-own-published" };

const own = (change: Partial<MediaStorageSave> = {}): MediaStorageSave => ({
  provider: "minio",
  endpoint: DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT,
  region: "",
  pathStyle: true,
  privateBucket: OWN.private,
  publishedBucket: OWN.published,
  publicUrl: "https://cdn.agensi.gov.my/",
  accessKeyId: DEV_MEDIA_STORE.MEDIA_STORE_ACCESS_KEY_ID,
  secret: DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY,
  ...change,
});

let dataDir: string;
let app: App;

beforeAll(async () => {
  await testMediaStore(OWN);
});

const boot = (env: Record<string, string> = { BACKUP_SECRET_KEY: SECRET_KEY }, role?: "admin") =>
  signedInApp(
    {
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        DATA_DIR: dataDir,
        ADMIN_DIST: join(dataDir, "none"),
        SITE_URL: "https://www.agensi.gov.my",
        ...env,
      }),
      databasePath: ":memory:",
      runJobs: false,
    },
    role,
  );

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-media-storage-"));
  app = await boot();
});
afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const view = async () => (await app.inject({ url: "/api/media-storage" })).json().data;
const save = (body: MediaStorageSave) =>
  app.inject({ method: "PUT", url: "/api/media-storage", payload: body });
const test = async (body: MediaStorageSave) =>
  (await app.inject({ method: "POST", url: "/api/media-storage/test", payload: body })).json().data;
const upload = async () =>
  (
    await app.inject({
      method: "POST",
      url: "/api/media",
      ...multipartFile("surat.pdf", Buffer.from("%PDF-1.7\n%%EOF")),
    })
  ).json().data as { id: string; url: string };
const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};

describe("media storage", () => {
  it("starts on the bundled store, and never sends a secret back", async () => {
    expect(await view()).toEqual({
      store: "bundled",
      own: null,
      canSave: true,
      files: { live: 0, deleted: 0 },
      offsite: false,
    });
    expect((await save(own())).statusCode).toBe(200);
    const saved = await view();
    expect(saved).toMatchObject({
      store: "own",
      own: {
        privateBucket: OWN.private,
        publicUrl: "https://cdn.agensi.gov.my",
        secretSaved: true,
      },
    });
    expect(JSON.stringify(saved)).not.toContain(DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY);
    // Sealed in site.db, and the row passes its schema.
    const row = await app.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", "mediaStorage")
      .executeTakeFirstOrThrow();
    expect(row.value).not.toContain(DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY);
    expect((await checkStoredDocuments(app.db as Kysely<unknown>)).failed).toBe(0);
  });

  it("is the super admin's alone", async () => {
    const admin = await boot({ BACKUP_SECRET_KEY: SECRET_KEY }, "admin");
    for (const [method, url] of [
      ["GET", "/api/media-storage"],
      ["PUT", "/api/media-storage"],
      ["DELETE", "/api/media-storage"],
      ["POST", "/api/media-storage/test"],
    ] as const)
      expect((await admin.inject({ method, url, payload: own() })).statusCode, url).toBe(403);
    await admin.close();
  });

  it("can't be set up without BACKUP_SECRET_KEY, which seals the secret", async () => {
    await app.close();
    app = await boot({});
    expect((await view()).canSave).toBe(false);
    const res = await save(own());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("backup_secret_key_missing");
  });

  it("tests a connection, and says what's wrong in plain words", async () => {
    expect(await test(own())).toEqual({ ok: true, bucket: null, error: null });
    expect(await test(own({ secret: "not-the-secret" }))).toMatchObject({
      ok: false,
      bucket: "private",
      error: "The secret key doesn't match the access key ID.",
    });
    expect(await test(own({ accessKeyId: "nobody" }))).toMatchObject({
      error: "The access key ID isn't recognised.",
    });
    expect(await test(own({ publishedBucket: "laman-test-no-such-bucket" }))).toMatchObject({
      ok: false,
      bucket: "published",
      error: "There's no bucket by that name. Check its name and the region.",
    });
    // RustFS doesn't check the region; AWS answers a wrong one like this.
    expect(describeError({ name: "AuthorizationHeaderMalformed" })).toMatch(/region/);
    expect(describeError({ name: "PermanentRedirect" })).toMatch(/region/);
  });

  it("isn't saved unless its test passes", async () => {
    const res = await save(own({ privateBucket: "laman-test-no-such-bucket" }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("media_storage_test_failed");
    expect((await view()).store).toBe("bundled");
    const same = await save(own({ publishedBucket: OWN.private }));
    expect(same.statusCode).toBe(400);
  });

  it("is locked while the library has a live file, and not by Recently deleted", async () => {
    const file = await upload();
    const locked = await save(own());
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error).toMatchObject({ code: "media_storage_locked" });
    expect(locked.json().error.message).toMatch(/1 file/);

    // Only in Recently deleted: the change goes ahead and purges it, for good.
    await app.inject({ method: "DELETE", url: `/api/media/${file.id}` });
    expect((await view()).files).toEqual({ live: 0, deleted: 1 });
    expect((await save(own())).statusCode).toBe(200);
    expect((await view()).files).toEqual({ live: 0, deleted: 0 });
    const bundled = app.mediaStorage.bundled;
    expect(await bundled.read("private", `media/${file.id}/original.pdf`).catch(() => null)).toBe(
      null,
    );

    // A live file in the new store: removing the setup is refused too.
    const there = await upload();
    const refused = await app.inject({ method: "DELETE", url: "/api/media-storage" });
    expect(refused.statusCode).toBe(409);
    // Rotating the keys of the same buckets moves nothing, so it's allowed.
    expect((await save(own({ publicUrl: "https://media.agensi.gov.my" }))).statusCode).toBe(200);

    await app.inject({ method: "DELETE", url: `/api/media/${there.id}` });
    const removed = await app.inject({ method: "DELETE", url: "/api/media-storage" });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data).toMatchObject({ store: "bundled", files: { deleted: 0 } });
    const actions = await app.db
      .selectFrom("audit_log")
      .select("action")
      .where("action", "=", "mediaStorageChanged")
      .execute();
    expect(actions).toHaveLength(3);
  });

  it("keeps an agency's files in its buckets, opens them by presigned links, and publishes to its address", async () => {
    expect((await save(own())).statusCode).toBe(200);
    const file = await upload();
    // A link straight to the provider, which the admin's CSP lets images load from.
    expect(file.url).toMatch(
      new RegExp(
        `^${DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT}/${OWN.private}/media/${file.id}/original.pdf\\?X-Amz-`,
      ),
    );
    expect((await fetch(file.url)).status).toBe(200);
    const admin = await app.inject({ url: "/api/media" });
    expect(admin.headers["content-security-policy"]).toContain(
      `img-src 'self' data: blob: ${DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT}`,
    );
    const store = await app.mediaStorage.current();
    expect(store.kind).toBe("own");
    expect(
      await app.mediaStorage.bundled
        .read("private", `media/${file.id}/original.pdf`)
        .catch(() => null),
    ).toBeNull();

    // A page that shows an image: published to the published bucket, linked at the CDN.
    const image = (
      await app.inject({
        method: "POST",
        url: "/api/media",
        ...multipartFile(
          "peta.png",
          await sharp({ create: { width: 600, height: 300, channels: 3, background: "#123" } })
            .png()
            .toBuffer(),
        ),
      })
    ).json().data as { id: string };
    await work();
    const home = (await app.inject({ url: "/api/pages" })).json().data[0];
    const { draft } = (await app.inject({ url: `/api/pages/${home.id}` })).json().data;
    draft.ms.blocks.push({
      id: "img1",
      type: "image",
      props: { image: { mediaId: image.id }, width: "content" },
    });
    const put = await app.inject({
      method: "PUT",
      url: `/api/pages/${home.id}/draft`,
      payload: { draft },
    });
    expect(put.statusCode).toBe(200);
    await app.inject({ method: "POST", url: `/api/pages/${home.id}/publish` });
    await work();
    expect(await store.read("published", `media/${image.id}/w480.webp`)).toBeTruthy();
    expect(
      await store.read("published", `media/${file.id}/original.pdf`).catch(() => null),
    ).toBeNull();
    const html = await readFile(join(dataDir, "public", "index.html"), "utf8");
    expect(html).toContain(`https://cdn.agensi.gov.my/media/${image.id}/w480.webp`);
    expect(html).not.toContain("X-Amz-");
    const visitor = await app.inject({
      url: `/media/${file.id}/original.pdf`,
      headers: { cookie: "" },
    });
    expect(visitor.statusCode).toBe(302);
    expect(visitor.headers.location).toBe(
      `https://cdn.agensi.gov.my/media/${file.id}/original.pdf`,
    );
  });

  it("uses the tests' own bundled buckets", () => {
    expect(app.mediaStorage.bundled.buckets).toEqual(TEST_BUCKETS);
  });
});
