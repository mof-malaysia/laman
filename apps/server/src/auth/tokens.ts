/**
 * Secrets handed to a browser or a person: session tokens, one-time links,
 * recovery codes. Only their SHA-256 is stored, so a copy of site.db holds
 * none that work. They are random enough that a fast hash is the right one.
 */
import { createHash, randomBytes } from "node:crypto";
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
