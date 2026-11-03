/** Accounts: reading them, the super admin's seeding, and the builder's security setting. */
import { randomUUID } from "node:crypto";
import {
  AdminPreferences,
  can,
  type Me,
  permissionsOf,
  type SecuritySettings,
  SecuritySettings as SecuritySchema,
  type SessionStage,
  type UserSummary,
  Username,
} from "@fiscal-sb/contracts";
import type { Selectable } from "kysely";
import { readRow, writeRow } from "../content/kv.js";
import { parseStored } from "../db/documents.js";
import { type Db, now } from "../db/index.js";
import type { UsersTable } from "../db/schema.js";
import type { Env } from "../env.js";
import { preferencesOf } from "../content/preferences.js";
import { audit } from "./audit.js";
import { hashPassword, weakPassword } from "./password.js";

export type User = Selectable<UsersTable>;

/**
 * Whether `asker` may change `target`'s account from Users: someone with
 * users.manage, for anyone but the super admin and themselves. Your own
 * account is changed from Account.
 */
export const managesAccount = (
  asker: Pick<User, "id" | "role">,
  target: Pick<User, "id" | "role">,
) => can(asker.role, "users.manage") && target.role !== "superAdmin" && target.id !== asker.id;

export const getUser = (db: Db, id: string) =>
  db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();

export const userByUsername = (db: Db, username: string) =>
  db.selectFrom("users").selectAll().where("username", "=", username).executeTakeFirst();

export const toMe = (user: User, stage: SessionStage): Me => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
  permissions: permissionsOf(user.role),
  twoFactor: Boolean(user.totp_enrolled_at),
  stage,
  language: preferencesOf(user).language,
  mcpEnabled: Boolean(user.mcp_enabled),
});

export const toSummary = (user: User): UserSummary => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
  twoFactor: Boolean(user.totp_enrolled_at),
  disabled: Boolean(user.disabled_at),
  lastSignInAt: user.last_sign_in_at,
  createdAt: user.created_at,
  mcpEnabled: Boolean(user.mcp_enabled),
});

export async function securitySettings(db: Db): Promise<SecuritySettings> {
  return (
    parseStored(SecuritySchema, await readRow(db, "security"), "security settings") ?? {
      requireTwoFactor: false,
    }
  );
}

export const saveSecuritySettings = (db: Db, settings: SecuritySettings) =>
  writeRow(db, "security", settings);

/**
 * The first account. On a boot with no super admin, SUPER_ADMIN_USERNAME and
 * SUPER_ADMIN_PASSWORD make one that must change its password at first
 * sign-in; after that they're ignored. The admin preferences kept for the
 * whole site before there were users become its own.
 */
export async function seedSuperAdmin(db: Db, env: Env) {
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("role", "=", "superAdmin")
    .executeTakeFirst();
  if (existing) return;
  const username = Username.safeParse(env.SUPER_ADMIN_USERNAME ?? "");
  if (!username.success || !env.SUPER_ADMIN_PASSWORD)
    throw new Error(
      "There is no super admin yet. Set SUPER_ADMIN_USERNAME (3–32 letters, numbers, dots, hyphens or underscores) and SUPER_ADMIN_PASSWORD (at least 12 characters) to create one; it must change the password at first sign-in.",
    );
  const weak = weakPassword(env.SUPER_ADMIN_PASSWORD, username.data);
  if (weak) throw new Error(`SUPER_ADMIN_PASSWORD can't be used: ${weak}`);
  const preferences = parseStored(
    AdminPreferences,
    await readRow(db, "preferences"),
    "preferences",
  ) ?? {
    language: "en",
  };
  const id = randomUUID();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("users")
      .values({
        id,
        username: username.data,
        display_name: username.data,
        role: "superAdmin",
        password_hash: await hashPassword(env.SUPER_ADMIN_PASSWORD!),
        must_change_password: 1,
        preferences: JSON.stringify(preferences),
        created_at: now(),
        created_by: null,
      })
      .execute();
    await trx.deleteFrom("settings").where("key", "=", "preferences").execute();
  });
  await audit(db, { userId: null, action: "userChanged", target: id, detail: { seeded: true } });
}
