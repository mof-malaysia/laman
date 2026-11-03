/**
 * Agents (docs/mcp.md): the consent screen's request and answer, which is a
 * redirect back to the agent with a one-time code when the officer allowed
 * it; and the connections Admins see and end on the Agents screen, and your
 * own, on Account. Your own MCP access, for the super admin, is PATCH /auth/me.
 */
import {
  ConsentBody,
  ConsentInfo,
  ConsentRequest,
  ConsentResult,
  AgentConnection,
  AgentConnectionsQuery,
  envelope,
} from "../contract.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { userOf } from "../auth/guard.js";
import { HttpError } from "../errors.js";
import { answer, checkRequest, returnsTo, unverifiedReturn } from "../agents/clients.js";
import {
  connectionOwner,
  listConnections,
  makeCode,
  OAuthError,
  revokeConnection,
} from "../agents/connections.js";
import { managesAccount } from "../auth/users.js";
import { originOf } from "./oauth.js";

const tags = ["agents"];

export const agentRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  /** The request, checked, or a refusal to show on the consent screen. */
  async function checked(query: ConsentRequest, origin: string) {
    try {
      return await checkRequest(db, query, origin);
    } catch (error) {
      if (error instanceof OAuthError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  }

  app.get<{ Querystring: ConsentRequest }>(
    "/agents/consent",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Read an agent's authorization request",
        description:
          "For the consent screen: the agent's name, where the answer goes, and what it would be able to do (the officer's own permissions). 400 when the request can't be answered.",
        tags,
        querystring: ConsentRequest,
        response: { 200: envelope(ConsentInfo) },
      },
    },
    async (request) => {
      const user = userOf(request);
      const { client, redirectUri } = await checked(request.query, originOf(request));
      return {
        data: {
          client: {
            name: client.name,
            returnsTo: returnsTo(redirectUri),
            unverified: unverifiedReturn(redirectUri),
          },
          allowed: Boolean(user.mcp_enabled),
          role: user.role,
        },
      };
    },
  );

  app.post<{ Body: ConsentBody }>(
    "/agents/consent",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Answer an agent's authorization request",
        description:
          "Allowing it (with MCP access) returns the agent's redirect address with a one-time code, good for 10 minutes; denying returns it with error=access_denied.",
        tags,
        body: ConsentBody,
        response: { 200: envelope(ConsentResult) },
      },
    },
    async (request) => {
      const user = userOf(request);
      const { allow, ...query } = request.body;
      const origin = originOf(request);
      const { client, redirectUri } = await checked(query, origin);
      if (allow && !user.mcp_enabled)
        throw new HttpError(403, "mcp_not_enabled", "Ask an Admin to turn on MCP access for you.");
      const params = allow
        ? {
            code: makeCode({
              clientId: client.id,
              userId: user.id,
              redirectUri,
              challenge: query.code_challenge,
            }),
          }
        : { error: "access_denied", error_description: "The officer didn't allow it." };
      return {
        data: { redirect: answer(redirectUri, { ...params, state: query.state, iss: origin }) },
      };
    },
  );

  app.get<{ Querystring: z.infer<typeof AgentConnectionsQuery> }>(
    "/agents/connections",
    {
      config: { access: "users.manage" },
      schema: {
        summary: "List agent connections",
        description:
          "Everyone's agent connections, newest first: live ones, and those that ended in the last 30 days. `userId` narrows it to one person.",
        tags,
        querystring: AgentConnectionsQuery,
        response: { 200: envelope(z.array(AgentConnection)) },
      },
    },
    async (request) => ({ data: await listConnections(db, request.query.userId) }),
  );

  app.get(
    "/agents/mine",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "List your agent connections",
        description: "The agents you've connected, newest first, for Account.",
        tags,
        response: { 200: envelope(z.array(AgentConnection)) },
      },
    },
    async (request) => ({ data: await listConnections(db, userOf(request).id) }),
  );

  app.delete<{ Params: { id: string } }>(
    "/agents/connections/:id",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "End an agent connection",
        description:
          "Its tokens stop working at the agent's next call. Your own, or anyone's with users.manage, except that only the super admin ends the super admin's.",
        tags,
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const asker = userOf(request);
      const owner = await connectionOwner(db, request.params.id);
      if (!owner || (owner.id !== asker.id && !managesAccount(asker, owner)))
        throw new HttpError(404, "connection_not_found", "No connection with that id.");
      await revokeConnection(db, request.params.id, asker.id, request.ip);
      return reply.status(204).send();
    },
  );
};
