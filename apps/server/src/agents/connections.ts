/**
 * Agent connections: what an officer's consent becomes. A one-time code goes
 * back to the client, which trades it (with its PKCE verifier) for an access
 * token, good for an hour, and a refresh token, which rotates on every use.
 * Only SHA-256 hashes are stored, as for sessions. A connection ends a week
 * after consent, when revoked, or when its refresh token is used twice.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { type AgentConnection, CONNECTION_DAYS } from "@fiscal-sb/contracts";
import type { FastifyRequest } from "fastify";
import { audit } from "../auth/audit.js";
import { userAgentOf } from "../auth/sessions.js";
import { grantStatus, hashToken, newToken } from "../auth/tokens.js";
import type { User } from "../auth/users.js";
import { ago, type Db, later, now } from "../db/index.js";

const ACCESS_MS = 60 * 60 * 1000;
const CONNECTION_MS = CONNECTION_DAYS * 24 * 60 * 60 * 1000;
const CODE_MS = 10 * 60 * 1000;
/**
 * An old refresh token seen this soon after its rotation is a client's own
 * second, parallel refresh, not a stolen copy: refused, without ending the
 * connection. `last_used_at` is when it rotated (refresh sets it).
 */
const REFRESH_GRACE_MS = 30 * 1000;
/** `last_used_at` is written at most this often. */
const SEEN_MS = 60 * 1000;
/** Ended connections stay on the Agents list this long. */
const KEPT_MS = 30 * 24 * 60 * 60 * 1000;
/** A client that registered but was never allowed is forgotten after this. */
const UNUSED_CLIENT_MS = 24 * 60 * 60 * 1000;

type Code = {
  clientId: string;
  userId: string;
  redirectUri: string;
  challenge: string;
  expiresAt: number;
};

/** One-time codes, by hash. In memory: they last minutes, and a restart only means connecting again. */
const codes = new Map<string, Code>();

export type Tokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
};

/** An OAuth error, answered as RFC 6749 says rather than in the API's error shape. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The code for an officer's consent, to send back on the redirect. */
export function makeCode(code: Omit<Code, "expiresAt">) {
  const at = Date.now();
  for (const [hash, old] of codes) if (old.expiresAt < at) codes.delete(hash);
  const token = newToken();
  codes.set(hashToken(token), { ...code, expiresAt: at + CODE_MS });
  return token;
}

/** PKCE S256: the verifier's SHA-256, base64url, is the challenge sent at the start. */
function verifies(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const made = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const sent = Buffer.from(challenge);
  return made.length === sent.length && timingSafeEqual(made, sent);
}

/** A fresh pair of tokens, as stored: the hashes, and what goes to the client. */
function issue() {
  const access = `sba_${newToken()}`;
  const renewal = `sbr_${newToken()}`;
  return {
    stored: {
      access_hash: hashToken(access),
      access_expires_at: later(ACCESS_MS),
      refresh_hash: hashToken(renewal),
    },
    tokens: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_MS / 1000,
      refresh_token: renewal,
    } satisfies Tokens,
  };
}

/** Trades a consent's code for the connection's first tokens. */
export async function exchangeCode(
  db: Db,
  grant: { code: string; verifier: string; clientId: string; redirectUri: string },
  request: FastifyRequest,
) {
  const hash = hashToken(grant.code);
  const code = codes.get(hash);
  // Used once, whatever happens next.
  codes.delete(hash);
  if (
    !code ||
    code.expiresAt < Date.now() ||
    code.clientId !== grant.clientId ||
    code.redirectUri !== grant.redirectUri
  )
    throw new OAuthError("invalid_grant", "The code is unknown, used or expired.");
  if (!verifies(grant.verifier, code.challenge))
    throw new OAuthError("invalid_grant", "The code verifier doesn't match.");
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", code.userId)
    .executeTakeFirst();
  if (!user || user.disabled_at || !user.mcp_enabled)
    throw new OAuthError("access_denied", "This account can't connect agents.");
  const client = await db
    .selectFrom("oauth_clients")
    .select("name")
    .where("id", "=", code.clientId)
    .executeTakeFirst();
  if (!client) throw new OAuthError("invalid_client", "The client isn't registered.");

  const { stored, tokens } = issue();
  const id = randomUUID();
  const at = now();
  await db
    .insertInto("agent_connections")
    .values({
      id,
      user_id: user.id,
      client_id: code.clientId,
      ...stored,
      previous_refresh_hash: null,
      created_at: at,
      last_used_at: at,
      expires_at: later(CONNECTION_MS),
      revoked_at: null,
      revoked_by: null,
      ip: request.ip,
      user_agent: userAgentOf(request),
    })
    .execute();
  await audit(db, {
    userId: user.id,
    action: "agentConnected",
    target: id,
    detail: { client: client.name },
    ip: request.ip,
  });
  return tokens;
}

