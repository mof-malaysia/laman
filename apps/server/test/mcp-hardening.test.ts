import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { CallLimit } from "../src/agents/limits.js";
import { agentApp, agentHelpers, type ToolResult } from "./agents.js";
import { type App, sessionCookie } from "./helpers.js";

let app: App;
let close: () => Promise<void>;

const { officer, connect, callTool, mcp } = agentHelpers(() => app);

beforeAll(async () => {
  ({ app, close } = await agentApp("mcp-hardening"));
});
afterAll(() => close());

const toolNames = async (token: string) =>
  ((await mcp(token, "tools/list")).json().result.tools as { name: string }[]).map((t) => t.name);
const code = (result: ToolResult) => JSON.parse(result.content[0]!.text).code as string;
const refresh = (refresh_token: string, client_id: string) =>
  app.inject({
    method: "POST",
    url: "/oauth/token",
    payload: { grant_type: "refresh_token", refresh_token, client_id },
  });

describe("the call limit", () => {
  it("allows a burst, then one call a second", () => {
    const limit = new CallLimit({ burst: 3, perSecond: 1 });
    for (let i = 0; i < 3; i++) expect(limit.take("a", 0).ok).toBe(true);
    expect(limit.take("a", 0)).toEqual({ ok: false, retryAfterSeconds: 1 });
    // Another connection has its own.
    expect(limit.take("b", 0).ok).toBe(true);
    expect(limit.take("a", 1000).ok).toBe(true);
    expect(limit.take("a", 1000).ok).toBe(false);
  });

  it("tells a busy agent to wait, without logging every refusal", async () => {
    const { id, cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    let result = await callTool(access_token, "whoami");
    for (let i = 0; i < 70 && !result.isError; i++) result = await callTool(access_token, "whoami");
    expect(code(result)).toBe("rate_limited");
    // Protocol messages aren't tool calls.
    expect((await mcp(access_token, "ping")).statusCode).toBe(200);
    const logged = await app.db
      .selectFrom("audit_log")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("action", "=", "agentToolCall")
      .where("user_id", "=", id)
      .executeTakeFirstOrThrow();
    expect(Number(logged.n)).toBe(60);
  });
});

describe("requests without a token", () => {
  it("are refused before their body is read", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: "x".repeat(20 * 1024 * 1024),
    });
    // Not 413 for its size, nor 400 for not being JSON: it never got that far.
    expect(res.statusCode).toBe(401);
  });
});

describe("expiry", () => {
  it("refuses an hour-old access token, and its refresh token gets a new one", async () => {
    const { id, cookie } = await officer("editor");
    const tokens = await connect(cookie);
    await app.db
      .updateTable("agent_connections")
      .set({ access_expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("user_id", "=", id)
      .execute();
    expect((await mcp(tokens.access_token, "ping")).statusCode).toBe(401);
    const renewed = (await refresh(tokens.refresh_token, tokens.clientId)).json();
    expect((await mcp(renewed.access_token, "ping")).statusCode).toBe(200);
  });

  it("ends a connection a week after consent, refresh token and all", async () => {
    const { id, cookie } = await officer("editor");
    const tokens = await connect(cookie);
    await app.db
      .updateTable("agent_connections")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("user_id", "=", id)
      .execute();
    expect((await mcp(tokens.access_token, "ping")).statusCode).toBe(401);
    expect((await refresh(tokens.refresh_token, tokens.clientId)).json().error).toBe(
      "invalid_grant",
    );
  });
});

describe("the officer changing while an agent is connected", () => {
  it("follows a new role at the next call", async () => {
    const admin = await sessionCookie(app, "admin");
    const manager = await officer("contentManager");
    const { access_token } = await connect(manager.cookie);
    expect(await toolNames(access_token)).toContain("publish_page");
    await app.inject({
      method: "PATCH",
      url: `/api/users/${manager.id}`,
      headers: { cookie: admin.cookie },
      payload: { role: "editor" },
    });
    // Still connected, as an Editor now.
    expect(await toolNames(access_token)).not.toContain("publish_page");
    const call = await mcp(access_token, "tools/call", { name: "publish_page", arguments: {} });
    expect(call.json().error.code).toBe(-32602);
    expect((await callTool(access_token, "whoami")).structuredContent).toMatchObject({
      role: "editor",
    });
  });

  it("cuts off a disabled account", async () => {
    const admin = await sessionCookie(app, "admin");
    const editor = await officer("editor");
    const { access_token, refresh_token, clientId } = await connect(editor.cookie);
    await app.inject({
      method: "PATCH",
      url: `/api/users/${editor.id}`,
      headers: { cookie: admin.cookie },
      payload: { disabled: true },
    });
    expect((await mcp(access_token, "ping")).statusCode).toBe(401);
    expect((await refresh(refresh_token, clientId)).json().error).toBe("invalid_grant");
  });
});

describe("limits on what an agent writes", () => {
  it("refuses a ninth navbar item and a fifth footer column with the schema's reason", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const link = { label: "Pautan", target: { kind: "url", url: "https://agensi.gov.my" } };
    let result = await callTool(access_token, "add_navbar_link", link);
    for (let i = 0; i < 10 && !result.isError; i++)
      result = await callTool(access_token, "add_navbar_link", link);
    expect(code(result)).toBe("validation_error");
    const navbar = (await callTool(access_token, "get_navigation")).structuredContent as {
      draft: { navbar: unknown[] };
    };
    expect(navbar.draft.navbar).toHaveLength(8);

    result = await callTool(access_token, "add_footer_column", { heading: "Lajur" });
    for (let i = 0; i < 6 && !result.isError; i++)
      result = await callTool(access_token, "add_footer_column", { heading: "Lajur" });
    expect(code(result)).toBe("validation_error");
  });

  it("checks a tool's own input before reaching the API", async () => {
    const { cookie } = await officer("editor");
    const { access_token } = await connect(cookie);
    const tooMany = Array.from({ length: 11 }, (_, i) => `kata${i}`);
    const result = await callTool(access_token, "add_search_pin", {
      terms: tooMany,
      pageId: "00000000-0000-4000-8000-000000000000",
    });
    expect(code(result)).toBe("invalid_input");
  });
});
