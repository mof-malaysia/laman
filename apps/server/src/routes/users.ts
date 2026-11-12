/**
 * People, for Admins: invites, roles, reset links, two-factor and the audit
 * log. The super admin can't be changed here by anyone, and nobody changes
 * their own role or disables themselves.
 */
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { listAudit } from "../auth/audit.js";
import { audited, userOf } from "../auth/guard.js";
import { endConnections, setMcpAccess } from "../agents/connections.js";
import { endSessions } from "../auth/sessions.js";
import { hashToken, newToken } from "../auth/tokens.js";
import {
  getUser,
  saveSecuritySettings,
  securitySettings,
  toSummary,
  type User,
} from "../auth/users.js";
import {
  AuditEntry,
  AuditQuery,
  envelope,
  Invite,
  InviteBody,
  OneTimeLink,
  SecuritySettings,
  UserPatch,
  UserSummary,
} from "../contract.js";
import { type Db, now } from "../db/index.js";
import { HttpError } from "../errors.js";

const tags = ["users"];
const INVITE_MS = 72 * 60 * 60 * 1000;
const RESET_MS = 24 * 60 * 60 * 1000;
/** How long an expired invite stays on the list. */
const EXPIRED_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;
const UserParams = z.object({ id: z.uuid() });

/** A one-time link: its token goes in the fragment, so it never reaches a server log. */
export async function makeLink(
  db: Db,
  link: {
    kind: "invite" | "reset";
    role?: User["role"];
    userId?: string;
    note?: string;
    by: string | null;
  },
) {
  const token = newToken();
  const expiresAt = new Date(
    Date.now() + (link.kind === "invite" ? INVITE_MS : RESET_MS),
  ).toISOString();
  const id = randomUUID();
  await db
    .insertInto("tokens")
    .values({
      id,
      token_hash: hashToken(token),
      kind: link.kind,
      role: link.role ?? null,
      user_id: link.userId ?? null,
      note: link.note ?? "",
      created_by: link.by,
      created_at: now(),
      expires_at: expiresAt,
      used_at: null,
    })
    .execute();
  return { id, path: `/admin/${link.kind === "invite" ? "join" : "reset"}#${token}`, expiresAt };
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  /** Someone the asker may change: anyone but the super admin, and not themselves. */
  async function other(request: FastifyRequest, id: string) {
    const target = await getUser(db, id);
    if (!target) throw new HttpError(404, "user_not_found", "No one with that id.");
    if (target.role === "superAdmin")
      throw new HttpError(403, "forbidden", "The super admin can only change their own account.");
    if (target.id === userOf(request).id)
      throw new HttpError(409, "own_account", "Change this account from Account.");
    return target;
  }

  app.get(
    "/users",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "List people",
        description: "Everyone with an account, the super admin first, then by name.",
        tags,
        response: { 200: envelope(z.array(UserSummary)) },
      },
    },
    async () => {
      const rows = await db.selectFrom("users").selectAll().orderBy("display_name").execute();
      return {
        data: rows
          .toSorted((a, b) => Number(b.role === "superAdmin") - Number(a.role === "superAdmin"))
          .map(toSummary),
      };
    },
  );

  app.patch<{ Params: { id: string }; Body: UserPatch }>(
    "/users/:id",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Change someone's role, name or access",
        description:
          "A new role or disabling the account signs them out everywhere. Accounts are disabled, never deleted, so history keeps their name. Turning off MCP access, or disabling the account, ends their agents' connections.",
        tags,
        params: UserParams,
        body: UserPatch,
        response: { 200: envelope(UserSummary) },
      },
    },
    async (request) => {
      const target = await other(request, request.params.id);
      const { role, displayName, disabled, mcpEnabled } = request.body;
      const changes = {
        ...(role !== undefined && role !== target.role && { role }),
        ...(displayName !== undefined &&
          displayName !== target.display_name && {
            display_name: displayName,
          }),
        ...(disabled !== undefined &&
          disabled !== Boolean(target.disabled_at) && { disabled_at: disabled ? now() : null }),
      };
      const mcpChanged = mcpEnabled !== undefined && mcpEnabled !== Boolean(target.mcp_enabled);
      if (Object.keys(changes).length || mcpChanged) {
        if (Object.keys(changes).length)
          await db.updateTable("users").set(changes).where("id", "=", target.id).execute();
        if (changes.role || changes.disabled_at) await endSessions(db, target.id);
        // A new role applies to agents at their next call; no access, or no account, ends them.
        if (mcpChanged) await setMcpAccess(db, target.id, mcpEnabled, userOf(request).id);
        if (changes.disabled_at) await endConnections(db, target.id, userOf(request).id);
        audited(request, {
          action: "userChanged",
          target: target.id,
          detail: {
            ...(changes.role && { role: changes.role, roleBefore: target.role }),
            ...(changes.display_name && { displayName: changes.display_name }),
            ...("disabled_at" in changes && { disabled: Boolean(changes.disabled_at) }),
            ...(mcpChanged && { mcpEnabled }),
          },
        });
      }
      return { data: toSummary((await getUser(db, target.id))!) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/reset-link",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Make a password reset link",
        description:
          "A one-time link, good for 24 hours, to hand to the person. Using it signs them out everywhere. Earlier reset links for them stop working.",
        tags,
        params: UserParams,
        response: { 200: envelope(OneTimeLink) },
      },
    },
    async (request) => {
      const target = await other(request, request.params.id);
      await db
        .deleteFrom("tokens")
        .where("kind", "=", "reset")
        .where("user_id", "=", target.id)
        .where("used_at", "is", null)
        .execute();
      const { path, expiresAt } = await makeLink(db, {
        kind: "reset",
        userId: target.id,
        by: userOf(request).id,
      });
      audited(request, { action: "resetLinkMade", target: target.id });
      return { data: { path, expiresAt } };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/clear-2fa",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Clear someone's two-factor",
        description:
          "For a lost phone. Signs them out everywhere; if two-factor is required, they set it up again at their next sign-in.",
        tags,
        params: UserParams,
        response: { 200: envelope(UserSummary) },
      },
    },
    async (request) => {
      const target = await other(request, request.params.id);
      await clearTwoFactor(db, target.id);
      audited(request, { action: "twoFactorCleared", target: target.id });
      return { data: toSummary((await getUser(db, target.id))!) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/sign-out",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Sign someone out everywhere",
        tags,
        params: UserParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const target = await other(request, request.params.id);
      await endSessions(db, target.id);
      audited(request, { action: "userSignedOut", target: target.id });
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/end-agents",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "End someone's agent connections",
        description:
          "Every live agent connection of theirs stops working; they can connect again while they have MCP access.",
        tags,
        params: UserParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const target = await other(request, request.params.id);
      await endConnections(db, target.id, userOf(request).id);
      return reply.status(204).send();
    },
  );

  app.get(
    "/users/invites",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "List invites not used yet",
        description:
          "Invites not yet used, newest first: those still good, and those that expired in the last 7 days, so it's clear a link stopped working.",
        tags,
        response: { 200: envelope(z.array(Invite)) },
      },
    },
    async () => {
      const rows = await db
        .selectFrom("tokens")
        .leftJoin("users", "users.id", "tokens.created_by")
        .select([
          "tokens.id",
          "tokens.role",
          "tokens.note",
          "users.display_name as created_by",
          "tokens.created_at",
          "tokens.expires_at",
        ])
        .where("tokens.kind", "=", "invite")
        .where("tokens.used_at", "is", null)
        .where("tokens.expires_at", ">", new Date(Date.now() - EXPIRED_SHOWN_MS).toISOString())
        .orderBy("tokens.created_at", "desc")
        .execute();
      return {
        data: rows.map((r) => ({
          id: r.id,
          role: r.role!,
          note: r.note,
          createdBy: r.created_by,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        })),
      };
    },
  );

  app.post<{ Body: z.infer<typeof InviteBody> }>(
    "/users/invites",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Invite someone",
        description:
          "A one-time link, good for 72 hours, with the role already chosen. It's shown this once: hand it to the person, who chooses their username and password.",
        tags,
        body: InviteBody,
        response: { 200: envelope(OneTimeLink) },
      },
    },
    async (request) => {
      const { role, note } = request.body;
      const link = await makeLink(db, { kind: "invite", role, note, by: userOf(request).id });
      audited(request, { action: "inviteMade", target: link.id, detail: { role, note } });
      return { data: { path: link.path, expiresAt: link.expiresAt } };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/users/invites/:id",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Revoke an invite",
        description:
          "Its link stops working. An expired invite is only taken off the list: that isn't recorded as revoking it.",
        tags,
        params: UserParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const invite = await db
        .deleteFrom("tokens")
        .where("id", "=", request.params.id)
        .where("kind", "=", "invite")
        .where("used_at", "is", null)
        .returning(["role", "note", "expires_at"])
        .executeTakeFirst();
      // The note and role, since the invite itself is gone.
      if (invite && invite.expires_at > now())
        audited(request, {
          action: "inviteRevoked",
          target: request.params.id,
          detail: { role: invite.role, note: invite.note },
        });
      return reply.status(204).send();
    },
  );

  app.get<{ Querystring: z.infer<typeof AuditQuery> }>(
    "/audit",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Read the audit log",
        description:
          "Sign-ins, account changes and changes to what's live, newest first, 50 at a time (up to 1000 with `limit`, for a download): pass the last id as `before` for the next page. `names` gives the people's names and pages' titles the entry mentions. Kept for a year.",
        tags,
        querystring: AuditQuery,
        response: { 200: envelope(z.array(AuditEntry)) },
      },
    },
    async (request) => ({ data: await listAudit(db, request.query) }),
  );

  app.get(
    "/security",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get the security settings",
        description: "Whether everyone must use two-factor.",
        tags,
        response: { 200: envelope(SecuritySettings) },
      },
    },
    async () => ({ data: await securitySettings(db) }),
  );

  app.put<{ Body: SecuritySettings }>(
    "/security",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Save the security settings",
        description:
          "They apply on save. Requiring two-factor needs yours set up first; everyone signed in without it is asked to set it up at their next request.",
        tags,
        body: SecuritySettings,
        response: { 200: envelope(SecuritySettings) },
      },
    },
    async (request) => {
      const before = await securitySettings(db);
      if (request.body.requireTwoFactor && !userOf(request).totp_enrolled_at)
        throw new HttpError(
          409,
          "two_factor_not_enrolled",
          "Set up two-factor for yourself before requiring it for everyone.",
        );
      await saveSecuritySettings(db, request.body);
      if (before.requireTwoFactor === request.body.requireTwoFactor) return { data: request.body };
      // Requiring it applies now: everyone signed in without it sets it up before anything else.
      if (request.body.requireTwoFactor)
        await db
          .updateTable("sessions")
          .set({ stage: "enrol" })
          .where("stage", "=", "full")
          .where("user_id", "in", (eb) =>
            eb.selectFrom("users").select("id").where("totp_enrolled_at", "is", null),
          )
          .execute();
      audited(request, {
        action: "securityChanged",
        detail: { requireTwoFactor: request.body.requireTwoFactor },
      });
      return { data: request.body };
    },
  );
};

export async function clearTwoFactor(db: Db, userId: string) {
  await db
    .updateTable("users")
    .set({ totp_secret: null, totp_last_step: null, totp_enrolled_at: null })
    .where("id", "=", userId)
    .execute();
  await db.deleteFrom("recovery_codes").where("user_id", "=", userId).execute();
  await endSessions(db, userId);
}
