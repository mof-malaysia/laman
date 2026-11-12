/**
 * API tokens, for Admins (docs/auth.md § API tokens): list them, make one
 * (its secret is in the answer, once), and revoke one.
 */
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listApiTokens, makeApiToken, revokeApiToken } from "../auth/api-tokens.js";
import { userOf } from "../auth/guard.js";
import { ApiToken, ApiTokenCreated, CreateApiTokenBody, envelope } from "../contract.js";

const tags = ["api tokens"];
const TokenParams = z.object({ id: z.uuid() });

export const apiTokenRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get(
    "/tokens",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "List API tokens",
        description: "Every API token, newest first: live, expired and revoked. Never the secrets.",
        tags,
        response: { 200: envelope(z.array(ApiToken)) },
      },
    },
    async () => ({ data: await listApiTokens(db) }),
  );

  app.post<{ Body: CreateApiTokenBody }>(
    "/tokens",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Make an API token",
        description:
          "A token for a program, with its own name and role, that may change only its `areas`: entries under `listingIds`, all pages, media, or navigation and settings. It reads what its role can. The secret is in this answer and nowhere else: only its SHA-256 is kept. A program sends it as `Authorization: Bearer laman_…`.",
        tags,
        body: CreateApiTokenBody,
        response: { 201: envelope(ApiTokenCreated) },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send({ data: await makeApiToken(db, request.body, userOf(request), request.ip) }),
  );

  app.delete<{ Params: z.infer<typeof TokenParams> }>(
    "/tokens/:id",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "Revoke an API token",
        description:
          "It stops working at once. Its account stays, so history and the audit log keep its name.",
        tags,
        params: TokenParams,
        response: { 200: envelope(ApiToken) },
      },
    },
    async (request) => ({
      data: await revokeApiToken(db, request.params.id, userOf(request), request.ip),
    }),
  );
};
