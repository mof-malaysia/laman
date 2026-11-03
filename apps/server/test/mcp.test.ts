import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { htmlToText } from "../src/agents/tools.js";
import { agentApp, agentHelpers } from "./agents.js";
import { type App, sessionCookie } from "./helpers.js";

let app: App;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ app, close } = await agentApp("mcp"));
});
afterAll(() => close());

const { REDIRECT, register, pkce, officer, connect, mcp, callTool } = agentHelpers(() => app);

describe("signing an agent in", () => {
  it("publishes the metadata clients discover the endpoints from", async () => {
    const resource = (await app.inject({ url: "/.well-known/oauth-protected-resource" })).json();
    expect(resource.resource).toBe("http://localhost:80/mcp");
    const server = (await app.inject({ url: "/.well-known/oauth-authorization-server" })).json();
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.token_endpoint).toBe("http://localhost:80/oauth/token");
  });

  it("asks a client without a token to sign in", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "ping" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("resource_metadata=");
  });

  it("refuses redirects a client could misuse", async () => {
    for (const uri of ["javascript:alert(1)", "http://evil.example/cb", "https://x.example/#frag"])
      expect((await register([uri])).statusCode).toBe(400);
    expect((await register(["cursor://anysphere/callback"])).statusCode).toBe(201);
  });

  it("never redirects to an address the client didn't register", async () => {
    const clientId = (await register()).json().client_id;
    const { challenge } = pkce();
    const res = await app.inject({
      url: `/oauth/authorize?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://evil.example/cb",
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      })}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("sends a good request to the consent screen", async () => {
    const clientId = (await register()).json().client_id;
    const { challenge } = pkce();
    // A loopback redirect may change its port.
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:50000/callback",
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const res = await app.inject({ url: `/oauth/authorize?${query}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/admin/connect?${query}`);
  });

  it("lets only officers with MCP access allow an agent", async () => {
    const { cookie } = await officer("editor", false);
    const clientId = (await register()).json().client_id;
    const query = {
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    };
    const info = await app.inject({
      url: `/api/agents/consent?${new URLSearchParams(query)}`,
      headers: { cookie },
    });
    expect(info.json().data).toMatchObject({
      allowed: false,
      client: { name: "Claude", returnsTo: "127.0.0.1:33418", unverified: false },
    });
    // Anyone can call their client "Claude": a website that isn't Claude's is flagged.
    const spoof = (await register(["https://claude-ai.example/cb"])).json().client_id;
    const flagged = await app.inject({
      url: `/api/agents/consent?${new URLSearchParams({ ...query, client_id: spoof, redirect_uri: "https://claude-ai.example/cb" })}`,
      headers: { cookie },
    });
    expect(flagged.json().data.client).toMatchObject({
      unverified: true,
      returnsTo: "claude-ai.example",
    });
    const allow = await app.inject({
      method: "POST",
      url: "/api/agents/consent",
      headers: { cookie },
      payload: { ...query, allow: true },
    });
    expect(allow.json().error.code).toBe("mcp_not_enabled");
    const deny = await app.inject({
      method: "POST",
      url: "/api/agents/consent",
      headers: { cookie },
      payload: { ...query, allow: false },
    });
    expect(new URL(deny.json().data.redirect).searchParams.get("error")).toBe("access_denied");
  });

  it("refuses a code with the wrong verifier, and a code used twice", async () => {
    const { cookie } = await officer("editor");
    const clientId = (await register()).json().client_id;
    const { verifier, challenge } = pkce();
    const query = {
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    const consent = await app.inject({
      method: "POST",
      url: "/api/agents/consent",
      headers: { cookie },
      payload: { ...query, allow: true },
    });
    const code = new URL(consent.json().data.redirect).searchParams.get("code")!;
    const trade = (code_verifier: string) =>
      app.inject({
        method: "POST",
        url: "/oauth/token",
        payload: {
          grant_type: "authorization_code",
          code,
          code_verifier,
          client_id: clientId,
          redirect_uri: REDIRECT,
        },
      });
    expect((await trade(pkce().verifier)).json().error).toBe("invalid_grant");
    // The failed try spent it.
    expect((await trade(verifier)).json().error).toBe("invalid_grant");
  });
});

describe("tokens", () => {
  it("rotates refresh tokens, and ends the connection when an old one comes back", async () => {
    const { id, cookie } = await officer("editor");
    const first = await connect(cookie);
    const refresh = (refresh_token: string) =>
      app.inject({
        method: "POST",
        url: "/oauth/token",
        payload: { grant_type: "refresh_token", refresh_token, client_id: first.clientId },
      });
    const second = (await refresh(first.refresh_token)).json();
    expect(second.access_token).toBeTruthy();
    expect((await mcp(second.access_token, "ping")).statusCode).toBe(200);
    // At once, the first again is the client's own parallel refresh: refused, still connected.
    expect((await refresh(first.refresh_token)).json().error).toBe("invalid_grant");
    expect((await mcp(second.access_token, "ping")).statusCode).toBe(200);
    // A minute later it's a copy, so the connection ends.
    await app.db
      .updateTable("agent_connections")
      .set({ last_used_at: new Date(Date.now() - 60_000).toISOString() })
      .where("user_id", "=", id)
      .execute();
    expect((await refresh(first.refresh_token)).json().error).toBe("invalid_grant");
    expect((await mcp(second.access_token, "ping")).statusCode).toBe(401);
    expect((await refresh(second.refresh_token)).json().error).toBe("invalid_grant");
  });

  it("ends an officer's connections when an Admin turns their MCP access off", async () => {
    const admin = await sessionCookie(app, "superAdmin");
    const editor = await officer("editor");
    const { access_token } = await connect(editor.cookie);
    expect((await mcp(access_token, "ping")).statusCode).toBe(200);
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/users/${editor.id}`,
      headers: { cookie: admin.cookie },
      payload: { mcpEnabled: false },
    });
    expect(patch.json().data.mcpEnabled).toBe(false);
    expect((await mcp(access_token, "ping")).statusCode).toBe(401);
    const revoked = await app.db
      .selectFrom("audit_log")
      .select("detail")
      .where("action", "=", "agentRevoked")
      .where("user_id", "=", admin.id)
      .execute();
    expect(revoked.length).toBeGreaterThan(0);
  });

  it("revokes a token on request", async () => {
    const { cookie } = await officer("editor");
    const { access_token, clientId } = await connect(cookie);
    await app.inject({
      method: "POST",
      url: "/oauth/revoke",
      payload: { token: access_token, client_id: clientId },
    });
    expect((await mcp(access_token, "ping")).statusCode).toBe(401);
  });

  it("refuses the sign-in and account routes to agents", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const { issueTicket } = await import("../src/agents/tickets.js");
    const { connectionOf } = await import("../src/agents/connections.js");
    const found = (await connectionOf(app.db, access_token))!;
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { "x-agent-ticket": issueTicket(found.user, found.connection) },
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses a grant it doesn't do, saying so", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: { grant_type: "client_credentials", client_id: "x" },
    });
    expect(res.json().error).toBe("unsupported_grant_type");
  });

  it("doesn't take a made-up ticket in place of a session", async () => {
    const res = await app.inject({ url: "/api/pages", headers: { "x-agent-ticket": "guess" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("managing connections", () => {
  it("lists connections for Admins, and each officer's own", async () => {
    const admin = await sessionCookie(app, "admin");
    const editor = await officer("editor");
    await connect(editor.cookie);
    const all = await app.inject({
      url: `/api/agents/connections?userId=${editor.id}`,
      headers: { cookie: admin.cookie },
    });
    expect(all.json().data).toEqual([
      expect.objectContaining({
        client: "Claude",
        status: "live",
        person: expect.objectContaining({ id: editor.id }),
      }),
    ]);
    const forbidden = await app.inject({
      url: "/api/agents/connections",
      headers: { cookie: editor.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
    const mine = await app.inject({ url: "/api/agents/mine", headers: { cookie: editor.cookie } });
    expect(mine.json().data).toHaveLength(1);
  });

  it("lets an officer end their own, and an Admin anyone's but the super admin's", async () => {
    const admin = await sessionCookie(app, "admin");
    const editor = await officer("editor");
    const other = await officer("editor");
    const { access_token } = await connect(editor.cookie);
    const [connection] = (
      await app.inject({ url: "/api/agents/mine", headers: { cookie: editor.cookie } })
    ).json().data;
    const end = (cookie: string) =>
      app.inject({
        method: "DELETE",
        url: `/api/agents/connections/${connection.id}`,
        headers: { cookie },
      });
    // Someone else's, without users.manage, doesn't exist for them.
    expect((await end(other.cookie)).statusCode).toBe(404);
    expect((await end(admin.cookie)).statusCode).toBe(204);
    expect((await mcp(access_token, "ping")).statusCode).toBe(401);
    const [ended] = (
      await app.inject({ url: "/api/agents/mine", headers: { cookie: editor.cookie } })
    ).json().data;
    expect(ended).toMatchObject({ status: "revoked", revokedBy: "admin" });

    const sa = await sessionCookie(app, "superAdmin");
    await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { cookie: sa.cookie },
      payload: { mcpEnabled: true },
    });
    await connect(sa.cookie);
    const [theirs] = (
      await app.inject({ url: "/api/agents/mine", headers: { cookie: sa.cookie } })
    ).json().data;
    const byAdmin = await app.inject({
      method: "DELETE",
      url: `/api/agents/connections/${theirs.id}`,
      headers: { cookie: admin.cookie },
    });
    expect(byAdmin.statusCode).toBe(404);
  });

  it("lets only the super admin set their own MCP access, and ends their agents when it goes off", async () => {
    const sa = await sessionCookie(app, "superAdmin");
    const on = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { cookie: sa.cookie },
      payload: { mcpEnabled: true },
    });
    expect(on.json().data.mcpEnabled).toBe(true);
    const { access_token } = await connect(sa.cookie);
    await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { cookie: sa.cookie },
      payload: { mcpEnabled: false },
    });
    expect((await mcp(access_token, "ping")).statusCode).toBe(401);
    const admin = await sessionCookie(app, "admin");
    const refused = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { cookie: admin.cookie },
      payload: { mcpEnabled: true },
    });
    expect(refused.statusCode).toBe(403);
  });

  it("ends all of someone's connections at once", async () => {
    const admin = await sessionCookie(app, "admin");
    const editor = await officer("editor");
    const first = await connect(editor.cookie);
    const second = await connect(editor.cookie);
    const res = await app.inject({
      method: "POST",
      url: `/api/users/${editor.id}/end-agents`,
      headers: { cookie: admin.cookie },
    });
    expect(res.statusCode).toBe(204);
    for (const { access_token } of [first, second])
      expect((await mcp(access_token, "ping")).statusCode).toBe(401);
    // They still have access, so they can connect again.
    const again = await connect(editor.cookie);
    expect((await mcp(again.access_token, "ping")).statusCode).toBe(200);
  });
});

