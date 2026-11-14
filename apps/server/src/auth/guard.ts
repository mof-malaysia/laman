/**
 * Who may use each route. Every /api route declares `config.access`: "public",
 * "signedIn" or a permission; one that doesn't is refused, so a new route
 * can't be left open by forgetting. Routes take only a finished sign-in
 * unless `config.stages` names others (the sign-in steps themselves).
 * /render, /media, /docs and /openapi.json need a finished sign-in too; the
 * published site, /_v and /healthz don't.
 */
import { can, type Permission, type Role, type SessionStage } from "@laman/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db } from "../db/index.js";
import { HttpError } from "../errors.js";
import { actAs, actingScope } from "./acting.js";
import { audit, type AuditEvent } from "./audit.js";
import { type Session, sessionOf } from "./sessions.js";
import type { User } from "./users.js";
import { decodedPath, guardedPath } from "../paths.js";
import type { Connection } from "../agents/connections.js";
import { redeemTicket } from "../agents/tickets.js";
import {
  bearerOf,
  checkTokenScope,
  type TokenAuth,
  type TokenScope,
  tokenAuth,
} from "./api-tokens.js";

export type Access = "public" | "signedIn" | Permission;

declare module "fastify" {
  interface FastifyContextConfig {
    access?: Access;
    /** The sign-in stages this route takes; only "full" when left out. */
    stages?: SessionStage[];
    /** Where an API token may use this route to change something; closed to tokens when left out. */
    tokenScope?: TokenScope;
  }
  interface FastifyRequest {
    auth?: { user: User; session: Session };
    /** The agent connection a tool call came through (docs/mcp.md); unset for the admin. */
    agent?: Connection;
    /** The API token a program sent (docs/auth.md § API tokens); unset otherwise. */
    apiToken?: TokenAuth;
    /** What `audited` recorded: written to the audit log if the request succeeds. */
    auditEvent?: Omit<AuditEvent, "userId" | "ip">;
  }
}

/**
 * Whether a request is for the builder. Decided on the route that matched,
 * not the address as written, so no spelling of a path ("/%61pi/users",
 * "//api/users") reaches a builder handler without a sign-in; the decoded
 * path covers addresses no route has.
 */
const isGuarded = (request: FastifyRequest) =>
  guardedPath.test(request.routeOptions.url ?? "") || guardedPath.test(decodedPath(request.url));

const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Refuses a change requested from another site. Browsers send Sec-Fetch-Site
 * (or at least Origin) with every cross-site request; tools like curl send
 * neither, and carry no one's cookie by accident.
 */
function checkSameOrigin(request: FastifyRequest) {
  const site = request.headers["sec-fetch-site"];
  if (site) {
    if (site === "same-origin" || site === "none") return;
  } else {
    const origin = request.headers.origin;
    if (!origin) return;
    try {
      if (new URL(origin).host === request.headers.host) return;
    } catch {
      // Not a URL: refused below.
    }
  }
  throw new HttpError(
    403,
    "cross_site_request",
    "Changes can only be made from the builder itself.",
  );
}

/** Whether `role` passes `access`: the rule routes and agents' tools share. */
export const allows = (role: Role, access: Access) =>
  access === "public" || access === "signedIn" || can(role, access);

export const signedOut = () => new HttpError(401, "signed_out", "Sign in to continue.");

/** The signed-in person and their session, for handlers whose route requires one. */
export function authOf(request: FastifyRequest) {
  if (!request.auth) throw signedOut();
  return request.auth;
}

export const userOf = (request: FastifyRequest): User => authOf(request).user;

/** Records what this request did, by whom; it reaches the audit log only if the request succeeds. */
export function audited(request: FastifyRequest, event: Omit<AuditEvent, "userId" | "ip">) {
  request.auditEvent = event;
}

/** Routes that act on the browser session itself, which an agent's or a token's stand-in session isn't. */
const guardedSessionPath = /^\/api\/auth\//;

/**
 * A stand-in for a session, for a tool call (named for its agent connection)
 * or an API token: a finished sign-in. It never reaches the routes that act
 * on sessions (/api/auth/).
 */
