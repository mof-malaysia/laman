/**
 * API tokens (docs/auth.md § API tokens): a program sends one as
 * `Authorization: Bearer laman_…` and the API runs as the token's own
 * account, with the token's role, changing only its areas. Only the
 * SHA-256 is stored; the token is shown once, when it's made.
 */
import { randomUUID } from "node:crypto";
import {
  API_TOKEN_PREFIX,
  type ApiToken,
  ApiTokenArea,
  type ApiTokenCreated,
  ApiTokenRole,
  type CreateApiTokenBody,
} from "@fiscal-sb/contracts";
import type { FastifyRequest } from "fastify";
import { pageFacts } from "../content/pages.js";
import { ago, type Db, later, now } from "../db/index.js";
import { HttpError } from "../errors.js";
import { audit } from "./audit.js";
import { bearerToken, grantStatus, hashToken, newToken } from "./tokens.js";
import { getUser, type User } from "./users.js";

/** `last_used_at` is written at most this often. */
const USED_MS = 60 * 1000;

/** The token a request carries, or undefined when it carries none of ours (an agent's is another kind). */
export function bearerOf(request: FastifyRequest) {
  const token = bearerToken(request);
  return token?.startsWith(API_TOKEN_PREFIX) ? token : undefined;
}

export type TokenAuth = {
  id: string;
  user: User;
  /** What it may change. */
  areas: Set<ApiTokenArea>;
  /** With "entries": the listing pages it may write under. */
  listings: Set<string>;
  createdAt: string;
};

const refused = () =>
  new HttpError(401, "token_invalid", "This API token is unknown, expired or revoked.");

/** The token's account and listings, or 401 when it doesn't work. */
export async function tokenAuth(db: Db, secret: string): Promise<TokenAuth> {
  const token = await db
    .selectFrom("api_tokens")
    .selectAll()
    .where("token_hash", "=", hashToken(secret))
    .executeTakeFirst();
  if (!token || grantStatus(token, now()) !== "live") throw refused();
  const user = await getUser(db, token.user_id);
  if (!user || user.disabled_at) throw refused();
  const { id } = token;
  if (!token.last_used_at || token.last_used_at < ago(USED_MS))
    await db.updateTable("api_tokens").set({ last_used_at: now() }).where("id", "=", id).execute();
  const [areas, listings] = await Promise.all([
    db.selectFrom("api_token_areas").select("area").where("token_id", "=", id).execute(),
    db.selectFrom("api_token_listings").select("listing_id").where("token_id", "=", id).execute(),
  ]);
  return {
    id,
    user,
    areas: new Set(areas.map((a) => a.area)),
    listings: new Set(listings.map((l) => l.listing_id)),
    createdAt: token.created_at,
  };
}

/**
 * What a route changes, as it declares it (`config.tokenScope`), so a token
 * may use it only with the matching area:
 * - "page": one page (`:id`): with "pages", or with "entries" when it's an
 *   entry under one of the token's listings;
 * - "entries": a new entry under the listing `:id`: with "pages", or with
 *   "entries" for one of its listings;
 * - "pages": the page tree (new pages, moves, listing settings): "pages";
 * - "media": the media library; "site": navigation and the site documents.
 * A route that changes something and declares none is closed to tokens: the
 * guard refuses it before this is reached.
 */
export type TokenScope = "page" | "entries" | "pages" | "media" | "site";

const outside = () =>
  new HttpError(403, "outside_token_scope", "This API token can't change this.");

/** Refuses a change outside the token's areas and listings. */
export async function checkTokenScope(
  db: Db,
  token: TokenAuth,
  scope: TokenScope,
  pageId: string | undefined,
) {
  // The scopes named after an area need just that area.
  if (scope !== "page" && scope !== "entries") {
    if (!token.areas.has(scope)) throw outside();
    return;
  }
  if (token.areas.has("pages")) return;
  if (!token.areas.has("entries") || !pageId) throw outside();
  const page = await db
    .selectFrom("pages")
    .select(["kind", "parent_id"])
    .where("id", "=", pageId)
    .executeTakeFirst();
  // An unknown page is the route's own 404 to give.
  if (!page) return;
  // The listing the page is, or is under, for the kind of page the route acts on.
  const listing =
    scope === "entries"
      ? page.kind === "listing"
        ? pageId
        : null
      : page.kind === "entry"
        ? page.parent_id
        : null;
  if (!listing || !token.listings.has(listing)) throw outside();
}

