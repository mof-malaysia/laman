import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import { listBackups, verifyBackup } from "../src/backup.js";
import { loadEnv } from "../src/env.js";
import {
  decryptFile,
  encryptFile,
  fingerprint,
  isEncrypted,
  seal,
  unseal,
} from "../src/offsite/crypt.js";
import { listRemote, malaysianMonthStart, pruneRemote } from "../src/offsite/index.js";
import type { RemoteStore, StoreConfig } from "../src/offsite/stores.js";
import { type App, signedInApp } from "./helpers.js";

const SECRET_KEY = "a test key that is long enough to seal secrets";
const PASSPHRASE = "kuda kepang makan durian";

/** A bucket in memory, with switches to make it refuse things. */
class MemoryStore implements RemoteStore {
  readonly objects = new Map<string, { data: Buffer; sha256: string | null; at: string }>();
  failPut = false;
  canDelete = true;
  configs: StoreConfig[] = [];

  async put(key: string, file: string, sha256: string) {
    if (this.failPut) throw Object.assign(new Error("denied"), { name: "AccessDenied" });
    this.objects.set(key, { data: await readFile(file), sha256, at: new Date().toISOString() });
  }
  async putText(key: string, text: string) {
    if (this.failPut) throw Object.assign(new Error("denied"), { name: "AccessDenied" });
    this.objects.set(key, { data: Buffer.from(text), sha256: null, at: new Date().toISOString() });
  }
  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { bytes: object.data.length, sha256: object.sha256 } : null;
  }
  async list(prefix: string) {
    return [...this.objects]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, o]) => ({ key, bytes: o.data.length, at: o.at }));
  }
  async get(key: string, file: string) {
    await writeFile(file, this.objects.get(key)!.data);
  }
  async delete(key: string) {
    if (!this.canDelete) throw Object.assign(new Error("denied"), { name: "AccessDenied" });
    this.objects.delete(key);
  }
}

let root: string;
let store: MemoryStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "laman-offsite-"));
  store = new MemoryStore();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const boot = (env: Record<string, string> = { BACKUP_SECRET_KEY: SECRET_KEY }, role?: "editor") =>
  signedInApp(
    {
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        DATA_DIR: join(root, "data"),
        BACKUP_DIR: join(root, "backups"),
        ADMIN_DIST: join(root, "none"),
        ...env,
      }),
      runJobs: false,
      offsiteStore: (config) => {
        store.configs.push(config);
        return store;
      },
      offsiteRetryDelays: [],
    },
    role,
  );

async function work(app: App) {
  for (let i = 0; i < 3; i++) {
    app.jobs.poke();
    await app.jobs.idle();
  }
}

const settings = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  provider: "r2",
  endpoint: "https://account.r2.cloudflarestorage.com",
  region: "",
  bucket: "laman-backups",
  prefix: "/agensi/",
  accessKeyId: "AKIDEXAMPLE",
  pathStyle: false,
  prune: false,
  encrypt: false,
  secret: "secret-access-key-value",
  ...overrides,
});

const save = (app: App, body: Record<string, unknown>) =>
  app.inject({ method: "PUT", url: "/api/backups/offsite", payload: body });

const summaryOf = async (app: App) =>
  (await app.inject({ method: "GET", url: "/api/summary" })).json().data.backup;

describe("off-site encryption", () => {
  it("seals settings' secrets, and says so when the key has changed", () => {
    const sealed = seal("hunter2", SECRET_KEY);
    expect(sealed).not.toContain("hunter2");
    expect(unseal(sealed, SECRET_KEY)).toBe("hunter2");
    expect(() => unseal(sealed, `${SECRET_KEY}!`)).toThrow(/BACKUP_SECRET_KEY has changed/);
  });

  it("encrypts an archive that only the passphrase opens", async () => {
    const plain = join(root, "plain");
    await writeFile(plain, Buffer.alloc(3 * 1024 * 1024 + 7, 7));
    await encryptFile(plain, join(root, "enc"), PASSPHRASE);
    expect(await isEncrypted(join(root, "enc"))).toBe(true);
    await decryptFile(join(root, "enc"), join(root, "back"), PASSPHRASE);
    expect((await readFile(join(root, "back"))).equals(await readFile(plain))).toBe(true);
    await expect(
      decryptFile(join(root, "enc"), join(root, "bad"), "wrong passphrase!"),
    ).rejects.toThrow(/passphrase is wrong/);
    expect(fingerprint(PASSPHRASE)).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(fingerprint(PASSPHRASE)).not.toBe(fingerprint("another passphrase"));
  });
});

