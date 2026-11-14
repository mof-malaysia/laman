/**
 * Backups (docs/laman.md § Backup and restore). An archive is one
 * <site-name>-<time>[-db].tar.gz in BACKUP_DIR holding a consistent copy
 * of site.db (made by SQLite, never by copying the file), the media folders
 * that copy uses, and a manifest with every file's checksum. Restore is
 * command-line only and refuses to run while the server does: it checks
 * and upgrades the archive's database beside the live one, and only then
 * swaps it in, keeping what it replaced.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { slugify } from "@laman/blocks";
import SQLite from "better-sqlite3";
import { sql } from "kysely";
import * as tar from "tar";
import { audit } from "./auth/audit.js";
import { MEDIA_DIR, PREVIOUS_DIR } from "./content/media.js";
import { checkStoredDocuments, describeProblems } from "./db/documents.js";
import { migrationState, now, openDatabase, openSqlite } from "./db/index.js";
import { migrations } from "./db/migrations.js";
import type { Env } from "./env.js";
import { linkTree } from "./files.js";
import { queueJob } from "./jobs.js";
import { filesIn } from "./manifest.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

/**
 * `perolehan-digital-2026-11-03T02-00-00-000Z.tar.gz`, or `…-db.tar.gz` without
 * media: the site's name when the archive was made, then the time. Any such
 * name counts, so archives from before a rename (or named `site-builder-` by
 * older versions) are still listed, pruned and restored.
 */
const ARCHIVE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*?-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(-db)?\.tar\.gz$/;
const MANIFEST = "manifest.json";

export type Manifest = {
  format: 1;
  /** The builder version that made it. */
  version: string;
  /** The database's last migration: a build that doesn't know it can't restore it. */
  migration: string;
  createdAt: string;
  /** Only the database: media is backed up some other way. */
  dbOnly: boolean;
  analytics: boolean;
  counts: { pages: number; media: number; users: number };
  /** Media folders the database names that weren't on disk. */
  missing: string[];
  files: Record<string, { bytes: number; sha256: string }>;
};

export type Retention = { daily: number; weekly: number };

export type Backup = { file: string; at: string; bytes: number; dbOnly: boolean };

/** Where archives go: BACKUP_DIR, or DATA_DIR/backups when it isn't set. */
export const backupDirOf = (env: Env) => resolve(env.BACKUP_DIR ?? join(env.DATA_DIR, "backups"));

export const retentionOf = (env: Env): Retention => ({
  daily: env.BACKUP_KEEP_DAILY,
  weekly: env.BACKUP_KEEP_WEEKLY,
});

/** A time as it goes in a file name, and back: no colons or dots. */
const fileTime = (iso: string) => iso.replaceAll(/[:.]/g, "-");
const isoTime = (stamp: string) => stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-/, "T$1:$2:$3.");

const archiveName = (site: string, at: string, dbOnly: boolean) =>
  `${site}-${fileTime(at)}${dbOnly ? "-db" : ""}.tar.gz`;

/** The live site name, dashcased, for archive names; "laman" before there is one. */
async function siteSlug(db: Parameters<typeof migrationState>[0]) {
  const { rows } = await sql<{ name: string | null }>`
    select json_extract(value, '$.identity.siteName') as name
    from settings where key = 'settings.published'
  `.execute(db);
  return (
    slugify(rows[0]?.name ?? "")
      .slice(0, 40)
      .replace(/-+$/, "") || "laman"
  );
}

/** An archive's time and kind from its name; undefined for any other file. */
export function parseName(file: string) {
  const m = ARCHIVE.exec(file);
  return m && { at: isoTime(m[1]!), dbOnly: Boolean(m[2]) };
}

/** A SQLite file and the two it keeps beside it while open. */
const withSidecars = (name: string) => [name, `${name}-wal`, `${name}-shm`];

/** The archives in `backupDir`, newest first. */
export async function listBackups(backupDir: string): Promise<Backup[]> {
  const names = await readdir(backupDir).catch(() => [] as string[]);
  const out: Backup[] = [];
  for (const file of names) {
    const parsed = parseName(file);
    if (parsed) out.push({ file, ...parsed, bytes: (await stat(join(backupDir, file))).size });
  }
  return out.toSorted((a, b) => b.at.localeCompare(a.at));
}

