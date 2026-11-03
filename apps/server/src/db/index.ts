/** One SQLite file in WAL mode, through Kysely. */
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import type { Migration } from "kysely/migration";
import { checkStoredDocuments, describeProblems } from "./documents.js";
import { beforeBaseline, migrate, migrations } from "./migrations.js";
import type { Database } from "./schema.js";

export type Db = Kysely<Database>;

/** Opens (creating if needed) a SQLite file at `path` in WAL mode. ":memory:" for tests. */
export function openSqlite<T>(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new SQLite(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: new Kysely<T>({ dialect: new SqliteDialect({ database: sqlite }) }) };
}

/**
 * Opens (creating if needed) the database at `path` and migrates it. ":memory:" for tests;
 * `list` lets a test stand in a later build's migrations. `beforeMigrate` gets the
 * snapshot taken before an upgrade, to back it up; if it throws, nothing is migrated.
 */
export async function openDatabase(
  path: string,
  list = migrations,
  { beforeMigrate }: { beforeMigrate?: (snapshot: string) => Promise<unknown> } = {},
): Promise<Db> {
  const { sqlite, db } = openSqlite<Database>(path);
  // Off while migrating, so a table rebuild doesn't cascade; checked before it's back on.
  sqlite.pragma("foreign_keys = OFF");
  await upgrade({ sqlite, db: db as Kysely<unknown>, path }, list, {
    replaced: beforeBaseline,
    beforeMigrate,
    verify: async () => {
      const broken = sqlite.pragma("foreign_key_check") as unknown[];
      if (broken.length) throw new Error(`Migration left ${broken.length} broken foreign keys`);
      const check = await checkStoredDocuments(db as Kysely<unknown>);
      if (check.failed)
        throw new Error(
          `${check.failed} stored documents don't match this version's schemas:\n${describeProblems(check)}`,
        );
    },
  });
  sqlite.pragma("foreign_keys = ON");
  return db;
}

type Opened = { sqlite: SQLite.Database; db: Kysely<unknown>; path: string };

/**
 * Runs `list`'s pending migrations, then `verify`. With anything pending on a
 * database that already has data, it first snapshots the file to upgrade/
 * beside it; if a migration or `verify` fails, the snapshot goes back, so a
 * failed upgrade leaves the database as it was. SQLite migrations don't run
 * in a transaction, so this is also what undoes one that fails halfway.
 */
export async function upgrade(
  { sqlite, db, path }: Opened,
  list: Record<string, Migration>,
  {
    replaced,
    beforeMigrate,
    verify,
  }: {
    /** The development migrations the list's first one (its baseline) replaced. */
    replaced: string[];
    beforeMigrate?: (snapshot: string) => Promise<unknown>;
    verify?: () => Promise<void>;
  },
) {
  const names = Object.keys(list).toSorted();
  const executed = await adoptBaseline(db, path, await executedMigrations(db), replaced, names[0]!);
  const unknown = executed.filter((name) => !(name in list));
  if (unknown.length)
    throw new Error(
      `${path} was upgraded by a newer version of the site builder (migration ${unknown.at(-1)}). Run that version, or restore a backup made before it.`,
    );
  if (executed.length === names.length) return;

  const from = executed.at(-1);
  const snapshot =
    from && path !== ":memory:"
      ? join(dirname(path), "upgrade", `${basename(path, ".db")}-${from}-to-${names.at(-1)}.db`)
      : undefined;
  if (snapshot) {
    mkdirSync(dirname(snapshot), { recursive: true });
    // Nothing else writes before boot finishes, so once the WAL is folded in
    // a copy of the file is the database exactly as it was.
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(path, snapshot);
  }
  try {
    if (snapshot) await beforeMigrate?.(snapshot);
    await migrate(db, list);
    await verify?.();
  } catch (error) {
    if (!snapshot) throw error;
    await db.destroy();
    for (const suffix of ["-wal", "-shm"]) rmSync(path + suffix, { force: true });
    renameSync(snapshot, path);
    throw new Error(
      `Upgrading ${path} failed, so it was put back as it was (at migration ${from}).\n${(error as Error).message}`,
      { cause: error },
    );
  }
  // Only the latest upgrade's snapshot is kept.
  if (snapshot)
    for (const file of readdirSync(dirname(snapshot)))
      if (
        file.startsWith(`${basename(path, ".db")}-`) &&
        join(dirname(snapshot), file) !== snapshot
      )
        rmSync(join(dirname(snapshot), file), { force: true });
}

/**
 * Takes on a database a development build made before 1.0: one that ran
 * every migration the baseline replaced has the baseline's schema, so it's
 * recorded as having run the baseline instead; one stopped partway is
 * refused. Returns the migrations to carry on from. Only pre-1.0 development
 * data folders reach this, so it can go once none are left.
 */
async function adoptBaseline(
  db: Kysely<unknown>,
  path: string,
  executed: string[],
  replaced: string[],
  baseline: string,
) {
  if (!executed.length || !executed.every((name) => replaced.includes(name))) return executed;
  if (executed.length !== replaced.length)
    throw new Error(
      `${path} was made by a development build from before 1.0 (migration ${executed.at(-1)}), which this version can't upgrade. Start again with a new data folder.`,
    );
  await sql`delete from kysely_migration`.execute(db);
  await sql`insert into kysely_migration (name, timestamp) values (${baseline}, ${now()})`.execute(
    db,
  );
  return [baseline];
}

/**
 * Where `db` stands against `list`: migrations it ran that this build doesn't
 * know (a newer version made it), and ones it still has to run.
 */
export async function migrationState(db: Kysely<unknown>, list = migrations) {
  const executed = await executedMigrations(db);
  return {
    executed,
    unknown: executed.filter((name) => !(name in list)),
    pending: Object.keys(list).filter((name) => !executed.includes(name)),
  };
}

/** The migrations already run on `db`, in order; none on a new database. */
export async function executedMigrations(db: Kysely<unknown>) {
  const { rows } = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table' and name = 'kysely_migration'
  `.execute(db);
  if (!rows.length) return [];
  const executed = await sql<{
    name: string;
  }>`select name from kysely_migration order by name`.execute(db);
  return executed.rows.map((r) => r.name);
}

export const now = () => new Date().toISOString();
/** `ms` before and after now, as stored. */
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const later = (ms: number) => new Date(Date.now() + ms).toISOString();

/**
 * A time as stored: UTC, so times compare as text in SQL. The API takes
 * times with an offset ("…T09:00:00+08:00"); kept as written, one would
 * sort and fire as if it were 09:00 UTC, eight hours late.
 */
export const utc = (time: string) => new Date(time).toISOString();