/** New tokens for a refresh token; the one used stops working. */
export async function refresh(
  db: Db,
  grant: { refreshToken: string; clientId: string },
  request: FastifyRequest,
) {
  const hash = hashToken(grant.refreshToken);
  const reused = await db
    .selectFrom("agent_connections")
    .select(["id", "user_id", "last_used_at"])
    .where("previous_refresh_hash", "=", hash)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  if (reused) {
    // Just rotated: the same client refreshing twice at once, not a copy. Refused, but kept.
    if (Date.now() - Date.parse(reused.last_used_at) < REFRESH_GRACE_MS)
      throw new OAuthError("invalid_grant", "The refresh token was just used: use the newest one.");
    // Someone else holds a copy of this connection's tokens.
    await revokeConnection(db, reused.id, null, request.ip, "refreshReused");
    throw new OAuthError("invalid_grant", "The refresh token was already used.");
  }
  const row = await db
    .selectFrom("agent_connections")
    .innerJoin("users", "users.id", "agent_connections.user_id")
    .select([
      "agent_connections.id",
      "agent_connections.client_id",
      "agent_connections.expires_at",
      "users.disabled_at",
      "users.mcp_enabled",
    ])
    .where("agent_connections.refresh_hash", "=", hash)
    .where("agent_connections.revoked_at", "is", null)
    .executeTakeFirst();
  if (!row || row.client_id !== grant.clientId || row.expires_at < now())
    throw new OAuthError("invalid_grant", "The refresh token is unknown or expired.");
  if (row.disabled_at || !row.mcp_enabled)
    throw new OAuthError("invalid_grant", "This account can't connect agents.");
  const { stored, tokens } = issue();
  await db
    .updateTable("agent_connections")
    .set({ ...stored, previous_refresh_hash: hash, last_used_at: now() })
    .where("id", "=", row.id)
    .execute();
  return tokens;
}

export type Connection = {
  id: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  expiresAt: string;
};

/** The live connection an access token belongs to, and its officer as they are now. */
export const connectionOf = (db: Db, accessToken: string) =>
  findConnection(db, { accessHash: hashToken(accessToken) });

/**
 * A connection by id, if it's still open and its officer may still use agents:
 * for work an agent started earlier (an upload link), checked again when it's used.
 * Not its access token's hour, which the link outlives.
 */
export const openConnection = (db: Db, id: string) => findConnection(db, { id });

async function findConnection(
  db: Db,
  by: { accessHash: string } | { id: string },
): Promise<{ connection: Connection; user: User } | undefined> {
  const row = await db
    .selectFrom("agent_connections")
    .innerJoin("users", "users.id", "agent_connections.user_id")
    .innerJoin("oauth_clients", "oauth_clients.id", "agent_connections.client_id")
    .selectAll("users")
    .select([
      "agent_connections.id as connection_id",
      "agent_connections.client_id",
      "oauth_clients.name as client_name",
      "agent_connections.access_expires_at",
      "agent_connections.created_at as connection_created_at",
      "agent_connections.expires_at",
      "agent_connections.last_used_at",
      "agent_connections.revoked_at",
    ])
    .where((eb) =>
      "id" in by
        ? eb("agent_connections.id", "=", by.id)
        : eb("agent_connections.access_hash", "=", by.accessHash),
    )
    .executeTakeFirst();
  const at = now();
  if (
    !row ||
    row.revoked_at ||
    ("accessHash" in by && (!row.access_expires_at || row.access_expires_at < at)) ||
    row.expires_at < at ||
    row.disabled_at ||
    !row.mcp_enabled
  )
    return undefined;
  const {
    connection_id,
    client_id,
    client_name,
    access_expires_at: _access,
    connection_created_at,
    expires_at,
    last_used_at,
    revoked_at: _revoked,
    ...user
  } = row;
  if (Date.now() - Date.parse(last_used_at) > SEEN_MS)
    await db
      .updateTable("agent_connections")
      .set({ last_used_at: at })
      .where("id", "=", connection_id)
      .execute();
  return {
    connection: {
      id: connection_id,
      clientId: client_id,
      clientName: client_name,
      createdAt: connection_created_at,
      expiresAt: expires_at,
    },
    user: user as User,
  };
}