/** Malaysian calendar day and ISO week of a UTC time, for retention. */
function buckets(at: string) {
  const local = new Date(Date.parse(at) + 8 * 3600_000);
  const day = local.toISOString().slice(0, 10);
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10) };
}

/**
 * Deletes archives beyond `keep`: the newest of each of the last `daily`
 * days and of the last `weekly` weeks are kept, and the newest of all
 * always is. Full and database-only archives are kept apart. Only files
 * named like an archive are ever touched.
 */
export async function pruneBackups(backupDir: string, keep: Retention) {
  const deleted: string[] = [];
  const all = await listBackups(backupDir);
  for (const dbOnly of [false, true]) {
    const list = all.filter((b) => b.dbOnly === dbOnly);
    const kept = new Set(list.slice(0, 1).map((b) => b.file));
    for (const [count, key] of [
      [keep.daily, "day"],
      [keep.weekly, "week"],
    ] as const) {
      const seen = new Set<string>();
      for (const backup of list) {
        const bucket = buckets(backup.at)[key];
        if (seen.has(bucket)) continue;
        if (seen.size === count) break;
        seen.add(bucket);
        kept.add(backup.file);
      }
    }
    for (const backup of list)
      if (!kept.has(backup.file)) {
        await rm(join(backupDir, backup.file), { force: true });
        deleted.push(backup.file);
      }
  }
  return deleted;
}

/**
 * Free and total space on the disk holding `dir`, from the nearest folder
 * that exists (BACKUP_DIR is made by the first backup). Low is under 10% free,
 * or not room for two more archives the size of the newest.
 */
export async function diskOf(
  dir: string,
  newestBytes: number,
): Promise<{ free: number; total: number; low: boolean } | null> {
  for (let at = resolve(dir); ; at = dirname(at)) {
    try {
      const fs = await statfs(at);
      const free = fs.bavail * fs.bsize;
      const total = fs.blocks * fs.bsize;
      return { free, total, low: free < total * 0.1 || free < newestBytes * 2 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(at) === at) return null;
    }
  }
}

export async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** A consistent, compacted copy of a live SQLite database, checked. */
function copyDatabase(from: string, to: string) {
  const source = new SQLite(from, { fileMustExist: true });
  try {
    source.pragma("busy_timeout = 5000");
    source.prepare("vacuum into ?").run(to);
  } finally {
    source.close();
  }
  const copy = new SQLite(to, { readonly: true });
  try {
    const result = copy.pragma("integrity_check", { simple: true });
    if (result !== "ok")
      throw new Error(`The copy of ${from} failed its integrity check: ${result}`);
  } finally {
    copy.close();
  }
}

/**
 * Makes an archive in `backupDir` and prunes old ones. `database` is the
 * file to copy (site.db, or the snapshot taken before an upgrade); while
 * it's on this build's migrations its stored documents are checked too,
 * so a backup that couldn't be restored fails now rather than then.
 */
