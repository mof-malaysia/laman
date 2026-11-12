/**
 * Signing in and the steps after it, one-time links, and your own account's
 * password, two-factor and sessions. See docs/auth.md.
 */
import { randomUUID } from "node:crypto";
import { can, type SessionStage } from "@fiscal-sb/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../auth/audit.js";
import { setMcpAccess } from "../agents/connections.js";
import { audited, authOf, userOf } from "../auth/guard.js";
import { parseAgent } from "../analytics/agent.js";
import { assertStrongPassword, dummyHash, hashPassword, verifyPassword } from "../auth/password.js";
import {
  advanceSession,
  endSessions,
  type Session,
  setCookie,
  startSession,
} from "../auth/sessions.js";
import { Throttle } from "../auth/throttle.js";
import { hashToken, newRecoveryCode, normaliseRecoveryCode } from "../auth/tokens.js";
import { acceptedStep, newSecret, otpauthUri } from "../auth/totp.js";
import { getUser, securitySettings, toMe, type User, userByUsername } from "../auth/users.js";
import { readDoc } from "../content/site.js";
import {
  CodeBody,
  envelope,
  JoinBody,
  LinkInfo,
  Me,
  MePatch,
  PasswordBody,
  RecoveryCodes,
  ResetBody,
  SessionSummary,
  SignInBody,
  TotpSetup,
} from "../contract.js";
import { type Db, now } from "../db/index.js";
import { HttpError } from "../errors.js";

const tags = ["auth"];
const anyStage: SessionStage[] = ["password", "totp", "enrol", "full"];

/**
 * Where a sign-in goes next. `verified`: two-factor was already checked in
 * this sign-in. The code comes before a forced password change, so a stolen
 * password alone can't choose a new one.
 */
async function stageFor(db: Db, user: User, verified: boolean): Promise<SessionStage> {
  if (user.totp_enrolled_at && !verified) return "totp";
  if (user.must_change_password) return "password";
  if (!user.totp_enrolled_at && (await securitySettings(db)).requireTwoFactor) return "enrol";
  return "full";
}

const wrongCode = () =>
  new HttpError(400, "wrong_code", "That code isn't right. Try the newest one.");

const linkGone = () =>
  new HttpError(
    410,
    "link_expired",
    "This link has expired or was already used. Ask an administrator for a new one.",
  );

/**
 * Marks a one-time link used, inside the transaction that uses it. Only one
 * of two requests sent at once with the same link gets it; the other fails.
 */
async function useLink(trx: Pick<Db, "updateTable">, id: string) {
  const claimed = await trx
    .updateTable("tokens")
    .set({ used_at: now() })
    .where("id", "=", id)
    .where("used_at", "is", null)
    .executeTakeFirst();
  if (Number(claimed.numUpdatedRows) === 0) throw linkGone();
}

/** A one-time link's row, if the token is live (and of `kind`, when given). */
async function liveLink(db: Db, token: string, kind?: "invite" | "reset") {
  const row = await db
    .selectFrom("tokens")
    .selectAll()
    .where("token_hash", "=", hashToken(token))
    .executeTakeFirst();
  if (!row || (kind && row.kind !== kind) || row.used_at || Date.parse(row.expires_at) < Date.now())
    throw linkGone();
  return row;
}

async function newRecoveryCodes(db: Db, userId: string) {
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("recovery_codes").where("user_id", "=", userId).execute();
    await trx
      .insertInto("recovery_codes")
      .values(
        codes.map((code) => ({
          user_id: userId,
          code_hash: hashToken(normaliseRecoveryCode(code)),
          used_at: null,
        })),
      )
      .execute();
  });
  return codes;
}