/** Ends a connection now: its tokens stop working at the next call. */
export async function revokeConnection(
  db: Db,
  id: string,
  by: string | null,
  ip: string | null = null,
  reason = "revoked",
) {
  const row = await db
    .updateTable("agent_connections")
    .set({
      access_hash: null,
      refresh_hash: null,
      previous_refresh_hash: null,
      revoked_at: now(),
      revoked_by: by,
    })
    .where("id", "=", id)
    .where("revoked_at", "is", null)
    .returning("user_id")
    .executeTakeFirst();
  if (row)
    await audit(db, {
      userId: by ?? row.user_id,
      action: "agentRevoked",
      // The person whose agent it was, so the log can name them.
      target: row.user_id,
      detail: { reason, connection: id },
      ip,
    });
}

/** Turns `userId`'s MCP access on or off; off ends their connections. */
export async function setMcpAccess(db: Db, userId: string, enabled: boolean, by: string) {
  await db
    .updateTable("users")
    .set({ mcp_enabled: enabled ? 1 : 0 })
    .where("id", "=", userId)
    .execute();
  if (!enabled) await endConnections(db, userId, by);
}

/** Ends every live connection of `userId`'s: their MCP access or account was turned off. */
export async function endConnections(db: Db, userId: string, by: string | null) {
  const live = await db
    .selectFrom("agent_connections")
    .select("id")
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .execute();
  for (const { id } of live) await revokeConnection(db, id, by, null, "accessRemoved");
}

/** Revokes the connection a token (access or refresh) belongs to, as RFC 7009 asks; unknown tokens are ignored. */
export async function revokeToken(db: Db, token: string, clientId: string, ip: string) {
  const hash = hashToken(token);
  const row = await db
    .selectFrom("agent_connections")
    .select(["id", "user_id"])
    .where("client_id", "=", clientId)
    .where((eb) => eb.or([eb("access_hash", "=", hash), eb("refresh_hash", "=", hash)]))
    .executeTakeFirst();
  if (row) await revokeConnection(db, row.id, row.user_id, ip, "signedOut");
}

/** Forgets connections that ended a while ago, and clients nobody ever allowed. */
export async function purgeConnections(db: Db) {
  await db
    .deleteFrom("agent_connections")
    .where((eb) =>
      eb.or([eb("expires_at", "<", ago(KEPT_MS)), eb("revoked_at", "<", ago(KEPT_MS))]),
    )
    .execute();
  await db
    .deleteFrom("oauth_clients")
    .where("created_at", "<", ago(UNUSED_CLIENT_MS))
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("agent_connections")
            .select("agent_connections.id")
            .whereRef("agent_connections.client_id", "=", "oauth_clients.id"),
        ),
      ),
    )
    .execute();
}

/** Connections newest first, live and ended in the last 30 days: everyone's, or one person's. */
export async function listConnections(db: Db, userId?: string): Promise<AgentConnection[]> {
  let q = db
    .selectFrom("agent_connections")
    .innerJoin("users", "users.id", "agent_connections.user_id")
    .innerJoin("oauth_clients", "oauth_clients.id", "agent_connections.client_id")
    .leftJoin("users as revoker", "revoker.id", "agent_connections.revoked_by")
    .select([
      "agent_connections.id",
      "agent_connections.created_at",
      "agent_connections.last_used_at",
      "agent_connections.expires_at",
      "agent_connections.revoked_at",
      "agent_connections.ip",
      "agent_connections.user_agent",
      "users.id as user_id",
      "users.display_name",
      "users.role",
      "oauth_clients.name as client",
      "revoker.display_name as revoked_by",
    ])
    .orderBy("agent_connections.created_at", "desc");
  if (userId) q = q.where("agent_connections.user_id", "=", userId);
  const at = now();
  return (await q.execute()).map((row) => ({
    id: row.id,
    person: { id: row.user_id, displayName: row.display_name, role: row.role },
    client: row.client,
    status: grantStatus(row, at),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    ip: row.ip,
    userAgent: row.user_agent,
  }));
}

/** Whose connection `id` is, or undefined when there's none. */
export const connectionOwner = (db: Db, id: string) =>
  db
    .selectFrom("agent_connections")
    .innerJoin("users", "users.id", "agent_connections.user_id")
    .select(["users.id", "users.role"])
    .where("agent_connections.id", "=", id)
    .executeTakeFirst();
