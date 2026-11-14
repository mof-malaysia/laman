/** Connecting agents in tests: the OAuth dance as a client does it, and MCP calls with the token. */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Role } from "@fiscal-sb/contracts";
import { expect } from "@rstest/core";
import { loadEnv } from "../src/env.js";
import { type App, sessionCookie, testApp } from "./helpers.js";

/** A test app in a data folder of its own; `close` removes both. */
export async function agentApp(name: string, env: Record<string, string> = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), `laman-${name}-`));
  const app = await testApp({
    env: loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATA_DIR: dataDir,
      ADMIN_DIST: join(dataDir, "none"),
      ...env,
    }),
    databasePath: ":memory:",
    runJobs: false,
  });
  const close = async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  };
  return { app, close };
}

/** Where test agents call from. */
export const AGENT_IP = "10.20.30.40";

export type ToolResult = {
  isError?: boolean;
  content: { text: string }[];
  structuredContent?: Record<string, unknown>;
};

/** A PKCE pair, as a client makes it. */
export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** `app` is read when each helper runs, so they can be made before the app is built. */
export function agentHelpers(app: () => App) {
  const REDIRECT = "http://127.0.0.1:33418/callback";

  const register = async (redirect_uris = [REDIRECT]) =>
    app().inject({
      method: "POST",
      url: "/oauth/register",
      payload: { client_name: "Claude", redirect_uris, token_endpoint_auth_method: "none" },
    });

  /** An officer with `role`, signed in to the admin; MCP access as given. */
  async function officer(role: Role, mcp = true) {
    const { id, cookie } = await sessionCookie(app(), role);
    await app()
      .db.updateTable("users")
      .set({ mcp_enabled: mcp ? 1 : 0 })
      .where("id", "=", id)
      .execute();
    return { id, cookie };
  }

  /** Registers a client and runs the whole sign-in: consent as `cookie`, then the code for tokens. */
  async function connect(cookie: string) {
    const clientId = (await register()).json().client_id as string;
    const { verifier, challenge } = pkce();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
    });
    const consent = await app().inject({
      method: "POST",
      url: "/api/agents/consent",
      headers: { cookie },
      payload: { ...Object.fromEntries(params), allow: true },
    });
    expect(consent.statusCode).toBe(200);
    const back = new URL(consent.json().data.redirect);
    expect(back.searchParams.get("state")).toBe("xyz");
    const token = await app().inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: back.searchParams.get("code")!,
        code_verifier: verifier,
        client_id: clientId,
        redirect_uri: REDIRECT,
      }).toString(),
    });
    expect(token.statusCode).toBe(200);
    return { clientId, ...(token.json() as { access_token: string; refresh_token: string }) };
  }

  let nextId = 1;
  const mcp = (token: string, method: string, params?: object) =>
    app().inject({
      method: "POST",
      // An agent elsewhere on the network, so audits can be told from this process.
      remoteAddress: AGENT_IP,
      url: "/mcp",
      headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: nextId++, method, ...(params && { params }) },
    });
  const callTool = async (token: string, name: string, args: object = {}) =>
    (await mcp(token, "tools/call", { name, arguments: args })).json().result as ToolResult;

  /** A tool's result, failing the test when the tool refused. */
  const use = async (token: string, name: string, args: object = {}) => {
    const result = await callTool(token, name, args);
    if (result.isError) throw new Error(`${name} refused: ${result.content[0]!.text}`);
    return (result.structuredContent ?? JSON.parse(result.content[0]!.text)) as Record<string, any>;
  };
  /** A tool's refusal: its code. */
  const refusal = async (token: string, name: string, args: object = {}) => {
    const result = await callTool(token, name, args);
    expect(result.isError).toBe(true);
    return JSON.parse(result.content[0]!.text).code as string;
  };

  return { REDIRECT, register, pkce, officer, connect, mcp, callTool, use, refusal };
}
