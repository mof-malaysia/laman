/**
 * Secrets handed to a browser or a person: session tokens, one-time links,
 * recovery codes. Only their SHA-256 is stored, so a copy of site.db holds
 * none that work. They are random enough that a fast hash is the right one.
 */
import { createHash, randomBytes } from "node:crypto";
import type { GrantStatus } from "@laman/contracts";
import type { FastifyRequest } from "fastify";
import { base32 } from "./totp.js";

/** 32 random bytes, URL-safe. */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** "ABCDE-FGHIJ": 50 random bits, easy to read off a sheet of paper. */
export function newRecoveryCode() {
  const code = base32(randomBytes(7)).slice(0, 10);
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Typed recovery codes match however they were spaced or cased. */
export const normaliseRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, "");

/** The token in an `Authorization: Bearer …` header, as agents and API tokens send it. */
export const bearerToken = (request: FastifyRequest) =>
  /^Bearer (\S+)$/i.exec(request.headers.authorization ?? "")?.[1];

/** Where something that ends stands at `at`: revoked, past its end (if it has one), or live. */
export const grantStatus = (
  row: { revoked_at: string | null; expires_at: string | null },
  at: string,
): GrantStatus =>
  row.revoked_at ? "revoked" : row.expires_at !== null && row.expires_at < at ? "expired" : "live";
