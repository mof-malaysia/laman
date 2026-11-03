/**
 * TOTP (RFC 6238): SHA-1, 6 digits, 30-second steps, which every
 * authenticator app reads from an otpauth:// address.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes, the length RFC 4226 recommends for SHA-1. */
export const newSecret = () => base32(randomBytes(20));

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

export function codeFor(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const number = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(number).padStart(DIGITS, "0");
}

/**
 * The step `code` is valid for, one step either side of now, or undefined.
 * Steps at or before `lastStep` are refused, so a code can't be used twice.
 */
export function acceptedStep(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const current = stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeFor(secret, step)), Buffer.from(code))) return step;
  }
  return undefined;
}

/** The address an authenticator app reads from the QR code. */
export const otpauthUri = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })}`;
