import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import * as tar from "tar";
import {
  diskOf,
  holdServerLock,
  listBackups,
  makeBackup,
  nextRun,
  parseName,
  pruneBackups,
  restoreBackup,
  verifyBackup,
} from "../src/backup.js";
import { openDatabase } from "../src/db/index.js";
import { migrations } from "../src/db/migrations.js";
import { loadEnv } from "../src/env.js";
import { type App, multipartFile, signedInApp } from "./helpers.js";

let root: string;
let dataDir: string;
let backupDir: string;
const keep = { daily: 7, weekly: 4 };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "laman-backup-"));
  dataDir = join(root, "data");
  backupDir = join(root, "backups");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const boot = () =>
  signedInApp({
    env: loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      ADMIN_DIST: join(dataDir, "none"),
    }),
    runJobs: false,
  });

async function work(app: App) {
  app.jobs.poke();
  await app.jobs.idle();
}

const newPage = (app: App, title: string) =>
  app.inject({ method: "POST", url: "/api/pages", payload: { title, slug: title.toLowerCase() } });

/** A site with a page and an image, backed up through the API. */
async function backedUpSite() {
  const app = await boot();
  await newPage(app, "Sebelum");
  const png = await sharp({
    create: { width: 640, height: 400, channels: 3, background: "#0b6b3a" },
  })
    .png()
    .toBuffer();
  const upload = await app.inject({
    method: "POST",
    url: "/api/media",
    ...multipartFile("logo.png", png),
  });
  const mediaId = (upload.json() as { data: { id: string } }).data.id;
  expect((await app.inject({ method: "POST", url: "/api/backups" })).statusCode).toBe(202);
  await work(app);
  const [backup] = await listBackups(backupDir);
  return { app, mediaId, archive: join(backupDir, backup!.file) };
}

/** Unpacks `archive`, lets `change` alter it, and packs it again as a new archive. */
async function tampered(archive: string, change: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(root, "tamper-"));
  await tar.x({ file: archive, cwd: dir });
  await change(dir);
  const out = `${dir}.tar.gz`;
  await tar.c({ gzip: true, cwd: dir, file: out }, await readdir(dir));
  return out;
}