describe("off-site settings", () => {
  it("can't be saved without BACKUP_SECRET_KEY", async () => {
    const app = await boot({});
    const got = (await app.inject({ method: "GET", url: "/api/backups/offsite" })).json().data;
    expect(got).toMatchObject({ enabled: false, canSave: false, secretSaved: false });
    expect((await save(app, settings())).statusCode).toBe(409);
    await app.close();
  });

  it("are the super admin's alone", async () => {
    const app = await boot(undefined, "editor");
    expect((await app.inject({ method: "GET", url: "/api/backups/offsite" })).statusCode).toBe(403);
    await app.close();
  });

  it("keep secrets sealed, never send them back, and keep them when left out", async () => {
    const app = await boot();
    const saved = await save(app, settings());
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain("secret-access-key-value");
    expect(saved.json().data).toMatchObject({ secretSaved: true, prefix: "agensi", canSave: true });
    const row = await app.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", "offsite")
      .executeTakeFirstOrThrow();
    expect(row.value).not.toContain("secret-access-key-value");

    const { secret: _, ...rest } = settings({ bucket: "other-bucket" });
    expect((await save(app, rest)).json().data).toMatchObject({ secretSaved: true });
    const audit = await app.db
      .selectFrom("audit_log")
      .select("detail")
      .where("action", "=", "offsiteChanged")
      .execute();
    expect(audit).toHaveLength(2);
    expect(audit.map((a) => a.detail).join()).not.toContain("secret-access-key-value");
    await app.close();
  });

  it("refuse what a provider needs left out, and encryption without a passphrase", async () => {
    const app = await boot();
    const missing = await save(app, settings({ endpoint: "", bucket: "" }));
    expect(missing.statusCode).toBe(400);
    expect(JSON.stringify(missing.json())).toMatch(/endpoint/);
    expect((await save(app, settings({ encrypt: true }))).statusCode).toBe(422);
    const { secret: _, ...noSecret } = settings();
    expect((await save(app, noSecret)).statusCode).toBe(422);
    // Saved, then a new provider without a new secret: the old service's keys don't carry over.
    expect((await save(app, settings())).statusCode).toBe(200);
    expect((await save(app, { ...noSecret, provider: "minio" })).statusCode).toBe(422);
    await app.close();
  });

  it("tests a connection, and tells keys that can't delete apart", async () => {
    const app = await boot();
    const test = () =>
      app.inject({ method: "POST", url: "/api/backups/offsite/test", payload: settings() });
    expect((await test()).json().data).toEqual({ ok: true, canDelete: true, error: null });
    store.canDelete = false;
    expect((await test()).json().data).toEqual({ ok: true, canDelete: false, error: null });
    store.failPut = true;
    expect((await test()).json().data).toMatchObject({
      ok: false,
      error: expect.stringMatching(/aren't allowed/),
    });
    await app.close();
  });
});

describe("off-site copies", () => {
  it("copy Back up now's archive to manual/, checked, and show it in the summary", async () => {
    const app = await boot();
    await save(app, settings());
    await app.inject({ method: "POST", url: "/api/backups" });
    await work(app);
    const [local] = await listBackups(join(root, "backups"));
    const key = `agensi/manual/${local!.file}`;
    expect([...store.objects.keys()]).toEqual([key]);
    const object = store.objects.get(key)!;
    expect(object.sha256).toBe(createHash("sha256").update(object.data).digest("hex"));

    const offsite = (await summaryOf(app)).offsite;
    expect(offsite).toMatchObject({
      provider: "r2",
      bucket: "laman-backups",
      running: false,
      failed: null,
      last: { file: local!.file, folder: "manual" },
      copied: [local!.file],
    });
    await app.close();
  });

  it("encrypt copies when asked, and the weekly check opens them", async () => {
    const app = await boot();
    const saved = await save(app, settings({ encrypt: true, passphrase: PASSPHRASE }));
    expect(saved.json().data.passphraseFingerprint).toBe(fingerprint(PASSPHRASE));
    await app.inject({ method: "POST", url: "/api/backups" });
    await work(app);
    const [key] = [...store.objects.keys()];
    expect(key).toMatch(/\.tar\.gz\.enc$/);
    expect(store.objects.get(key!)!.data.subarray(0, 9).toString()).toBe("LAMANENC1");

    expect(
      (await app.inject({ method: "POST", url: "/api/backups/offsite/verify" })).statusCode,
    ).toBe(202);
    await work(app);
    expect((await summaryOf(app)).offsite.verified).toMatchObject({ ok: true, error: null });
    await app.close();
  });

  it("put the first scheduled copy of the month in monthly/, the rest in daily/", async () => {
    const app = await boot();
    await save(app, settings({ prefix: "" }));
    for (let i = 0; i < 2; i++) {
      await app.jobs.enqueue("backup", { trigger: "scheduled" });
      await work(app);
    }
    const folders = [...store.objects.keys()].map((key) => key.split("/")[0]).toSorted();
    expect(folders).toEqual(["daily", "monthly"]);
    await app.close();
  });

  it("leave the local backup alone when the upload fails, and say so", async () => {
    const app = await boot();
    await save(app, settings());
    store.failPut = true;
    await app.inject({ method: "POST", url: "/api/backups" });
    await work(app);
    const backup = await summaryOf(app);
    expect(backup.last).not.toBeNull();
    expect(backup.failed).toBeNull();
    expect(backup.offsite.failed.error).toMatch(/denied|allowed/);
    expect(backup.offsite.last).toBeNull();
    await app.close();
  });

  it("aren't made while off", async () => {
    const app = await boot();
    await app.inject({ method: "POST", url: "/api/backups" });
    await work(app);
    expect(store.objects.size).toBe(0);
    expect((await summaryOf(app)).offsite).toBeNull();
    await app.close();
  });

  it("are pruned by folder age, keeping each folder's newest and anything not an archive", async () => {
    const day = 86_400_000;
    const at = Date.now();
    const name = (daysAgo: number) =>
      `laman-${new Date(at - daysAgo * day).toISOString().replaceAll(/[:.]/g, "-")}.tar.gz`;
    const put = (key: string) =>
      store.objects.set(key, {
        data: Buffer.from("x"),
        sha256: null,
        at: new Date().toISOString(),
      });
    put(`p/daily/${name(1)}`);
    put(`p/daily/${name(40)}`);
    put(`p/monthly/${name(40)}`);
    put(`p/monthly/${name(400)}`);
    put(`p/upgrade/${name(200)}`);
    put("p/daily/notes.txt");
    const deleted = await pruneRemote(store, "p", at);
    expect(deleted.toSorted()).toEqual(
      [`p/daily/${name(40)}`, `p/monthly/${name(400)}`].toSorted(),
    );
    expect(store.objects.has("p/daily/notes.txt")).toBe(true);
    expect(store.objects.has(`p/upgrade/${name(200)}`)).toBe(true);
    expect((await listRemote(store, "p")).map((a) => a.folder)).toEqual([
      "daily",
      "monthly",
      "upgrade",
    ]);
  });

  it("verifies a fetched copy as a restore would", async () => {
    const app = await boot();
    await save(app, settings());
    await app.inject({ method: "POST", url: "/api/backups" });
    await work(app);
    const [object] = [...store.objects.values()];
    await writeFile(join(root, "fetched.tar.gz"), object!.data);
    const manifest = await verifyBackup(join(root, "fetched.tar.gz"), root);
    expect(manifest.dbOnly).toBe(false);
    await app.close();
  });
});

describe("Malaysian months", () => {
  it("start at midnight in Malaysia", () => {
    expect(malaysianMonthStart(new Date("2026-11-30T17:00:00Z"))).toBe("2026-11-30T16:00:00.000Z");
    expect(malaysianMonthStart(new Date("2026-11-30T15:59:00Z"))).toBe("2026-10-31T16:00:00.000Z");
  });
});
