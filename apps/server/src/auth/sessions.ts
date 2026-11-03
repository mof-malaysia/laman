/**
 * Sessions: a random token in a cookie, its SHA-256 in `sessions`. A sign-in
 * moves through stages (password, totp, enrol, full), with a new token at
 * each, so a token from an unfinished sign-in never becomes a signed-in one.
 */
import { randomUUID } from "node:crypto";
import type { SessionStage } from "@fiscal-sb/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Selectable } from "kysely";
import { type Db, now } from "../db/index.js";
import type { SessionsTable } from "../db/schema.js";
import { hashToken, newToken } from "./tokens.js";
import type { User } from "./users.js";

/** Signed out after this long without a request. */
export const IDLE_MS = 8 * 60 * 60 * 1000;
/** Signed out this long after signing in, however busy. */
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** An unfinished sign-in (a code still to enter, say) lasts this long. */
export const STAGE_MS = 10 * 60 * 1000;
/** `last_seen_at` is written at most this often. */
const SEEN_MS = 60 * 1000;

export type Session = Selectable<SessionsTable>;

/** Behind HTTPS the cookie gets the __Host- prefix, which browsers only accept when it's Secure. */
const SECURE_NAME = "__Host-sb_session";
const PLAIN_NAME = "sb_session";

function readCookie(request: FastifyRequest) {
  const header = request.headers.cookie ?? "";
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  // Only the name this connection would set: over HTTPS a plain sb_session
  // could have been planted by a neighbouring subdomain.
  return cookies.get(request.protocol === "https" ? SECURE_NAME : PLAIN_NAME);
}

export function setCookie(request: FastifyRequest, reply: FastifyReply, token: string | null) {
  const secure = request.protocol === "https";
  const parts = [
    `${secure ? SECURE_NAME : PLAIN_NAME}=${token ?? ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    ...(token ? [] : ["Max-Age=0"]),
  ];
  reply.header("set-cookie", parts.join("; "));
}

/** A new session for `user` at `stage`; returns the cookie's token. */
export async function startSession(
  db: Db,
  user: Pick<User, "id">,
  stage: SessionStage,
  request: FastifyRequest,
) {
  const token = newToken();
  const at = now();
  await db
    .insertInto("sessions")
    .values({
      id: randomUUID(),
      token_hash: hashToken(token),
      user_id: user.id,
      stage,
      created_at: at,
      last_seen_at: at,
      ip: request.ip,
      user_agent: (request.headers["user-agent"] ?? "").slice(0, 300),
    })
    .execute();
  return token;
}

/** Moves a sign-in to its next stage under a new token, and sets the cookie. */
export async function advanceSession(
  db: Db,
  session: Session,
  stage: SessionStage,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await db.deleteFrom("sessions").where("id", "=", session.id).execute();
  const token = await startSession(db, { id: session.user_id }, stage, request);
  setCookie(request, reply, token);
}

const expired = (session: Session, at: number) =>
  session.stage === "full"
    ? at - Date.parse(session.last_seen_at) > IDLE_MS ||
      at - Date.parse(session.created_at) > ABSOLUTE_MS
    : at - Date.parse(session.created_at) > STAGE_MS;

/** The request's session and its user, in one query, if the cookie names a live one. */
export async function sessionOf(db: Db, request: FastifyRequest) {
  const token = readCookie(request);
  if (!token) return undefined;
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .selectAll("users")
    .select([
      "sessions.id as session_id",
      "sessions.token_hash",
      "sessions.stage",
      "sessions.created_at as session_created_at",
      "sessions.last_seen_at",
      "sessions.ip",
      "sessions.user_agent",
    ])
    .where("sessions.token_hash", "=", hashToken(token))
    .executeTakeFirst();
  if (!row) return undefined;
  const {
    session_id,
    token_hash,
    stage,
    session_created_at,
    last_seen_at,
    ip,
    user_agent,
    ...user
  } = row;
  const session: Session = {
    id: session_id,
    token_hash,
    user_id: user.id,
    stage,
    created_at: session_created_at,
    last_seen_at,
    ip,
    user_agent,
  };
  const at = Date.now();
  if (user.disabled_at || expired(session, at)) {
    await db.deleteFrom("sessions").where("id", "=", session.id).execute();
    return undefined;
  }
  if (at - Date.parse(session.last_seen_at) > SEEN_MS)
    await db
      .updateTable("sessions")
      .set({ last_seen_at: new Date(at).toISOString() })
      .where("id", "=", session.id)
      .execute();
  return { session, user: user as User };
}

/** Signs someone out everywhere, except `keep` (the session asking, when it's their own). */
export async function endSessions(db: Pick<Db, "deleteFrom">, userId: string, keep?: string) {
  let q = db.deleteFrom("sessions").where("user_id", "=", userId);
  if (keep) q = q.where("id", "!=", keep);
  await q.execute();
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Sessions expire lazily on use; this clears the ones nobody came back to. ISO times compare as text. */
export async function purgeSessions(db: Db) {
  await db
    .deleteFrom("sessions")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("stage", "=", "full"),
          eb.or([eb("last_seen_at", "<", ago(IDLE_MS)), eb("created_at", "<", ago(ABSOLUTE_MS))]),
        ]),
        eb.and([eb("stage", "!=", "full"), eb("created_at", "<", ago(STAGE_MS))]),
      ]),
    )
    .execute();
}
