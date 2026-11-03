import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBlock } from "@fiscal-sb/blocks";
import type { Role } from "@fiscal-sb/contracts";
import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { codeFor, stepAt } from "../src/auth/totp.js";
import { loadEnv } from "../src/env.js";
import { type App, SUPER_ADMIN, sessionCookie, testApp } from "./helpers.js";

let dataDir: string;
let app: App;

const env = (extra: Record<string, string> = {}) =>
  loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
    ...extra,
  });

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-auth-"));
  app = await testApp({ env: env(), databasePath: ":memory:", runJobs: false });
});
afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

type Call = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  payload?: object;
  cookie?: string;
  headers?: Record<string, string>;
};

/** A browser: keeps the cookie the server last set. */
function browser() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    async call({ method = "GET", url, payload, headers }: Omit<Call, "cookie">) {
      const response = await app.inject({
        method,
        url,
        ...(payload && { payload }),
        headers: { ...(cookie && { cookie }), ...headers },
      });
      const set = response.headers["set-cookie"];
      const value = (Array.isArray(set) ? set[0] : set)?.split(";")[0];
      if (value) cookie = value.endsWith("=") ? "" : value;
      return response;
    },
  };
}

const signIn = (b: ReturnType<typeof browser>, username: string, password: string) =>
  b.call({ method: "POST", url: "/api/auth/sign-in", payload: { username, password } });

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Makes a one-time link look as if it expired `days` ago. */
const expire = (id: string, days: number) =>
  app.db
    .updateTable("tokens")
    .set({ expires_at: daysAgo(days) })
    .where("id", "=", id)
    .execute();

const code = (secret: string, offset = 0) => codeFor(secret, stepAt(Date.now()) + offset);

/** A signed-in browser for someone with `role`. */
async function as(role: Role) {
  const b = browser();
  const session = await sessionCookie(app, role);
  b.cookie = session.cookie;
  return Object.assign(b, { id: session.id });
}

async function enrol(b: ReturnType<typeof browser>) {
  const setup = (await b.call({ method: "POST", url: "/api/auth/totp/setup" })).json().data;
  const done = await b.call({
    method: "POST",
    url: "/api/auth/totp/enrol",
    payload: { code: code(setup.secret) },
  });
  return { secret: setup.secret as string, response: done };
}

