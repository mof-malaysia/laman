/** One SQLite file in WAL mode, through Kysely. */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { migrate } from "./migrations.js";
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

/** Opens (creating if needed) the database at `path` and migrates it. ":memory:" for tests. */
export async function openDatabase(path: string): Promise<Db> {
  const { sqlite, db } = openSqlite<Database>(path);
  // Off while migrating, so a table rebuild doesn't cascade; checked before it's back on.
  sqlite.pragma("foreign_keys = OFF");
  await migrate(db as Kysely<unknown>);
  const broken = sqlite.pragma("foreign_key_check") as unknown[];
  if (broken.length) throw new Error(`Migration left ${broken.length} broken foreign keys`);
  sqlite.pragma("foreign_keys = ON");
  return db;
}

export const now = () => new Date().toISOString();