const editManifest = (edit: (manifest: Record<string, unknown>) => void) => async (dir: string) => {
  const file = join(dir, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  edit(manifest);
  await writeFile(file, JSON.stringify(manifest));
};

const name = (at: Date, suffix = "") =>
  `laman-${at.toISOString().replaceAll(/[:.]/g, "-")}${suffix}.tar.gz`;

describe("backups", () => {
  it("restores the database and media as they were, and keeps what it replaced", async () => {
    const { app, mediaId, archive } = await backedUpSite();
    const summary = (await app.inject({ method: "GET", url: "/api/summary" })).json().data.backup;
    expect(summary).toMatchObject({ running: false, failed: null, sameDisk: false });
    expect(summary.last.dbOnly).toBe(false);
    await newPage(app, "Selepas");
    await app.close();

    // Not under a running server.
    const release = await holdServerLock(dataDir);
    await expect(restoreBackup(archive, dataDir)).rejects.toThrow(/running/);
    await release();

    const { aside } = await restoreBackup(archive, dataDir);
    expect(existsSync(join(aside, "site.db"))).toBe(true);
    expect(existsSync(join(dataDir, "media", mediaId, "original.png"))).toBe(true);

    const db = await openDatabase(join(dataDir, "site.db"));
    try {
      const titles = (await db.selectFrom("pages").select("draft").execute()).map(
        (row) => (JSON.parse(row.draft) as { ms: { title: string } }).ms.title,
      );
      expect(titles).toContain("Sebelum");
      expect(titles).not.toContain("Selepas");
      expect(await db.selectFrom("sessions").selectAll().execute()).toEqual([]);
      const publish = await db
        .selectFrom("jobs")
        .select("payload")
        .where("kind", "=", "publish")
        .where("status", "=", "queued")
        .executeTakeFirstOrThrow();
      expect(JSON.parse(publish.payload)).toEqual({ trigger: "restore", full: true });
      const restored = await db
        .selectFrom("audit_log")
        .select("action")
        .where("action", "=", "backupRestored")
        .execute();
      expect(restored).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it("refuses an archive that's damaged, from a newer version, or not a backup", async () => {
    const { app, archive } = await backedUpSite();
    await app.close();
    expect((await verifyBackup(archive, root)).counts.media).toBe(1);

    const damaged = await tampered(archive, (dir) => writeFile(join(dir, "site.db"), "nope"));
    await expect(verifyBackup(damaged, root)).rejects.toThrow(/checksum/);
    const newer = await tampered(
      archive,
      editManifest((m) => (m.migration = "9999_later")),
    );
    await expect(verifyBackup(newer, root)).rejects.toThrow(/newer version/);
    const extra = await tampered(archive, (dir) => writeFile(join(dir, "extra.txt"), "hi"));
    await expect(verifyBackup(extra, root)).rejects.toThrow(/manifest/);
    const linked = await tampered(archive, (dir) => symlink("/etc/passwd", join(dir, "passwd")));
    await expect(verifyBackup(linked, root)).rejects.toThrow(/links/);
    // A failed restore leaves the site as it was.
    const before = await readFile(join(dataDir, "site.db"));
    await expect(restoreBackup(damaged, dataDir)).rejects.toThrow(/checksum/);
    expect((await readFile(join(dataDir, "site.db"))).equals(before)).toBe(true);
  });

  it("backs up the database before an upgrade migrates it", async () => {
    const path = join(dataDir, "site.db");
    await (await openDatabase(path)).destroy();
    const next = { ...migrations, "9000_next": { up: async () => undefined } };
    const db = await openDatabase(path, next, {
      beforeMigrate: (snapshot) =>
        makeBackup({ dataDir, backupDir, keep, database: snapshot, dbOnly: true }),
    });
    await db.destroy();
    const [backup] = await listBackups(backupDir);
    expect(backup?.dbOnly).toBe(true);
    // Made on the old version, so this build's restore upgrades it again.
    expect((await verifyBackup(join(backupDir, backup!.file), root)).migration).toBe(
      Object.keys(migrations).at(-1),
    );
  });

  it("keeps the newest of each recent day and week, and nothing else it didn't make", async () => {
    await mkdir(backupDir, { recursive: true });
    // 03:00 Malaysian time every day for 60 days, up to Sunday 1 November 2026.
    const last = Date.parse("2026-10-31T19:00:00Z");
    for (let day = 0; day < 60; day++)
      await writeFile(join(backupDir, name(new Date(last - day * 86_400_000))), "");
    await writeFile(join(backupDir, name(new Date(last - 3600_000))), "");
    await writeFile(join(backupDir, name(new Date(last), "-db")), "");
    await writeFile(join(backupDir, "notes.txt"), "");

    await pruneBackups(backupDir, keep);
    const left = (await listBackups(backupDir)).filter((b) => !b.dbOnly);
    // The week of 26 October day by day, then the Sundays of the three weeks before.
    expect(left.map((b) => b.at.slice(0, 10))).toEqual([
      "2026-10-31",
      "2026-10-30",
      "2026-10-29",
      "2026-10-28",
      "2026-10-27",
      "2026-10-26",
      "2026-10-25",
      "2026-10-24",
      "2026-10-17",
      "2026-10-10",
    ]);
    expect((await listBackups(backupDir)).filter((b) => b.dbOnly)).toHaveLength(1);
    expect(existsSync(join(backupDir, "notes.txt"))).toBe(true);
  });

  it("makes a daily backup the server was down for as soon as it starts", async () => {
    const app = await signedInApp({
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        DATA_DIR: dataDir,
        BACKUP_DIR: backupDir,
        ADMIN_DIST: join(dataDir, "none"),
      }),
    });
    await app.ready();
    await app.jobs.idle();
    await app.close();
    expect(await listBackups(backupDir)).toHaveLength(1);
  });

  it("counts only full archives as backed up, and says when the newest is old", async () => {
    const app = await boot();
    const status = async () =>
      (await app.inject({ method: "GET", url: "/api/summary" })).json().data.backup;
    expect(await status()).toMatchObject({ last: null, archives: [], stale: false });
    expect(Date.parse((await status()).next)).toBeGreaterThan(Date.now());

    await mkdir(backupDir, { recursive: true });
    const day = 86_400_000;
    await writeFile(join(backupDir, name(new Date(Date.now() - 3 * day))), "");
    // An upgrade's database-only archive is newer, but leaves the media out.
    await writeFile(join(backupDir, name(new Date(Date.now() - day), "-db")), "");
    const old = await status();
    expect(old.archives.map((a: { dbOnly: boolean }) => a.dbOnly)).toEqual([true, false]);
    expect(old.last.dbOnly).toBe(false);
    expect(old.stale).toBe(true);
    await app.close();
  });

  it("reads the backup disk's space, before the folder exists, and says when it's low", async () => {
    const disk = await diskOf(join(backupDir, "not", "made", "yet"), 0);
    expect(disk!.total).toBeGreaterThan(0);
    expect(disk!.free).toBeGreaterThan(0);
    expect(disk!.free).toBeLessThanOrEqual(disk!.total);
    // Not room for two more archives the size of the newest.
    expect((await diskOf(backupDir, disk!.free))!.low).toBe(true);

    const app = await boot();
    const status = (await app.inject({ method: "GET", url: "/api/summary" })).json().data.backup;
    expect(status.disk).toMatchObject({ free: expect.any(Number), total: expect.any(Number) });
    await app.close();
  });

  it("names archives after the site, and still knows ones named otherwise", async () => {
    const { app, archive } = await backedUpSite();
    await app.close();
    expect(basename(archive)).toMatch(
      /^[a-z0-9]+(-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}T[\d-]+Z\.tar\.gz$/,
    );
    // Made before a rename, or by a version that called itself the site builder.
    const at = "2026-11-03T02:00:00.000Z";
    expect(parseName("site-builder-2026-11-03T02-00-00-000Z.tar.gz")).toEqual({
      at,
      dbOnly: false,
    });
    expect(parseName("perolehan-digital-2026-11-03T02-00-00-000Z-db.tar.gz")).toEqual({
      at,
      dbOnly: true,
    });
    expect(parseName("notes.txt")).toBeFalsy();
  });

  it("schedules the daily backup in Malaysian time", () => {
    expect(nextRun("02:00", new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-03T18:00:00.000Z");
    expect(nextRun("02:00", new Date("2026-11-03T17:00:00Z"))).toBe("2026-11-03T18:00:00.000Z");
    expect(nextRun("02:00", new Date("2026-11-03T18:00:00Z"))).toBe("2026-11-04T18:00:00.000Z");
    expect(nextRun("23:30", new Date("2026-11-03T23:00:00Z"))).toBe("2026-11-04T15:30:00.000Z");
  });

  it("lets only an admin back up from the admin", async () => {
    const editor = await signedInApp(
      {
        env: loadEnv({
          NODE_ENV: "test",
          LOG_LEVEL: "silent",
          DATA_DIR: dataDir,
          BACKUP_DIR: backupDir,
          ADMIN_DIST: join(dataDir, "none"),
        }),
        databasePath: ":memory:",
        runJobs: false,
      },
      "contentManager",
    );
    expect((await editor.inject({ method: "POST", url: "/api/backups" })).statusCode).toBe(403);
    await editor.close();
  });
});
