/**
 * OAuth clients: agents register themselves (RFC 7591) with the addresses an
 * authorization may send them back to, and every authorization request is
 * checked against that before anyone is asked to consent.
 */
import { randomUUID } from "node:crypto";
import type { ConsentRequest } from "@fiscal-sb/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { type Db, now } from "../db/index.js";
import { OAuthError } from "./connections.js";

/** Schemes an app may not claim for its redirect: they'd run or read something in the browser. */
const unsafeSchemes = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * An address an authorization may return to: https anywhere, http only to
 * this machine (RFC 8252 § 7.3), or an app's own scheme (`cursor://…`).
 */
export function redirectProblem(uri: string): string | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "isn't an address";
  }
  if (url.hash) return "has a fragment";
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:") return loopback.has(url.hostname) ? undefined : "isn't https";
  if (unsafeSchemes.has(url.protocol) || url.protocol === "ws:" || url.protocol === "wss:")
    return "uses a scheme that isn't allowed";
  return undefined;
}

export const RegisterBody = z.object({
  client_name: z.string().trim().max(100).optional(),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export async function registerClient(
  db: Db,
  body: z.infer<typeof RegisterBody>,
  request: FastifyRequest,
) {
  for (const uri of body.redirect_uris) {
    const problem = redirectProblem(uri);
    if (problem) throw new OAuthError("invalid_redirect_uri", `${uri} ${problem}.`);
  }
  const grants = body.grant_types ?? ["authorization_code"];
  if (!grants.includes("authorization_code"))
    throw new OAuthError("invalid_client_metadata", "Clients sign in with authorization_code.");
  const id = randomUUID();
  const at = now();
  // A public client whatever it asked for: there's no secret to keep on an officer's machine.
  const name = body.client_name || "An unnamed agent";
  await db
    .insertInto("oauth_clients")
    .values({
      id,
      name,
      redirect_uris: JSON.stringify(body.redirect_uris),
      created_at: at,
      ip: request.ip,
    })
    .execute();
  return {
    client_id: id,
    client_id_issued_at: Math.floor(Date.parse(at) / 1000),
    client_name: name,
    redirect_uris: body.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

/**
 * Whether `uri` is one the client registered. A loopback address may differ
 * in its port, which a desktop app picks as it starts (RFC 8252 § 7.3).
 */
function registered(uris: string[], uri: string) {
  if (uris.includes(uri)) return true;
  let asked: URL;
  try {
    asked = new URL(uri);
  } catch {
    return false;
  }
  if (asked.protocol !== "http:" || !loopback.has(asked.hostname)) return false;
  return uris.some((r) => {
    const known = new URL(r);
    return (
      known.protocol === "http:" &&
      known.hostname === asked.hostname &&
      known.pathname === asked.pathname &&
      known.search === asked.search
    );
  });
}

/** The resource an agent's tokens are for: this builder's MCP endpoint. */
export const resourceOf = (origin: string) => `${origin}/mcp`;

/** Whether a client's `resource` (RFC 8707) names this builder's /mcp; none asked is fine. */
export const isOurResource = (resource: string | undefined, origin: string) =>
  !resource || resource.replace(/\/$/, "") === resourceOf(origin);

export type CheckedRequest = {
  client: { id: string; name: string };
  redirectUri: string;
};

/**
 * An authorization request that can be answered. Until the client and its
 * redirect are known good, a problem is shown rather than redirected (RFC
 * 6749 § 4.1.2.1), so the builder can't be used to bounce anyone elsewhere.
 */
export async function checkRequest(
  db: Db,
  request: ConsentRequest,
  origin: string,
): Promise<CheckedRequest> {
  const client = await db
    .selectFrom("oauth_clients")
    .select(["id", "name", "redirect_uris"])
    .where("id", "=", request.client_id)
    .executeTakeFirst();
  if (!client)
    throw new OAuthError("invalid_client", "This agent isn't registered. Connect it again.");
  if (!registered(JSON.parse(client.redirect_uris) as string[], request.redirect_uri))
    throw new OAuthError(
      "invalid_request",
      "The agent asked to return to an address it didn't register.",
    );
  if (request.response_type !== "code")
    throw new OAuthError("unsupported_response_type", "Only response_type=code is supported.");
  if (request.code_challenge_method !== "S256")
    throw new OAuthError("invalid_request", "PKCE with S256 is required.");
  if (!isOurResource(request.resource, origin))
    throw new OAuthError("invalid_target", "The agent asked for another server's resource.");
  return { client: { id: client.id, name: client.name }, redirectUri: request.redirect_uri };
}

/** The client's redirect address with `params` added, as the answer to its request. */
export function answer(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

/** Websites known agents return their sign-in to (Claude's connectors). */
const knownAgentHosts = new Set(["claude.ai", "claude.com"]);

/**
 * Whether an answer sent to `redirectUri` could reach someone other than the
 * officer: an https site that isn't a known agent's. Loopback and app
 * schemes come back to the officer's own machine.
 */
export function unverifiedReturn(redirectUri: string) {
  const url = new URL(redirectUri);
  return url.protocol === "https:" && !knownAgentHosts.has(url.hostname);
}

/** What the consent screen says the answer goes to: a host, or an app's scheme. */
export function returnsTo(redirectUri: string) {
  const url = new URL(redirectUri);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.host
    : url.protocol.slice(0, -1);
}