const standIn = (user: User, id: string, createdAt: string, userAgent = "") => ({
  user,
  session: {
    id,
    token_hash: "",
    user_id: user.id,
    stage: "full",
    created_at: createdAt,
    last_seen_at: new Date().toISOString(),
    ip: "",
    user_agent: userAgent,
  } satisfies Session,
});

export function useGuard(app: FastifyInstance, db: Db) {
  // Caught at boot, so a route can't ship without saying who may use it.
  app.addHook("onRoute", (route) => {
    if (route.url.startsWith("/api/") && !route.config?.access)
      throw new Error(`${route.method} ${route.url} doesn't declare config.access`);
    // checkTokenScope reads the page from `:id`.
    const scope = route.config?.tokenScope;
    if ((scope === "page" || scope === "entries") && !route.url.includes("/:id"))
      throw new Error(`${route.method} ${route.url} has tokenScope "${scope}" but no :id`);
  });

  app.addHook("onRequest", (_request, _reply, done) => actingScope(done));

  app.addHook("onRequest", async (request) => {
    if (!isGuarded(request)) return;

    // A program's API token carries no cookie, so another site can't borrow it.
    const bearer = bearerOf(request);
    if (!bearer && unsafe.has(request.method)) checkSameOrigin(request);
    const ticket = bearer ? undefined : redeemTicket(request);
    // Signing in, passwords, two-factor and sessions belong to a browser's own session.
    if ((bearer || ticket) && guardedSessionPath.test(request.routeOptions.url ?? ""))
      throw new HttpError(
        403,
        "forbidden",
        "Agents and API tokens can't use sign-in and account routes.",
      );

    let auth;
    if (bearer) {
      const token = (request.apiToken = await tokenAuth(db, bearer));
      auth = standIn(token.user, `token:${token.id}`, token.createdAt);
    } else if (ticket) {
      const { user, connection } = ticket;
      request.agent = connection;
      auth = standIn(user, `agent:${connection.id}`, connection.createdAt, connection.clientName);
    } else auth = await sessionOf(db, request);
    if (auth) {
      request.auth = auth;
      actAs(
        auth.user.id,
        request.agent ? { name: request.agent.clientName, connection: request.agent.id } : null,
      );
    }

    const config = request.routeOptions.config;
    // An /api route of our own must say; anything else (the media library,
    // the docs, an /api address no route has) needs a finished sign-in.
    const apiRoute = request.routeOptions.url?.startsWith("/api/") ?? false;
    const access: Access | undefined = config.access ?? (apiRoute ? undefined : "signedIn");
    if (access === "public") return;
    if (access === undefined)
      throw new HttpError(403, "forbidden", "This route doesn't say who may use it.");
    if (!request.auth) throw signedOut();
    const stages = config.stages ?? ["full"];
    if (!stages.includes(request.auth.session.stage))
      throw new HttpError(401, "sign_in_incomplete", "Finish signing in to continue.", {
        stage: request.auth.session.stage,
      });
    if (!allows(request.auth.user.role, access))
      throw new HttpError(403, "forbidden", "This role can't do this.", { needs: access });
    // Before the body is read: a route closed to tokens says so, whatever was sent.
    if (request.apiToken && unsafe.has(request.method) && !config.tokenScope)
      throw new HttpError(403, "token_not_allowed", "API tokens can't make this change.");
  });

  // After validation, so the page id is the route's own; a route's preHandlers run after this.
  app.addHook("preHandler", async (request) => {
    if (!request.apiToken || !unsafe.has(request.method)) return;
    const params = request.params as { id?: unknown } | undefined;
    // Routes without a scope were refused in onRequest.
    await checkTokenScope(
      db,
      request.apiToken,
      request.routeOptions.config.tokenScope!,
      typeof params?.id === "string" ? params.id : undefined,
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    const event = request.auditEvent;
    if (!event || !request.auth || reply.statusCode >= 400) return;
    await audit(db, { ...event, userId: request.auth.user.id, ip: request.ip });
  });
}