describe("signing in", () => {
  it("keeps the builder behind a sign-in, and the published site and health check open", async () => {
    const b = browser();
    expect((await b.call({ url: "/api/pages" })).json().error.code).toBe("signed_out");
    // Visitors only see published files: this one isn't.
    expect((await b.call({ url: "/media/anything.jpg" })).statusCode).toBe(404);
    expect((await b.call({ url: "/render/live" })).statusCode).toBe(401);
    expect((await b.call({ url: "/openapi.json" })).statusCode).toBe(401);
    expect((await b.call({ url: "/healthz" })).statusCode).toBe(200);
    expect((await b.call({ url: "/api/no-such-route" })).statusCode).toBe(401);
  });

  it("sends security headers on the builder and the published site", async () => {
    const b = browser();
    const builder = await b.call({ url: "/api/pages" });
    expect(builder.headers["x-content-type-options"]).toBe("nosniff");
    expect(builder.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    // Scripts only from the builder's own files: nothing inline, no eval.
    const policy = String(builder.headers["content-security-policy"]);
    expect(policy).toMatch(/script-src 'self'/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(builder.headers["x-frame-options"]).toBe("SAMEORIGIN");
    // The API reference runs an inline script of its own, so it keeps only the framing rules.
    const docs = await b.call({ url: "/openapi.json" });
    expect(docs.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(docs.headers["content-security-policy"]).not.toContain("script-src");
    expect(builder.headers["strict-transport-security"]).toBeUndefined();
    const site = await b.call({ url: "/healthz" });
    expect(site.headers["x-content-type-options"]).toBe("nosniff");
    expect(site.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(site.headers["x-frame-options"]).toBeUndefined();
  });

  it("keeps the builder behind a sign-in however its address is spelled", async () => {
    const b = browser();
    const home = (await (await as("admin")).call({ url: "/api/pages" })).json().data[0];
    for (const url of [
      "/%61pi/users",
      "/%61pi/audit",
      "/%61pi/pages",
      "/a%70i/pages",
      "//api/pages",
      `/%72ender/pages/${home.id}`,
      "/%6Dedia/anything.jpg",
      "/%6Fpenapi.json",
      "/%64ocs/",
    ])
      // Refused or not found, never served: 401, 403 or 404.
      expect([401, 403, 404], url).toContain((await b.call({ url })).statusCode);
    // A change by an encoded address is refused before any handler runs.
    const write = await b.call({
      method: "PUT",
      url: "/%61pi/security",
      payload: { requireTwoFactor: false },
    });
    expect(write.statusCode).toBe(401);
  });

  it("makes the seeded super admin choose a new password first", async () => {
    const b = browser();
    const first = await signIn(b, SUPER_ADMIN.username, SUPER_ADMIN.password);
    expect(first.json().data).toMatchObject({ role: "superAdmin", stage: "password" });
    expect((await b.call({ url: "/api/pages" })).json().error.code).toBe("sign_in_incomplete");
    const same = await b.call({
      method: "POST",
      url: "/api/auth/password",
      payload: { password: SUPER_ADMIN.password },
    });
    expect(same.json().error.code).toBe("same_password");
    const changed = await b.call({
      method: "POST",
      url: "/api/auth/password",
      payload: { password: "a brand new passphrase" },
    });
    expect(changed.json().data.stage).toBe("full");
    expect((await b.call({ url: "/api/pages" })).statusCode).toBe(200);
  });

  it("gives a wrong username and a wrong password the same answer", async () => {
    const b = browser();
    const unknown = await signIn(b, "nobody", "whatever whatever");
    const wrong = await signIn(b, SUPER_ADMIN.username, "whatever whatever");
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it("slows down guessing after 5 failures", async () => {
    const b = browser();
    for (let i = 0; i < 5; i++) await signIn(b, SUPER_ADMIN.username, "wrong guess number");
    const next = await signIn(b, SUPER_ADMIN.username, SUPER_ADMIN.password);
    expect(next.statusCode).toBe(429);
    expect(next.json().error.code).toBe("too_many_attempts");
  });

  it("counts guesses sent all at once, before the password check finishes", async () => {
    const tries = await Promise.all(
      Array.from({ length: 12 }, () => signIn(browser(), SUPER_ADMIN.username, "wrong guess")),
    );
    const codes = tries.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
  });

  it("doesn't let guesses from elsewhere keep an officer out for long", async () => {
    await app.close();
    app = await testApp({
      env: env({ TRUST_PROXY: "true" }),
      databasePath: ":memory:",
      runJobs: false,
    });
    // Wrong guesses for one username from many addresses: each address is
    // under its own limit, and the username's own limit is short.
    for (let i = 0; i < 25; i++)
      await browser().call({
        method: "POST",
        url: "/api/auth/sign-in",
        payload: { username: SUPER_ADMIN.username, password: "wrong guess" },
        headers: { "x-forwarded-for": `10.0.0.${i}` },
      });
    const blocked = await signIn(browser(), SUPER_ADMIN.username, SUPER_ADMIN.password);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("signs out", async () => {
    const b = await as("editor");
    expect((await b.call({ method: "POST", url: "/api/auth/sign-out" })).statusCode).toBe(204);
    expect(b.cookie).toBe("");
    expect((await b.call({ url: "/api/pages" })).statusCode).toBe(401);
  });

  it("refuses a change asked for by another site", async () => {
    const b = await as("editor");
    const payload = { language: "ms" };
    const cross = await b.call({
      method: "PUT",
      url: "/api/preferences",
      payload,
      headers: { origin: "https://evil.example" },
    });
    expect(cross.json().error.code).toBe("cross_site_request");
    const fetchCross = await b.call({
      method: "PUT",
      url: "/api/preferences",
      payload,
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(fetchCross.statusCode).toBe(403);
    const same = await b.call({
      method: "PUT",
      url: "/api/preferences",
      payload,
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(same.statusCode).toBe(200);
  });

  it("refuses to start without a super admin to seed", async () => {
    await expect(
      buildApp({ env: env(), databasePath: ":memory:", runJobs: false }),
    ).rejects.toThrow(/no super admin yet/);
  });
});

describe("two-factor", () => {
  it("asks for a code at sign-in once someone has set it up, and takes each code once", async () => {
    const editor = await as("editor");
    const { secret, response } = await enrol(editor);
    expect(response.json().data.codes).toHaveLength(10);
    const username = (await editor.call({ url: "/api/auth/me" })).json().data.username;

    const b = browser();
    expect((await signIn(b, username, SUPER_ADMIN.password)).json().data.stage).toBe("totp");
    expect((await b.call({ url: "/api/pages" })).statusCode).toBe(401);
    const wrong = await b.call({
      method: "POST",
      url: "/api/auth/totp",
      payload: { code: "000000" },
    });
    expect(wrong.json().error.code).toBe("wrong_code");
    // The code that confirmed enrolment can't be used again.
    expect(
      (await b.call({ method: "POST", url: "/api/auth/totp", payload: { code: code(secret) } }))
        .statusCode,
    ).toBe(400);
    const ok = await b.call({
      method: "POST",
      url: "/api/auth/totp",
      payload: { code: code(secret, 1) },
    });
    expect(ok.json().data.stage).toBe("full");
  });

  it("takes a recovery code once", async () => {
    const editor = await as("editor");
    const codes: string[] = (await enrol(editor)).response.json().data.codes;
    const username = (await editor.call({ url: "/api/auth/me" })).json().data.username;
    const first = browser();
    await signIn(first, username, SUPER_ADMIN.password);
    expect(
      (
        await first.call({
          method: "POST",
          url: "/api/auth/totp",
          payload: { code: codes[0]!.toLowerCase() },
        })
      ).statusCode,
    ).toBe(200);
    const second = browser();
    await signIn(second, username, SUPER_ADMIN.password);
    expect(
      (await second.call({ method: "POST", url: "/api/auth/totp", payload: { code: codes[0]! } }))
        .statusCode,
    ).toBe(400);
  });

  it("can only be required by the super admin, after setting up their own", async () => {
    const admin = await as("admin");
    expect(
      (
        await admin.call({
          method: "PUT",
          url: "/api/security",
          payload: { requireTwoFactor: true },
        })
      ).statusCode,
    ).toBe(403);
    const root = await as("superAdmin");
    const early = await root.call({
      method: "PUT",
      url: "/api/security",
      payload: { requireTwoFactor: true },
    });
    expect(early.json().error.code).toBe("two_factor_not_enrolled");
    await enrol(root);
    expect(
      (
        await root.call({
          method: "PUT",
          url: "/api/security",
          payload: { requireTwoFactor: true },
        })
      ).statusCode,
    ).toBe(200);
    // Someone already signed in without it must set it up before anything else.
    expect((await admin.call({ url: "/api/pages" })).json().error.details.stage).toBe("enrol");
    expect((await admin.call({ url: "/api/auth/me" })).json().data.stage).toBe("enrol");
    const { response } = await enrol(admin);
    expect(response.json().data.me.stage).toBe("full");
    expect((await admin.call({ url: "/api/pages" })).statusCode).toBe(200);
  });
});

describe("invites and resets", () => {
  it("makes an account with the invite's role, from a link that works once", async () => {
    const admin = await as("admin");
    const link = (
      await admin.call({
        method: "POST",
        url: "/api/users/invites",
        payload: { role: "editor", note: "Aminah" },
      })
    ).json().data;
    expect(link.path).toMatch(/^\/admin\/join#/);
    const token = link.path.split("#")[1];
    expect((await admin.call({ url: "/api/users/invites" })).json().data[0]).toMatchObject({
      role: "editor",
      note: "Aminah",
    });

    const b = browser();
    expect(
      (await b.call({ method: "POST", url: "/api/auth/link", payload: { token } })).json().data,
    ).toMatchObject({ kind: "invite", role: "editor" });
    const joined = await b.call({
      method: "POST",
      url: "/api/auth/join",
      payload: {
        token,
        username: "Aminah.Ali",
        displayName: "Aminah Ali",
        password: "nasi lemak sedap sekali",
      },
    });
    expect(joined.json().data).toMatchObject({
      username: "aminah.ali",
      role: "editor",
      stage: "full",
    });
    expect((await b.call({ url: "/api/pages" })).statusCode).toBe(200);

    const again = await browser().call({
      method: "POST",
      url: "/api/auth/join",
      payload: {
        token,
        username: "someone",
        displayName: "Someone",
        password: "nasi lemak sedap sekali",
      },
    });
    expect(again.json().error.code).toBe("link_expired");
  });

  it("refuses weak passwords and taken usernames", async () => {
    const admin = await as("admin");
    const token = (
      await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } })
    )
      .json()
      .data.path.split("#")[1];
    const tryJoin = (username: string, password: string) =>
      browser().call({
        method: "POST",
        url: "/api/auth/join",
        payload: { token, username, displayName: "X", password },
      });
    expect((await tryJoin("someone", "password1234")).json().error.code).toBe("weak_password");
    expect((await tryJoin(SUPER_ADMIN.username, "nasi lemak sedap sekali")).json().error.code).toBe(
      "username_taken",
    );
  });

  it("resets a password, signing the person out everywhere", async () => {
    const admin = await as("admin");
    const editor = await as("editor");
    const link = (
      await admin.call({ method: "POST", url: `/api/users/${editor.id}/reset-link` })
    ).json().data;
    const token = link.path.split("#")[1];
    const reset = await browser().call({
      method: "POST",
      url: "/api/auth/reset",
      payload: { token, password: "roti canai panas" },
    });
    expect(reset.statusCode).toBe(204);
    expect((await editor.call({ url: "/api/pages" })).statusCode).toBe(401);
    const username = (await admin.call({ url: "/api/users" }))
      .json()
      .data.find((u: { id: string }) => u.id === editor.id).username;
    expect((await signIn(browser(), username, "roti canai panas")).json().data.stage).toBe("full");
  });

  it("lets only one of two requests sent at once use a link", async () => {
    const admin = await as("admin");
    const link = (
      await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } })
    ).json().data;
    const token = link.path.split("#")[1];
    const joinAs = (username: string) =>
      browser().call({
        method: "POST",
        url: "/api/auth/join",
        payload: { token, username, displayName: username, password: "roti canai panas" },
      });
    const results = await Promise.all([joinAs("satu"), joinAs("dua")]);
    expect(results.map((r) => r.statusCode).toSorted()).toEqual([200, 410]);
  });
});

describe("roles", () => {
  const draft = { ms: { title: "Utama", blocks: [] } };

  it("lets Editors save drafts but not publish", async () => {
    const editor = await as("editor");
    const home = (await editor.call({ url: "/api/pages" })).json().data[0];
    expect(
      (await editor.call({ method: "PUT", url: `/api/pages/${home.id}/draft`, payload: { draft } }))
        .statusCode,
    ).toBe(200);
    const publish = await editor.call({ method: "POST", url: `/api/pages/${home.id}/publish` });
    expect(publish.statusCode).toBe(403);
    expect(publish.json().error.details.needs).toBe("content.publish");
    expect((await editor.call({ url: "/api/users" })).statusCode).toBe(403);
  });

  it("lets Content Managers publish, and keeps undo and people for Admins", async () => {
    const manager = await as("contentManager");
    const home = (await manager.call({ url: "/api/pages" })).json().data[0];
    expect(
      (await manager.call({ method: "POST", url: `/api/pages/${home.id}/publish` })).statusCode,
    ).toBe(202);
    expect((await manager.call({ method: "POST", url: "/api/publish/rebuild" })).statusCode).toBe(
      403,
    );
    expect((await manager.call({ url: "/api/audit" })).statusCode).toBe(403);
    const admin = await as("admin");
    expect((await admin.call({ url: "/api/audit" })).statusCode).toBe(200);
  });

  it("keeps the super admin and your own account out of the Users screen's reach", async () => {
    const admin = await as("admin");
    const people = (await admin.call({ url: "/api/users" })).json().data;
    const root = people.find((u: { role: string }) => u.role === "superAdmin");
    expect(
      (
        await admin.call({
          method: "PATCH",
          url: `/api/users/${root.id}`,
          payload: { disabled: true },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await admin.call({
          method: "PATCH",
          url: `/api/users/${admin.id}`,
          payload: { role: "editor" },
        })
      ).json().error.code,
    ).toBe("own_account");
    const assign = await admin.call({
      method: "PATCH",
      url: `/api/users/${admin.id}`,
      payload: { role: "superAdmin" },
    });
    expect(assign.statusCode).toBe(400);
  });

  it("signs someone out when they're disabled or change role", async () => {
    const admin = await as("admin");
    const editor = await as("editor");
    await admin.call({
      method: "PATCH",
      url: `/api/users/${editor.id}`,
      payload: { role: "contentManager" },
    });
    expect((await editor.call({ url: "/api/pages" })).statusCode).toBe(401);
    const other = await as("editor");
    await admin.call({
      method: "PATCH",
      url: `/api/users/${other.id}`,
      payload: { disabled: true },
    });
    expect((await other.call({ url: "/api/pages" })).statusCode).toBe(401);
  });

  it("lets Editors move and delete pages that aren't on the site yet, and only those", async () => {
    const editor = await as("editor");
    const manager = await as("contentManager");
    const make = async (slug: string) =>
      (
        await editor.call({ method: "POST", url: "/api/pages", payload: { title: slug, slug } })
      ).json().data;
    const unpublished = await make("draf");
    const move = (id: string, slug: string) =>
      editor.call({ method: "POST", url: `/api/pages/${id}/move`, payload: { slug } });
    expect((await move(unpublished.id, "draf-baharu")).statusCode).toBe(200);
    expect(
      (await editor.call({ method: "DELETE", url: `/api/pages/${unpublished.id}` })).statusCode,
    ).toBe(204);
    expect(
      (await editor.call({ method: "POST", url: `/api/trash/${unpublished.id}/restore` }))
        .statusCode,
    ).toBe(200);
    const live = await make("hidup");
    await manager.call({ method: "POST", url: `/api/pages/${live.id}/publish` });
    expect((await move(live.id, "hidup-baharu")).json().error.details.needs).toBe(
      "content.publish",
    );
    expect((await editor.call({ method: "DELETE", url: `/api/pages/${live.id}` })).statusCode).toBe(
      403,
    );
    expect(
      (
        await manager.call({
          method: "POST",
          url: `/api/pages/${live.id}/move`,
          payload: { slug: "hidup-baharu" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("says who saved each revision, and keeps two people's saves apart", async () => {
    const editor = await as("editor");
    const manager = await as("contentManager");
    const home = (await editor.call({ url: "/api/pages" })).json().data[0];
    const save = (b: typeof editor, title: string) =>
      b.call({
        method: "PUT",
        url: `/api/pages/${home.id}/draft`,
        // With its h1, so it can be published.
        payload: { draft: { ms: { title, blocks: [newBlock("pageIntro")] } } },
      });
    await save(editor, "Satu");
    await save(editor, "Dua");
    await save(manager, "Tiga");
    const revisions = (await editor.call({ url: `/api/pages/${home.id}/revisions` })).json().data;
    expect(revisions.slice(0, 2).map((r: { by: string }) => r.by)).toEqual([
      "contentManager",
      "editor",
    ]);
    const page = (await editor.call({ url: "/api/pages" })).json().data[0];
    expect(page.editedBy).toBe("contentManager");
    await manager.call({ method: "POST", url: `/api/pages/${home.id}/publish` });
    const audit = (await (await as("admin")).call({ url: "/api/audit?action=published" })).json()
      .data;
    expect(audit[0]).toMatchObject({ user: { displayName: "contentManager" }, target: home.id });
  });

  it("records sign-ins and account changes in the audit log", async () => {
    const admin = await as("admin");
    await signIn(browser(), SUPER_ADMIN.username, "not the password");
    await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } });
    const actions = (await admin.call({ url: "/api/audit" }))
      .json()
      .data.map((e: { action: string }) => e.action);
    expect(actions).toContain("signInFailed");
    expect(actions).toContain("inviteMade");
  });

  it("names what each entry was about, and keeps what changed", async () => {
    const admin = await as("admin");
    const editor = await as("editor");
    const home = (await admin.call({ url: "/api/pages" })).json().data[0];
    await admin.call({ method: "POST", url: `/api/pages/${home.id}/publish` });
    await admin.call({
      method: "PATCH",
      url: `/api/users/${editor.id}`,
      payload: { role: "admin" },
    });
    const invite = await admin.call({
      method: "POST",
      url: "/api/users/invites",
      payload: { role: "editor", note: "Encik Rahman" },
    });
    expect(invite.statusCode).toBe(200);
    const [made] = (await admin.call({ url: "/api/users/invites" })).json().data;
    await admin.call({ method: "DELETE", url: `/api/users/invites/${made.id}` });

    const log = (await admin.call({ url: "/api/audit" })).json().data as {
      action: string;
      target: string | null;
      detail: Record<string, unknown>;
      names: Record<string, string>;
    }[];
    const entry = (action: string) => log.find((e) => e.action === action)!;
    expect(entry("published").names).toEqual({ [home.id]: home.title });
    expect(entry("userChanged")).toMatchObject({
      detail: { role: "admin", roleBefore: "editor" },
      names: { [editor.id]: "editor" },
    });
    expect(entry("inviteRevoked").detail).toEqual({ role: "editor", note: "Encik Rahman" });
  });

  it("filters the log by day", async () => {
    const admin = await as("admin");
    await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } });
    const today = new Date().toISOString().slice(0, 10);
    const count = async (query: string) =>
      (await admin.call({ url: `/api/audit?${query}` })).json().data.length as number;
    expect(await count(`from=${today}&to=${today}`)).toBeGreaterThan(0);
    expect(await count("to=2000-01-01")).toBe(0);
    expect(await count("from=2999-01-01")).toBe(0);
  });

  it("keeps invites that expired this week on the list, to make again or remove", async () => {
    const admin = await as("admin");
    await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } });
    await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } });
    const [recent, old] = (await admin.call({ url: "/api/users/invites" })).json().data;
    await Promise.all([expire(recent.id, 1), expire(old.id, 8)]);
    const listed = (await admin.call({ url: "/api/users/invites" })).json().data;
    expect(listed.map((i: { id: string }) => i.id)).toEqual([recent.id]);
    expect(
      (await admin.call({ method: "DELETE", url: `/api/users/invites/${recent.id}` })).statusCode,
    ).toBe(204);
    expect((await admin.call({ url: "/api/users/invites" })).json().data).toEqual([]);
    // Taking a dead link off the list isn't revoking it.
    const revoked = (await admin.call({ url: "/api/audit?action=inviteRevoked" })).json().data;
    expect(revoked).toEqual([]);
  });

  it("gives a download more than a page at once", async () => {
    const admin = await as("admin");
    for (let i = 0; i < 3; i++)
      await admin.call({ method: "POST", url: "/api/users/invites", payload: { role: "editor" } });
    const page = (query: string) =>
      admin.call({ url: `/api/audit?${query}` }).then((r) => r.json().data.length as number);
    expect(await page("limit=2")).toBe(2);
    expect(await page("limit=1000")).toBeGreaterThanOrEqual(3);
    expect((await admin.call({ url: "/api/audit?limit=1001" })).statusCode).toBe(400);
  });
});
