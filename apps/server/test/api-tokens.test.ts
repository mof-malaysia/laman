import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { agentApp } from "./agents.js";
import { type App, sessionCookie } from "./helpers.js";

let app: App;
let close: () => Promise<void>;
let admin: string;

beforeAll(async () => {
  ({ app, close } = await agentApp("tokens"));
  admin = (await sessionCookie(app, "admin")).cookie;
});
afterAll(() => close());

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const asAdmin = (method: Method, url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie: admin }, ...(payload ? { payload } : {}) });
const asToken = (secret: string, method: Method, url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${secret}` },
    ...(payload ? { payload } : {}),
  });

let staf: string;
let berita: string;
let secret: string;
let tokenId: string;

describe("API tokens", () => {
  beforeAll(async () => {
    staf = (
      await asAdmin("POST", "/api/pages", { title: "Staf", slug: "staf", template: "berita" })
    ).json().data.id;
    berita = (
      await asAdmin("POST", "/api/pages", { title: "Berita", slug: "berita", template: "berita" })
    ).json().data.id;
  });

  it("is made by an Admin, for listings only, and shows its secret once", async () => {
    const notListing = await asAdmin("POST", "/api/tokens", {
      name: "People sync",
      role: "contentManager",
      areas: ["entries"],
      listingIds: [(await asAdmin("GET", "/api/pages")).json().data[0].id],
      days: 30,
    });
    expect(notListing.json().error.code).toBe("not_a_listing");

    const made = await asAdmin("POST", "/api/tokens", {
      name: "People sync",
      role: "contentManager",
      areas: ["entries", "media"],
      listingIds: [staf],
      days: 30,
    });
    expect(made.statusCode).toBe(201);
    ({ secret } = made.json().data);
    tokenId = made.json().data.token.id;
    expect(secret).toMatch(/^laman_/);
    expect(made.json().data.token).toMatchObject({
      name: "People sync",
      role: "contentManager",
      status: "live",
      hint: secret.slice(0, 10),
      areas: ["entries", "media"],
      listings: [{ id: staf, title: "Staf" }],
    });
    const list = (await asAdmin("GET", "/api/tokens")).json().data;
    expect(JSON.stringify(list)).not.toContain(secret);
  });

  it("can't be made with a role above Content Manager, or by a Content Manager", async () => {
    const admins = await asAdmin("POST", "/api/tokens", {
      name: "Too much",
      role: "admin",
      areas: ["entries"],
      listingIds: [staf],
      days: 30,
    });
    expect(admins.statusCode).toBe(400);
    const { cookie } = await sessionCookie(app, "contentManager");
    const res = await app.inject({ method: "GET", url: "/api/tokens", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("isn't a person: not on Users, and can't sign in", async () => {
    const people = (await asAdmin("GET", "/api/users")).json().data;
    expect(people.some((p: { displayName: string }) => p.displayName === "People sync")).toBe(
      false,
    );
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in",
      payload: { username: `token:${tokenId}`, password: "!" },
    });
    expect(signIn.statusCode).toBe(401);
    expect((await asToken(secret, "GET", "/api/auth/me")).statusCode).toBe(403);
  });

  it("creates, saves and publishes entries under its listing, under its own name", async () => {
    const created = await asToken(secret, "POST", `/api/pages/${staf}/entries`, {
      title: "Aminah Binti Yusof",
    });
    expect(created.statusCode).toBe(201);
    const entry = created.json().data;
    const saved = await asToken(secret, "PUT", `/api/pages/${entry.id}/draft`, {
      draft: { ...entry.draft, ms: { ...entry.draft.ms, title: "Aminah Yusof" } },
      base: entry.draftVersion,
    });
    expect(saved.statusCode).toBe(200);
    const published = await asToken(secret, "POST", `/api/pages/${entry.id}/publish`);
    expect(published.statusCode).toBe(202);

    const revisions = (await asAdmin("GET", `/api/pages/${entry.id}/revisions`)).json().data;
    expect(JSON.stringify(revisions)).toContain("People sync");
    const audit = (await asAdmin("GET", "/api/audit?action=published")).json().data;
    expect(audit[0].user.displayName).toBe("People sync");

    const unpublished = await asToken(secret, "POST", `/api/pages/${entry.id}/unpublish`, {});
    expect(unpublished.statusCode).toBe(200);
  });

  it("writes nothing outside its listings, and nothing that isn't an entry", async () => {
    const elsewhere = await asToken(secret, "POST", `/api/pages/${berita}/entries`, {
      title: "Tidak dibenarkan",
    });
    expect(elsewhere.json().error.code).toBe("outside_token_scope");
    const listing = (await asAdmin("GET", `/api/pages/${staf}`)).json().data;
    const ownListing = await asToken(secret, "PUT", `/api/pages/${staf}/draft`, {
      draft: listing.draft,
    });
    expect(ownListing.json().error.code).toBe("outside_token_scope");
    const page = await asToken(secret, "POST", "/api/pages", { title: "Baharu", slug: "baharu" });
    expect(page.json().error.code).toBe("outside_token_scope");
    const settings = await asToken(secret, "POST", "/api/settings/publish");
    expect(settings.json().error.code).toBe("outside_token_scope");
    // A route no token may use is refused before the body is checked.
    const bulk = await asToken(secret, "POST", "/api/publish", {});
    expect(bulk.json().error.code).toBe("token_not_allowed");
    const tokens = await asToken(secret, "GET", "/api/tokens");
    expect(tokens.statusCode).toBe(403);
  });

  it("changes the areas it was given, within what its role allows", async () => {
    const made = (
      await asAdmin("POST", "/api/tokens", {
        name: "Site import",
        role: "editor",
        areas: ["pages", "site"],
        days: 30,
      })
    ).json().data;
    expect(made.token).toMatchObject({ areas: ["pages", "site"], listings: [] });
    const page = await asToken(made.secret, "POST", "/api/pages", {
      title: "Dari skrip",
      slug: "dari-skrip",
    });
    expect(page.statusCode).toBe(201);
    const settings = (await asAdmin("GET", "/api/settings")).json().data;
    const saved = await asToken(made.secret, "PUT", "/api/settings", {
      draft: settings.draft,
      base: settings.version,
    });
    expect(saved.statusCode).toBe(200);
    // An Editor's token drafts; publishing needs Content Manager.
    const publish = await asToken(made.secret, "POST", `/api/pages/${page.json().data.id}/publish`);
    expect(publish.json().error.code).toBe("forbidden");
    // Not given media.
    const media = await asToken(made.secret, "DELETE", `/api/media/${crypto.randomUUID()}`);
    expect(media.json().error.code).toBe("outside_token_scope");
  });

  it("needs no listings for entries when it may change all pages", async () => {
    const res = await asAdmin("POST", "/api/tokens", {
      name: "Everything",
      role: "editor",
      areas: ["entries", "pages"],
      days: 30,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.token).toMatchObject({ areas: ["pages"], listings: [] });
  });

  it("needs listings when it may change entries", async () => {
    const res = await asAdmin("POST", "/api/tokens", {
      name: "No listings",
      role: "editor",
      areas: ["entries"],
      days: 30,
    });
    expect(res.statusCode).toBe(400);
  });

  it("needs no same-origin check, since no cookie rides along", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/pages/${staf}/entries`,
      headers: { authorization: `Bearer ${secret}`, "sec-fetch-site": "cross-site" },
      payload: { title: "Dari skrip" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("stops working when revoked, and an unknown one is refused", async () => {
    expect((await asToken("laman_nope", "GET", "/api/pages")).json().error.code).toBe(
      "token_invalid",
    );
    const revoked = await asAdmin("DELETE", `/api/tokens/${tokenId}`);
    expect(revoked.json().data).toMatchObject({ status: "revoked" });
    expect(revoked.json().data.revokedBy).toBeTruthy();
    expect((await asToken(secret, "GET", "/api/pages")).json().error.code).toBe("token_invalid");
  });

  it("can be made to never expire, and works until it's revoked", async () => {
    const made = (
      await asAdmin("POST", "/api/tokens", {
        name: "Forever",
        role: "editor",
        areas: ["entries"],
        listingIds: [berita],
        days: null,
      })
    ).json().data;
    expect(made.token).toMatchObject({ expiresAt: null, status: "live" });
    expect((await asToken(made.secret, "GET", "/api/pages")).statusCode).toBe(200);
    await asAdmin("DELETE", `/api/tokens/${made.token.id}`);
    expect((await asToken(made.secret, "GET", "/api/pages")).statusCode).toBe(401);
  });

  it("stops working when it expires", async () => {
    const made = (
      await asAdmin("POST", "/api/tokens", {
        name: "Short",
        role: "editor",
        areas: ["entries"],
        listingIds: [berita],
        days: 1,
      })
    ).json().data;
    await app.db
      .updateTable("api_tokens")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("id", "=", made.token.id)
      .execute();
    expect((await asToken(made.secret, "GET", "/api/pages")).statusCode).toBe(401);
    const listed = (await asAdmin("GET", "/api/tokens")).json().data;
    expect(listed.find((t: { id: string }) => t.id === made.token.id).status).toBe("expired");
  });
});