/** Checks a code from the app, or uses up a recovery code; throws when it's neither. */
async function useCode(db: Db, user: User, code: string, recovery: boolean) {
  if (user.totp_secret) {
    const step = acceptedStep(user.totp_secret, code, user.totp_last_step);
    if (step !== undefined) {
      await db
        .updateTable("users")
        .set({ totp_last_step: step })
        .where("id", "=", user.id)
        .execute();
      return;
    }
  }
  if (recovery) {
    const used = await db
      .updateTable("recovery_codes")
      .set({ used_at: now() })
      .where("user_id", "=", user.id)
      .where("code_hash", "=", hashToken(normaliseRecoveryCode(code)))
      .where("used_at", "is", null)
      .executeTakeFirst();
    if (Number(used.numUpdatedRows) > 0) return;
  }
  throw wrongCode();
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const throttle = new Throttle();
  // A username alone is something anyone can type, so its own limit is
  // looser and short: guessing one account from many addresses still slows
  // down, but nobody can keep an officer out for long.
  const usernameThrottle = new Throttle({ free: 20, maxMs: 60 * 1000 });

  /** An app code, counted against the same limit as the sign-in code step. */
  async function checkCode(user: User, code: string) {
    const keys = [`code:${user.id}`];
    throttle.attempt(keys);
    await useCode(db, user, code, false);
    throttle.succeed(keys);
  }

  /**
   * Takes a sign-in to its next stage: a new session when signing in or
   * joining, or `from` (the step just done) under a new token. Answers with
   * the person as they now are.
   */
  async function enter(
    request: FastifyRequest,
    reply: FastifyReply,
    user: User,
    verified: boolean,
    from?: Session,
  ) {
    const stage = await stageFor(db, user, verified);
    if (from) await advanceSession(db, from, stage, request, reply);
    else setCookie(request, reply, await startSession(db, user, stage, request));
    if (stage === "full") await signedIn(request, user);
    return { data: toMe(user, stage) };
  }

  async function signedIn(request: FastifyRequest, user: User) {
    await db
      .updateTable("users")
      .set({ last_sign_in_at: now() })
      .where("id", "=", user.id)
      .execute();
    await audit(db, { userId: user.id, action: "signIn", ip: request.ip });
  }

  app.post<{ Body: z.infer<typeof SignInBody> }>(
    "/auth/sign-in",
    {
      config: { access: "public" },
      schema: {
        summary: "Sign in",
        description:
          "Checks the username and password and starts a session in the cookie. The answer's `stage` says what's still needed: a code (`totp`), a new password (`password`), setting up two-factor (`enrol`), or nothing (`full`). After 5 tries from an address (or for a username from it), each must wait longer, up to 15 minutes; a username tried from many addresses waits at most a minute.",
        tags,
        body: SignInBody,
        response: { 200: envelope(Me) },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const keys = [`ip:${request.ip}`, `user:${username}@${request.ip}`];
      const userKeys = [`user:${username}`];
      throttle.check(keys);
      usernameThrottle.check(userKeys);
      throttle.attempt(keys);
      usernameThrottle.attempt(userKeys);
      const user = await userByUsername(db, username);
      const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
      if (!user || !ok || user.disabled_at) {
        await audit(db, {
          userId: user?.id ?? null,
          action: "signInFailed",
          target: username,
          detail: { reason: user?.disabled_at && ok ? "disabled" : "password" },
          ip: request.ip,
        });
        throw new HttpError(401, "wrong_password", "That username or password isn't right.");
      }
      throttle.succeed(keys);
      usernameThrottle.succeed(userKeys);
      return enter(request, reply, user, false);
    },
  );

  app.post(
    "/auth/sign-out",
    {
      config: { access: "signedIn", stages: anyStage },
      schema: { summary: "Sign out", tags, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await db.deleteFrom("sessions").where("id", "=", authOf(request).session.id).execute();
      if (authOf(request).session.stage === "full")
        await audit(db, { userId: authOf(request).user.id, action: "signOut", ip: request.ip });
      setCookie(request, reply, null);
      return reply.status(204).send();
    },
  );

  app.get(
    "/auth/me",
    {
      config: { access: "signedIn", stages: anyStage },
      schema: {
        summary: "Who's signed in",
        description: "The person, their role and permissions, and how far their sign-in has got.",
        tags,
        response: { 200: envelope(Me) },
      },
    },
    async (request) => ({ data: toMe(authOf(request).user, authOf(request).session.stage) }),
  );

  app.patch<{ Body: MePatch }>(
    "/auth/me",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Change your own account",
        description:
          "Your display name, which history and the user menu show. And, for the super admin, whose account nobody else changes, your own MCP access: turning it off ends your agents' connections. Everyone else's is set on Users.",
        tags,
        body: MePatch,
        response: { 200: envelope(Me) },
      },
    },
    async (request) => {
      const user = userOf(request);
      const { displayName, mcpEnabled } = request.body;
      if (displayName !== undefined)
        await db
          .updateTable("users")
          .set({ display_name: displayName })
          .where("id", "=", user.id)
          .execute();
      if (mcpEnabled !== undefined && mcpEnabled !== Boolean(user.mcp_enabled)) {
        if (!can(user.role, "security.manage"))
          throw new HttpError(
            403,
            "forbidden",
            "Ask an Admin to change this account's MCP access.",
          );
        await setMcpAccess(db, user.id, mcpEnabled, user.id);
        audited(request, { action: "userChanged", target: user.id, detail: { mcpEnabled } });
      }
      return { data: toMe((await getUser(db, user.id))!, authOf(request).session.stage) };
    },
  );

  app.post<{ Body: z.infer<typeof CodeBody> }>(
    "/auth/totp",
    {
      config: { access: "signedIn", stages: ["totp"] },
      schema: {
        summary: "Enter a two-factor code",
        description: "A 6-digit code from the authenticator app, or one of the recovery codes.",
        tags,
        body: CodeBody,
        response: { 200: envelope(Me) },
      },
    },
    async (request, reply) => {
      const user = userOf(request);
      const keys = [`code:${user.id}`];
      throttle.attempt(keys);
      try {
        await useCode(db, user, request.body.code, true);
      } catch (error) {
        await audit(db, {
          userId: user.id,
          action: "signInFailed",
          detail: { reason: "code" },
          ip: request.ip,
        });
        throw error;
      }
      throttle.succeed(keys);
      return enter(request, reply, (await getUser(db, user.id))!, true, authOf(request).session);
    },
  );

  app.post<{ Body: z.infer<typeof PasswordBody> }>(
    "/auth/password",
    {
      config: { access: "signedIn", stages: ["password", "full"] },
      schema: {
        summary: "Change your password",
        description:
          "Needs the current password, except straight after signing in with one that must be changed. Signs you out everywhere else.",
        tags,
        body: PasswordBody,
        response: { 200: envelope(Me) },
      },
    },
    async (request, reply) => {
      const user = userOf(request);
      const { current, password } = request.body;
      const forced = authOf(request).session.stage === "password";
      if (!forced && !(current && (await verifyPassword(current, user.password_hash))))
        throw new HttpError(400, "wrong_password", "The current password isn't right.");
      // Checked against the hash only when there's no current password to compare.
      if (forced ? await verifyPassword(password, user.password_hash) : password === current)
        throw new HttpError(400, "same_password", "Choose a password not used here before.");
      assertStrongPassword(password, user.username);
      await db
        .updateTable("users")
        .set({ password_hash: await hashPassword(password), must_change_password: 0 })
        .where("id", "=", user.id)
        .execute();
      await endSessions(db, user.id, authOf(request).session.id);
      await audit(db, { userId: user.id, action: "passwordChanged", ip: request.ip });
      const next = (await getUser(db, user.id))!;
      return enter(request, reply, next, Boolean(user.totp_enrolled_at), authOf(request).session);
    },
  );

  app.post(
    "/auth/totp/setup",
    {
      config: { access: "signedIn", stages: ["enrol", "full"] },
      schema: {
        summary: "Start setting up two-factor",
        description:
          "A new secret and its otpauth:// address for the QR code. Nothing changes until a code from it is confirmed.",
        tags,
        response: { 200: envelope(TotpSetup) },
      },
    },
    async (request) => {
      const user = userOf(request);
      if (user.totp_enrolled_at)
        throw new HttpError(409, "two_factor_enrolled", "Two-factor is already set up.");
      const secret = newSecret();
      await db
        .updateTable("users")
        .set({ totp_secret: secret })
        .where("id", "=", user.id)
        .execute();
      const site = (await readDoc(db, "settings", "published")).identity.siteName;
      return { data: { secret, uri: otpauthUri(secret, user.username, site) } };
    },
  );

  app.post<{ Body: z.infer<typeof CodeBody> }>(
    "/auth/totp/enrol",
    {
      config: { access: "signedIn", stages: ["enrol", "full"] },
      schema: {
        summary: "Finish setting up two-factor",
        description:
          "Confirms a code from the new secret and returns 10 recovery codes, shown this once.",
        tags,
        body: CodeBody,
        response: { 200: envelope(z.object({ me: Me, codes: z.array(z.string()) })) },
      },
    },
    async (request, reply) => {
      const user = userOf(request);
      if (user.totp_enrolled_at)
        throw new HttpError(409, "two_factor_enrolled", "Two-factor is already set up.");
      if (!user.totp_secret)
        throw new HttpError(409, "no_setup", "Start setting up two-factor first.");
      await checkCode(user, request.body.code);
      await db
        .updateTable("users")
        .set({ totp_enrolled_at: now() })
        .where("id", "=", user.id)
        .execute();
      const codes = await newRecoveryCodes(db, user.id);
      await audit(db, { userId: user.id, action: "twoFactorEnrolled", ip: request.ip });
      const next = (await getUser(db, user.id))!;
      if (authOf(request).session.stage === "full")
        return { data: { me: toMe(next, "full"), codes } };
      const { data } = await enter(request, reply, next, true, authOf(request).session);
      return { data: { me: data, codes } };
    },
  );

  app.post<{ Body: z.infer<typeof CodeBody> }>(
    "/auth/recovery-codes",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Make new recovery codes",
        description: "Needs a current code from the app. The old recovery codes stop working.",
        tags,
        body: CodeBody,
        response: { 200: envelope(RecoveryCodes) },
      },
    },
    async (request) => {
      const user = userOf(request);
      if (!user.totp_enrolled_at)
        throw new HttpError(409, "no_two_factor", "Set up two-factor first.");
      await checkCode(user, request.body.code);
      const codes = await newRecoveryCodes(db, user.id);
      await audit(db, { userId: user.id, action: "recoveryCodesMade", ip: request.ip });
      return { data: { codes } };
    },
  );

  app.post<{ Body: { token: string } }>(
    "/auth/link",
    {
      config: { access: "public" },
      schema: {
        summary: "What a one-time link is for",
        description: "Lets the join or reset page say whose it is before it's used.",
        tags,
        body: z.object({ token: z.string() }),
        response: { 200: envelope(LinkInfo) },
      },
    },
    async (request) => {
      const row = await liveLink(db, request.body.token);
      const user = row.user_id ? await getUser(db, row.user_id) : undefined;
      return {
        data: {
          kind: row.kind,
          ...(row.role && { role: row.role }),
          ...(user && { username: user.username }),
          expiresAt: row.expires_at,
        },
      };
    },
  );

  app.post<{ Body: z.infer<typeof JoinBody> }>(
    "/auth/join",
    {
      config: { access: "public" },
      schema: {
        summary: "Accept an invite",
        description:
          "Makes the account with the invite's role and signs it in; with two-factor required, setting it up comes next.",
        tags,
        body: JoinBody,
        response: { 200: envelope(Me) },
      },
    },
    async (request, reply) => {
      const { token, username, displayName, password } = request.body;
      const invite = await liveLink(db, token, "invite");
      if (await userByUsername(db, username))
        throw new HttpError(409, "username_taken", "That username is taken. Choose another.");
      assertStrongPassword(password, username);
      const id = randomUUID();
      const passwordHash = await hashPassword(password);
      await db.transaction().execute(async (trx) => {
        await useLink(trx, invite.id);
        await trx
          .insertInto("users")
          .values({
            id,
            username,
            display_name: displayName,
            role: invite.role!,
            password_hash: passwordHash,
            created_at: now(),
            created_by: invite.created_by,
          })
          .execute();
        await audit(trx, {
          userId: id,
          action: "inviteUsed",
          target: invite.id,
          detail: { role: invite.role },
          ip: request.ip,
        });
      });
      return enter(request, reply, (await getUser(db, id))!, false);
    },
  );

  app.post<{ Body: z.infer<typeof ResetBody> }>(
    "/auth/reset",
    {
      config: { access: "public" },
      schema: {
        summary: "Choose a new password from a reset link",
        description:
          "Signs the person out everywhere. They then sign in as usual, two-factor included.",
        tags,
        body: ResetBody,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body;
      const link = await liveLink(db, token, "reset");
      const user = (await getUser(db, link.user_id!))!;
      assertStrongPassword(password, user.username);
      const passwordHash = await hashPassword(password);
      await db.transaction().execute(async (trx) => {
        await useLink(trx, link.id);
        await trx
          .updateTable("users")
          .set({ password_hash: passwordHash, must_change_password: 0 })
          .where("id", "=", user.id)
          .execute();
        await endSessions(trx, user.id);
        await audit(trx, { userId: user.id, action: "passwordReset", ip: request.ip });
      });
      return reply.status(204).send();
    },
  );

  app.get(
    "/auth/sessions",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Your sessions",
        description: "Where you're signed in, newest first.",
        tags,
        response: { 200: envelope(z.array(SessionSummary)) },
      },
    },
    async (request) => {
      const { user, session } = request.auth!;
      const rows = await db
        .selectFrom("sessions")
        .selectAll()
        .where("user_id", "=", user.id)
        .where("stage", "=", "full")
        .orderBy("last_seen_at", "desc")
        .execute();
      return {
        data: rows.map((r) => ({
          id: r.id,
          current: r.id === session.id,
          createdAt: r.created_at,
          lastSeenAt: r.last_seen_at,
          ip: r.ip,
          browser: parseAgent(r.user_agent).browser,
          os: parseAgent(r.user_agent).os,
        })),
      };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/auth/sessions/:id",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Sign out one of your sessions",
        tags,
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await db
        .deleteFrom("sessions")
        .where("id", "=", request.params.id)
        .where("user_id", "=", authOf(request).user.id)
        .execute();
      return reply.status(204).send();
    },
  );
};
