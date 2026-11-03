/**
 * Each person's admin preferences, kept on their account. Not a drafted
 * document: they change the admin, not the site, so they apply on save.
 */
import { AdminPreferences } from "@fiscal-sb/contracts";
import type { User } from "../auth/users.js";
import { parseStored } from "../db/documents.js";
import type { Db } from "../db/index.js";

const defaults: AdminPreferences = { language: "en" };

/** From the account row the request already has. */
export const preferencesOf = (user: Pick<User, "preferences">): AdminPreferences =>
  parseStored(AdminPreferences, JSON.parse(user.preferences), "preferences") ?? defaults;

export async function savePreferences(db: Db, userId: string, preferences: AdminPreferences) {
  await db
    .updateTable("users")
    .set({ preferences: JSON.stringify(preferences) })
    .where("id", "=", userId)
    .execute();
  return preferences;
}