describe("tools", () => {
  it("answers the handshake and lists the discovery tools", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const init = (
      await mcp(access_token, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      })
    ).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    const notified = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { authorization: `Bearer ${access_token}` },
      payload: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(notified.statusCode).toBe(202);
    const listed = (await mcp(access_token, "tools/list")).json().result.tools as {
      name: string;
      inputSchema: { type: string };
    }[];
    expect(listed.map((t) => t.name)).toContain("get_page");
    for (const t of listed) expect(t.inputSchema.type).toBe("object");
    expect((await mcp(access_token, "resources/list")).json().error.code).toBe(-32601);
  });

  it("reads pages through the API as the officer, and logs each call", async () => {
    const { id, cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const me = await callTool(access_token, "whoami");
    expect(me.structuredContent).toMatchObject({ role: "editor", permissions: ["content.edit"] });
    const pages = JSON.parse((await callTool(access_token, "list_pages")).content[0]!.text) as {
      id: string;
    }[];
    const home = pages[0]!.id;
    const page = await callTool(access_token, "get_page", { id: home });
    expect(page.structuredContent).toMatchObject({ id: home });
    const preview = await callTool(access_token, "preview_page", { id: home });
    expect(preview.content[0]!.text).not.toContain("<");
    const log = await app.db
      .selectFrom("audit_log")
      .select(["target", "detail"])
      .where("action", "=", "agentToolCall")
      .where("user_id", "=", id)
      .orderBy("id")
      .execute();
    expect(log.map((r) => JSON.parse(r.detail).tool)).toEqual([
      "whoami",
      "list_pages",
      "get_page",
      "preview_page",
    ]);
    expect(log[2]).toMatchObject({ target: home });
    expect(JSON.parse(log[2]!.detail)).toMatchObject({ outcome: "ok", agent: "Claude" });
  });

  it("returns the API's refusal and bad input as tool errors the agent can read", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const missing = await callTool(access_token, "get_page", {
      id: "00000000-0000-4000-8000-000000000000",
    });
    expect(missing.isError).toBe(true);
    expect(JSON.parse(missing.content[0]!.text).code).toBe("page_not_found");
    const bad = await callTool(access_token, "get_page", { id: "nope" });
    expect(bad).toMatchObject({ isError: true });
    expect(
      (await mcp(access_token, "tools/call", { name: "no_such_tool" })).json().error.code,
    ).toBe(-32602);
  });

  it("previews colours without saving them", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const preview = await callTool(access_token, "preview_theme", { colour: "#0B6B3A" });
    expect(preview.structuredContent).toMatchObject({ colour: "#0b6b3a", passes: true });
    const schema = await callTool(access_token, "get_block_schema", { type: "hero" });
    expect(schema.structuredContent).toMatchObject({ type: "hero", props: { type: "object" } });
  });

  it("works with the official MCP client", async () => {
    const { cookie } = await officer("contentManager");
    const { access_token } = await connect(cookie);
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${address}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${access_token}` } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(20);
    const result = await client.callTool({
      name: "list_block_types",
      arguments: { kind: "entry" },
    });
    expect(result.isError).toBeFalsy();
    await client.close();
  });
});

describe("htmlToText", () => {
  it("keeps what a reader sees", () => {
    expect(
      htmlToText(
        '<head><title>x</title></head><h1>Zakat</h1><p>Bayar &amp; semak</p><script>evil()</script><a href="/">Utama</a><a href="/b">Berita</a><img alt="Logo">',
      ),
    ).toBe("# Zakat\nBayar & semak\nUtama Berita [image: Logo]");
  });
});
