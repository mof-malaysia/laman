/**
 * The builder as an OAuth 2.1 authorization server for agents (docs/mcp.md):
 * its metadata (RFC 8414, RFC 9728), client registration (RFC 7591), the
 * authorization request, which the consent screen answers, the token
 * endpoint and revocation (RFC 7009). Answers are OAuth's own shape,
 * `{ error, error_description }`, not the API's.
 */
import { ConsentRequest } from "@laman/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { Throttle } from "../auth/throttle.js";
import { HttpError } from "../errors.js";
import { ValidationError } from "../validation.js";
import {
  checkRequest,
  isOurResource,
  RegisterBody,
  registerClient,
  resourceOf,
} from "../agents/clients.js";
import { exchangeCode, OAuthError, refresh, revokeToken } from "../agents/connections.js";

const tags = ["agents"];

/**
 * This builder's address for agents: BUILDER_URL, or else as the client
 * reached it, behind the proxy if there is one (which needs TRUST_PROXY).
 */
export const originOf = (request: FastifyRequest) =>
  request.server.builderUrl ?? `${request.protocol}://${request.host}`;

const TokenBody = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(200),
    code_verifier: z.string().min(1).max(200),
    client_id: z.string().min(1).max(100),
    redirect_uri: z.string().min(1).max(2000),
    resource: z.string().max(2000).optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(200),
    client_id: z.string().min(1).max(100),
    resource: z.string().max(2000).optional(),
  }),
]);

const RevokeBody = z.object({
  token: z.string().min(1).max(200),
  client_id: z.string().min(1).max(100),
  token_type_hint: z.string().optional(),
});

/** RFC 9728: what /mcp is, and who signs agents in for it. */
const protectedResource = (request: FastifyRequest) => ({
  resource: resourceOf(originOf(request)),
  authorization_servers: [originOf(request)],
  bearer_methods_supported: ["header"],
  resource_name: "Laman",
});

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  /**
   * Registration is open to anyone: limited per address so nobody can fill
   * the table, generously, as a whole agency may sit behind one address.
   * Clients nobody allows are forgotten after a day (purgeConnections).
   */
  const registrations = new Throttle({ free: 100, maxMs: 60 * 60 * 1000 });
  /** Wrong codes and refresh tokens, per address. */
  const grants = new Throttle({ free: 10, maxMs: 15 * 60 * 1000 });

  // OAuth clients post forms (RFC 6749 § 4.1.3); JSON is taken too.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 16 * 1024 },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  app.setErrorHandler((error, request, reply) => {
    void reply.header("cache-control", "no-store");
    if (error instanceof OAuthError)
      return reply
        .status(error.status)
        .send({ error: error.code, error_description: error.message });
    if (error instanceof ValidationError)
      return reply.status(400).send({
        error: request.url.startsWith("/oauth/register")
          ? "invalid_client_metadata"
          : "invalid_request",
        error_description: error.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      });
    if (error instanceof HttpError)
      return reply.status(error.statusCode).send({
        error: error.statusCode === 429 ? "slow_down" : error.code,
        error_description: error.message,
      });
    request.log.error({ err: error }, "oauth request failed");
    return reply
      .status(500)
      .send({ error: "server_error", error_description: "Something went wrong. Try again." });
  });

  for (const url of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ])
    app.get(
      url,
      {
        schema: {
          summary: "Protected resource metadata",
          description: "RFC 9728: where agents sign in to use /mcp.",
          tags,
          hide: url.endsWith("/mcp"),
        },
      },
      async (request) => protectedResource(request),
    );

  app.get(
    "/.well-known/oauth-authorization-server",
    {
      schema: {
        summary: "Authorization server metadata",
        description: "RFC 8414: the endpoints agents use to register and sign in.",
        tags,
      },
    },
    async (request) => {
      const origin = originOf(request);
      return {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        revocation_endpoint: `${origin}/oauth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        revocation_endpoint_auth_methods_supported: ["none"],
        authorization_response_iss_parameter_supported: true,
      };
    },
  );

  app.post<{ Body: z.infer<typeof RegisterBody> }>(
    "/oauth/register",
    {
      schema: {
        summary: "Register an agent",
        description:
          "RFC 7591. Every client is public (no secret) and must use PKCE. Redirects are https, http to this machine, or an app's own scheme.",
        tags,
        body: RegisterBody,
      },
    },
    async (request, reply) => {
      registrations.attempt([request.ip]);
      const client = await registerClient(db, request.body, request);
      return reply.status(201).header("cache-control", "no-store").send(client);
    },
  );

  app.get<{ Querystring: ConsentRequest }>(
    "/oauth/authorize",
    {
      schema: {
        summary: "Start an authorization",
        description:
          "Checks the request, then sends the browser to the consent screen (/admin/connect) with it. A bad client or redirect address is shown, never redirected.",
        tags,
        querystring: ConsentRequest,
      },
    },
    async (request, reply) => {
      await checkRequest(db, request.query, originOf(request));
      const query = request.url.slice(request.url.indexOf("?"));
      return reply.redirect(`/admin/connect${query}`, 302);
    },
  );

  app.post<{ Body: z.infer<typeof TokenBody> }>(
    "/oauth/token",
    {
      // Before the body's schema, so a grant this server doesn't do says so (RFC 6749 § 5.2).
      preValidation: async (request) => {
        const grant = (request.body as { grant_type?: unknown } | undefined)?.grant_type;
        if (grant !== "authorization_code" && grant !== "refresh_token")
          throw new OAuthError(
            grant === undefined ? "invalid_request" : "unsupported_grant_type",
            grant === undefined
              ? "grant_type is required."
              : "Only authorization_code and refresh_token are supported.",
          );
      },
      schema: {
        summary: "Get tokens",
        description:
          "Trades an authorization code (with its PKCE verifier) or a refresh token for an access token (an hour) and a new refresh token. A refresh token works once.",
        tags,
        body: TokenBody,
      },
    },
    async (request, reply) => {
      const body = request.body;
      if (!isOurResource(body.resource, originOf(request)))
        throw new OAuthError("invalid_target", "Tokens are only for this builder's /mcp.");
      grants.check([request.ip]);
      try {
        const tokens =
          body.grant_type === "authorization_code"
            ? await exchangeCode(
                db,
                {
                  code: body.code,
                  verifier: body.code_verifier,
                  clientId: body.client_id,
                  redirectUri: body.redirect_uri,
                },
                request,
              )
            : await refresh(
                db,
                { refreshToken: body.refresh_token, clientId: body.client_id },
                request,
              );
        grants.succeed([request.ip]);
        return reply.header("cache-control", "no-store").header("pragma", "no-cache").send(tokens);
      } catch (error) {
        if (error instanceof OAuthError && error.code === "invalid_grant")
          grants.fail([request.ip]);
        throw error;
      }
    },
  );

  app.post<{ Body: z.infer<typeof RevokeBody> }>(
    "/oauth/revoke",
    {
      schema: {
        summary: "Revoke a token",
        description:
          "RFC 7009: ends the connection the token belongs to. Unknown tokens are ignored.",
        tags,
        body: RevokeBody,
      },
    },
    async (request, reply) => {
      await revokeToken(db, request.body.token, request.body.client_id, request.ip);
      return reply.status(200).send();
    },
  );
};
