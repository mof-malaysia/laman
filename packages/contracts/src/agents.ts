/**
 * Agents over MCP: an officer lets an AI client (Claude Desktop, Codex) act
 * for them. The client signs in with OAuth; the officer allows it on the
 * consent screen, which reads and answers these. See docs/mcp.md.
 */
import { z } from "zod";
import { Role } from "./auth.js";

/** Days an agent connection lasts before the officer connects again. */
export const CONNECTION_DAYS = 7;

/**
 * An OAuth authorization request, as the client put it in the address of
 * `/oauth/authorize`, which forwards it to the consent screen unchanged.
 */
export const ConsentRequest = z.object({
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(2000),
  response_type: z.string().max(20),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.string().max(10),
  state: z.string().max(1000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(2000).optional(),
});
export type ConsentRequest = z.infer<typeof ConsentRequest>;

/** What the consent screen shows: who's asking, and what they'd be able to do. */
export const ConsentInfo = z.object({
  client: z.object({
    name: z.string(),
    /** Where the answer goes: the host of the redirect address, or the app's scheme. */
    returnsTo: z.string(),
    /**
     * The answer goes to a website that isn't a known agent's. Anyone can
     * register a client with any name, so the screen warns before allowing.
     */
    unverified: z.boolean(),
  }),
  /** The officer has MCP access; without it they can only deny. */
  allowed: z.boolean(),
  /** The agent acts with it: its permissions are `permissionsOf(role)`. */
  role: Role,
});
export type ConsentInfo = z.infer<typeof ConsentInfo>;

/** Where a grant with an end date stands: an agent connection or an API token. */
export const GrantStatus = z.enum(["live", "expired", "revoked"]);
export type GrantStatus = z.infer<typeof GrantStatus>;

/** An agent connection, for the Agents screen and Account (docs/mcp.md § Admin). */
export const AgentConnection = z.object({
  id: z.uuid(),
  person: z.object({ id: z.uuid(), displayName: z.string(), role: Role }),
  /** As the agent named itself when it registered: "Claude", "Codex". */
  client: z.string(),
  /** live: its tokens work. expired: a week after consent. revoked: ended early. */
  status: GrantStatus,
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  /** Who ended it; null when the builder did (a reused refresh token, access turned off). */
  revokedBy: z.string().nullable(),
  /** Where the agent connected from, and its user agent. */
  ip: z.string(),
  userAgent: z.string(),
});
export type AgentConnection = z.infer<typeof AgentConnection>;

export const AgentConnectionsQuery = z.object({ userId: z.uuid().optional() });

export const ConsentBody = ConsentRequest.extend({ allow: z.boolean() });
export type ConsentBody = z.infer<typeof ConsentBody>;

/** Where to send the browser: the client's redirect address with the code, or the refusal. */
export const ConsentResult = z.object({ redirect: z.string() });
export type ConsentResult = z.infer<typeof ConsentResult>;
