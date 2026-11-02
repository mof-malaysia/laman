/** Rows of the settings table: a key and a JSON value. */
import type { Db } from "../db/index.js";

export async function readRow(db: Db, key: string) {
  const row = await db
    .selectFrom("settings")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row ? (JSON.parse(row.value) as unknown) : undefined;
}

export async function writeRow(db: Db, key: string, value: unknown) {
  const json = JSON.stringify(value);
  await db
    .insertInto("settings")
    .values({ key, value: json })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: json }))
    .execute();
}
