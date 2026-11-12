/**
 * API tokens: how a program with no one at the keyboard (a nightly import, a
 * sync from another system) writes to the builder. An Admin makes one with a
 * name, a role and the areas it may change; the program sends it as
 * `Authorization: Bearer …` to /api. See docs/auth.md § API tokens.
 */
import { z } from "zod";
import { GrantStatus } from "./agents.js";
import { Role } from "./auth.js";

/** Every token starts with this, so a leaked one is easy to spot and the server knows it from an agent's. */
export const API_TOKEN_PREFIX = "laman_";

/** The longest a token with an end date may last; a token can also have none. */
export const API_TOKEN_MAX_DAYS = 365;

/** The roles a token may have: it can draft, or draft and publish, never manage the site or people. */
export const ApiTokenRole = Role.extract(["editor", "contentManager"]);
export type ApiTokenRole = z.infer<typeof ApiTokenRole>;

/**
 * What a token may change, beside reading what its role can. entries: create
 * and change entries under the chosen listings. pages: every page and entry,
 * and the page tree. media: the media library. site: navigation, settings,
 * the announcement, search and colours. Its role still decides whether it may
 * publish.
 */
export const ApiTokenArea = z.enum(["entries", "pages", "media", "site"]);
export type ApiTokenArea = z.infer<typeof ApiTokenArea>;

/** The longest a token's name may be. */
export const API_TOKEN_NAME_MAX = 60;

export const CreateApiTokenBody = z
  .object({
    /** Shown wherever its changes are: history, Publishing, the audit log. */
    name: z.string().trim().min(1, "Enter a name").max(API_TOKEN_NAME_MAX),
    role: ApiTokenRole,
    areas: z.array(ApiTokenArea).min(1, "Choose what it may change"),
    /** With "entries": the listing pages whose entries it may create and change. */
    listingIds: z.array(z.uuid()).max(20).default([]),
    /** Days from now, or null for a token that works until it's revoked. */
    days: z.number().int().min(1).max(API_TOKEN_MAX_DAYS).nullable(),
  })
  // "pages" covers every listing's entries, so listings are needed only for "entries" alone.
  .refine(
    ({ areas, listingIds }) =>
      !areas.includes("entries") || areas.includes("pages") || listingIds.length > 0,
    {
      message: "Choose at least one listing",
      path: ["listingIds"],
    },
  );
export type CreateApiTokenBody = z.infer<typeof CreateApiTokenBody>;

export const ApiToken = z.object({
  id: z.uuid(),
  /** Its account: who the audit log and history name for its changes. */
  userId: z.uuid(),
  name: z.string(),
  role: ApiTokenRole,
  /** The token's opening characters, so it can be matched to the one a program holds. */
  hint: z.string(),
  areas: z.array(ApiTokenArea),
  listings: z.array(z.object({ id: z.uuid(), title: z.string() })),
  /** live: it works. expired: past its date. revoked: ended early. */
  status: GrantStatus,
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  /** Null: it never expires. */
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
});
export type ApiToken = z.infer<typeof ApiToken>;

/** A new token, with its secret: shown once, never stored. */
export const ApiTokenCreated = z.object({ token: ApiToken, secret: z.string() });
export type ApiTokenCreated = z.infer<typeof ApiTokenCreated>;
