/** Rows of the settings table: a key and a JSON value. */
import type { Db } from "../db/index.js";
import { actingUser } from "../auth/acting.js";

export async function readRow(db: Db, key: string) {
  const row = await db
    .selectFrom("settings")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row ? (JSON.parse(row.value) as unknown) : undefined;
}

/** A row's value exactly as stored ("" when there's none), and who saved it: for its version. */
export async function readStored(db: Db, key: string) {
  const row = await db
    .selectFrom("settings")
    .leftJoin("users", "users.id", "settings.updated_by")
    .select(["settings.value", "users.display_name"])
    .where("settings.key", "=", key)
    .executeTakeFirst();
  return { value: row?.value ?? "", by: row?.display_name ?? null };
}

export async function writeRow(db: Db, key: string, value: unknown) {
  const json = JSON.stringify(value);
  await db
    .insertInto("settings")
    .values({ key, value: json, updated_by: actingUser() })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: json, updated_by: actingUser() }))
    .execute();
}