export async function makeBackup(options: {
  dataDir: string;
  backupDir: string;
  database?: string;
  dbOnly?: boolean;
  withAnalytics?: boolean;
  keep: Retention;
}) {
  const { dataDir, backupDir, dbOnly = false, withAnalytics = false } = options;
  const database = options.database ?? join(dataDir, "site.db");
  // Beside the media, so its files can be hard-linked rather than copied.
  const work = await mkdtemp(join(dataDir, ".backup-"));
  try {
    copyDatabase(database, join(work, "site.db"));
    const analytics = join(dataDir, "analytics.db");
    const withAnalyticsFile = withAnalytics && existsSync(analytics);
    if (withAnalyticsFile) copyDatabase(analytics, join(work, "analytics.db"));

    const { db } = openSqlite<unknown>(join(work, "site.db"));
    let found: Pick<Manifest, "migration" | "counts" | "missing">;
    let site = "laman";
    try {
      const { executed, unknown, pending } = await migrationState(db);
      // A copy from before an upgrade is checked by the restore that upgrades it.
      if (!unknown.length && !pending.length) {
        const check = await checkStoredDocuments(db);
        if (check.failed)
          throw new Error(
            `${check.failed} stored documents don't match this version's schemas, so this backup couldn't be restored:\n${describeProblems(check)}`,
          );
      }
      const count = async (table: string) =>
        Number(
          (await sql<{ n: number }>`select count(*) as n from ${sql.table(table)}`.execute(db))
            .rows[0]!.n,
        );
      const { rows: media } = await sql<{ id: string; previous: string | null }>`
        select id, previous from media
      `.execute(db);
      const missing: string[] = [];
      if (!dbOnly)
        for (const { id, previous } of media)
          for (const folder of previous ? [MEDIA_DIR, PREVIOUS_DIR] : [MEDIA_DIR]) {
            const from = join(dataDir, folder, id);
            if (existsSync(from)) await linkTree(from, join(work, folder, id));
            else missing.push(`${folder}/${id}`);
          }
      site = await siteSlug(db).catch(() => "laman");
      found = {
        migration: executed.at(-1) ?? "",
        counts: { pages: await count("pages"), media: media.length, users: await count("users") },
        missing,
      };
    } finally {
      await db.destroy();
    }
    for (const sidecar of withSidecars("site.db").slice(1))
      await rm(join(work, sidecar), { force: true });

    const files: Manifest["files"] = {};
    for (const file of await filesIn(work))
      files[file] = {
        bytes: (await stat(join(work, file))).size,
        sha256: await sha256(join(work, file)),
      };
    const manifest: Manifest = {
      format: 1,
      version,
      ...found,
      createdAt: now(),
      dbOnly,
      analytics: withAnalyticsFile,
      files,
    };
    await writeFile(join(work, MANIFEST), JSON.stringify(manifest, null, 2));

    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const name = archiveName(site, manifest.createdAt, dbOnly);
    const partial = join(backupDir, `.${name}.partial`);
    await tar.c({ gzip: true, portable: true, cwd: work, file: partial }, [
      MANIFEST,
      ...Object.keys(files),
    ]);
    await chmod(partial, 0o600);
    // Renamed only once complete, so a half-written file never looks like a backup.
    await rename(partial, join(backupDir, name));
    const deleted = await pruneBackups(backupDir, options.keep);
    return {
      file: join(backupDir, name),
      bytes: (await stat(join(backupDir, name))).size,
      manifest,
      deleted,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Unpacks `archive` into `into` and checks it: only plain files and
 * folders, every file the manifest lists with its checksum and nothing
 * else, a migration this build knows. Then it opens the database there,
 * which runs this build's migrations and the stored-documents check.
 */
async function unpack(archive: string, into: string) {
  const unsafe: string[] = [];
  await tar.x({
    file: archive,
    cwd: into,
    strict: true,
    filter: (path, entry) => {
      const type = "type" in entry ? entry.type : undefined;
      const ok = type === "File" || type === "Directory";
      if (!ok) unsafe.push(path);
      return ok;
    },
  });
  if (unsafe.length)
    throw new Error(`${archive} holds links or devices (${unsafe[0]}): not a backup`);
  const manifestFile = join(into, MANIFEST);
  if (!existsSync(manifestFile)) throw new Error(`${archive} has no ${MANIFEST}: not a backup`);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as Manifest;
  if (manifest.format !== 1)
    throw new Error(`${archive} is a backup format this version can't read`);
  if (!(manifest.migration in migrations))
    throw new Error(
      `${archive} was made by a newer version of Laman (${manifest.version}, migration ${manifest.migration}). Restore it with that version or later.`,
    );
  const present = (await filesIn(into)).filter((file) => file !== MANIFEST);
  const listed = Object.keys(manifest.files);
  const extra = present.filter((file) => !(file in manifest.files));
  if (extra.length || present.length !== listed.length)
    throw new Error(`${archive} doesn't match its manifest (${extra[0] ?? "a file is missing"})`);
  for (const [file, expected] of Object.entries(manifest.files))
    if ((await sha256(join(into, file))) !== expected.sha256)
      throw new Error(`${archive} is damaged: ${file} doesn't match its checksum`);
  const db = await openDatabase(join(into, "site.db"));
  return { manifest, db };
}

/** Checks an archive end to end in a scratch folder, without touching the site. */
export async function verifyBackup(archive: string, scratch: string) {
  const work = await mkdtemp(join(scratch, ".verify-"));
  try {
    const { manifest, db } = await unpack(resolve(archive), work);
    await db.destroy();
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const LOCK = "server.lock";
const LOCK_BEAT_MS = 10_000;

/**
 * Marks DATA_DIR as in use by a running server, until the returned function
 * is called. The file's time is refreshed every few seconds, so a restore
 * (perhaps in another container, where the pid means nothing) can tell a
 * running server from one that crashed without removing it.
 */
export async function holdServerLock(dataDir: string) {
  const file = join(dataDir, LOCK);
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify({ pid: process.pid, host: hostname(), since: now() }));
  const beat = setInterval(() => {
    const time = new Date();
    utimes(file, time, time).catch(() => undefined);
  }, LOCK_BEAT_MS);
  beat.unref();
  return async () => {
    clearInterval(beat);
    await rm(file, { force: true });
  };
}

async function serverRunning(dataDir: string) {
  const lock = await stat(join(dataDir, LOCK)).catch(() => undefined);
  return Boolean(lock && Date.now() - lock.mtimeMs < LOCK_BEAT_MS * 3);
}

/**
 * Replaces the site's database (and media, unless the archive is
 * database-only) with `archive`'s. Everything is checked and upgraded
 * before anything is replaced; what was replaced moves to
 * DATA_DIR/before-restore-<time>/. Everyone is signed out, and a full
 * publish is queued so the site matches the restored content.
 */
export async function restoreBackup(archive: string, dataDir: string) {
  if (await serverRunning(dataDir))
    throw new Error(`Laman is running on ${dataDir}. Stop it first, restore, then start it again.`);
  const work = await mkdtemp(join(dataDir, ".restore-"));
  try {
    const { manifest, db } = await unpack(resolve(archive), work);
    try {
      await db.deleteFrom("sessions").execute();
      await queueJob(db, "publish", { trigger: "restore", full: true });
      await audit(db, {
        userId: null,
        action: "backupRestored",
        target: null,
        detail: { archive: basename(archive), createdAt: manifest.createdAt, cli: true },
      });
      await sql`pragma wal_checkpoint(TRUNCATE)`.execute(db);
    } finally {
      await db.destroy();
    }

    const replaced = [
      ...withSidecars("site.db"),
      ...(manifest.dbOnly ? [] : [MEDIA_DIR, PREVIOUS_DIR]),
      ...(manifest.analytics ? withSidecars("analytics.db") : []),
    ];
    const aside = join(dataDir, `before-restore-${fileTime(now())}`);
    await mkdir(aside);
    const moved: string[] = [];
    try {
      for (const name of replaced)
        if (existsSync(join(dataDir, name))) {
          await rename(join(dataDir, name), join(aside, name));
          moved.push(name);
        }
      for (const name of replaced)
        if (existsSync(join(work, name))) await rename(join(work, name), join(dataDir, name));
    } catch (error) {
      // Put back what was there, so a failed swap leaves the site as it was.
      for (const name of moved) {
        await rm(join(dataDir, name), { recursive: true, force: true });
        await rename(join(aside, name), join(dataDir, name));
      }
      throw error;
    }
    if (!manifest.dbOnly)
      for (const folder of [MEDIA_DIR, PREVIOUS_DIR])
        await mkdir(join(dataDir, folder), { recursive: true });
    return { manifest, aside };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Next `HH:MM` Malaysian time after `from`, as UTC. */
export function nextRun(schedule: string, from = new Date()) {
  const [hours, minutes] = schedule.split(":").map(Number) as [number, number];
  const run = new Date(from);
  run.setUTCHours(hours - 8, minutes, 0, 0);
  const behind = from.getTime() - run.getTime();
  if (behind >= 0) run.setUTCDate(run.getUTCDate() + Math.floor(behind / 86_400_000) + 1);
  return run.toISOString();
}
