/**
 * The admin preferences, kept in the settings table under "preferences".
 * Not a drafted document: they change the admin, not the site, so they
 * apply on save.
 */
import { AdminPreferences } from "@fiscal-sb/contracts";
import type { Db } from "../db/index.js";
import { readRow, writeRow } from "./kv.js";

const defaults: AdminPreferences = { language: "en" };

export async function getPreferences(db: Db): Promise<AdminPreferences> {
  const stored = AdminPreferences.safeParse(await readRow(db, "preferences"));
  return stored.success ? stored.data : defaults;
}

export async function savePreferences(db: Db, preferences: AdminPreferences) {
  await writeRow(db, "preferences", preferences);
  return preferences;
}