/** Makes a token and its account; the secret is in the answer and nowhere else. */
export async function makeApiToken(
  db: Db,
  body: CreateApiTokenBody,
  by: User,
  ip: string,
): Promise<ApiTokenCreated> {
  // "pages" covers every listing's entries: then "entries" and its listings say nothing more.
  const areas = [...new Set(body.areas)].filter(
    (area) => !(area === "entries" && body.areas.includes("pages")),
  );
  const listingIds = areas.includes("entries") ? [...new Set(body.listingIds)] : [];
  const listings = listingIds.length
    ? await db
        .selectFrom("pages")
        .select("id")
        .where("id", "in", listingIds)
        .where("kind", "=", "listing")
        .where("deleted_at", "is", null)
        .execute()
    : [];
  if (listings.length !== listingIds.length)
    throw new HttpError(400, "not_a_listing", "Choose listing pages that are on the site's tree.");

  const id = randomUUID();
  const userId = randomUUID();
  const secret = `${API_TOKEN_PREFIX}${newToken()}`;
  const at = now();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("users")
      .values({
        id: userId,
        // Not a valid username, so it never clashes with a person's or signs in.
        username: `token:${id}`,
        display_name: body.name,
        role: body.role,
        password_hash: "!",
        must_change_password: 0,
        created_at: at,
        created_by: by.id,
        kind: "token",
      })
      .execute();
    await trx
      .insertInto("api_tokens")
      .values({
        id,
        user_id: userId,
        token_hash: hashToken(secret),
        hint: secret.slice(0, API_TOKEN_PREFIX.length + 4),
        created_at: at,
        created_by: by.id,
        expires_at: body.days === null ? null : later(body.days * 86_400_000),
      })
      .execute();
    await trx
      .insertInto("api_token_areas")
      .values(areas.map((area) => ({ token_id: id, area })))
      .execute();
    if (listingIds.length)
      await trx
        .insertInto("api_token_listings")
        .values(listingIds.map((listing_id) => ({ token_id: id, listing_id })))
        .execute();
    await audit(trx, {
      userId: by.id,
      action: "apiTokenMade",
      target: userId,
      detail: { name: body.name, role: body.role, areas, pageIds: listingIds, days: body.days },
      ip,
    });
  });
  return { token: await apiToken(db, id), secret };
}

/** Every token, newest first, or the one with `id`. */
export async function listApiTokens(db: Db, id?: string): Promise<ApiToken[]> {
  let q = db
    .selectFrom("api_tokens")
    .innerJoin("users as account", "account.id", "api_tokens.user_id")
    .leftJoin("users as maker", "maker.id", "api_tokens.created_by")
    .leftJoin("users as ender", "ender.id", "api_tokens.revoked_by")
    .select([
      "api_tokens.id",
      "api_tokens.user_id",
      "api_tokens.hint",
      "api_tokens.created_at",
      "api_tokens.expires_at",
      "api_tokens.last_used_at",
      "api_tokens.revoked_at",
      "account.display_name as name",
      "account.role",
      "maker.display_name as created_by",
      "ender.display_name as revoked_by",
    ])
    .orderBy("api_tokens.created_at", "desc");
  if (id) q = q.where("api_tokens.id", "=", id);
  const rows = await q.execute();
  const ids = rows.map((r) => r.id);
  const [links, areas] = ids.length
    ? await Promise.all([
        db.selectFrom("api_token_listings").selectAll().where("token_id", "in", ids).execute(),
        db.selectFrom("api_token_areas").selectAll().where("token_id", "in", ids).execute(),
      ])
    : [[], []];
  const titles = await pageFacts(db, [...new Set(links.map((l) => l.listing_id))]);
  const at = now();
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    role: ApiTokenRole.parse(r.role),
    hint: r.hint,
    // In ApiTokenArea's order, so the admin lists them the same way every time.
    areas: ApiTokenArea.options.filter((area) =>
      areas.some((a) => a.token_id === r.id && a.area === area),
    ),
    listings: links
      .filter((l) => l.token_id === r.id)
      .map((l) => ({ id: l.listing_id, title: titles.get(l.listing_id)?.title ?? "" })),
    status: grantStatus(r, at),
    createdAt: r.created_at,
    createdBy: r.created_by,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    revokedBy: r.revoked_by,
  }));
}

/** Ends a token at once. Its account stays, so history keeps its name. */
export async function revokeApiToken(db: Db, id: string, by: User, ip: string) {
  const token = await db
    .selectFrom("api_tokens")
    .select(["user_id", "revoked_at"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!token) throw new HttpError(404, "token_not_found", "No API token with that id.");
  if (!token.revoked_at)
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("api_tokens")
        .set({ revoked_at: now(), revoked_by: by.id })
        .where("id", "=", id)
        .execute();
      await audit(trx, { userId: by.id, action: "apiTokenRevoked", target: token.user_id, ip });
    });
  return apiToken(db, id);
}

/** One token, as the list shows it: the answer to making or revoking it. */
const apiToken = async (db: Db, id: string) => (await listApiTokens(db, id))[0]!;
