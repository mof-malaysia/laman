/**
 * argon2id through Node's own crypto.argon2, so no native module. Hashes are
 * PHC strings ($argon2id$v=19$m=…,t=…,p=…$salt$hash), so the parameters can
 * be raised later without breaking stored ones.
 */
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "../errors.js";

const derive = promisify(argon2);

/** OWASP's minimum for argon2id: 19 MiB, 2 passes, 1 lane. */
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

const b64 = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

export async function hashPassword(password: string): Promise<string> {
  const nonce = randomBytes(16);
  const hash = await derive("argon2id", { message: password, nonce, ...PARAMS });
  const { memory: m, passes: t, parallelism: p } = PARAMS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(nonce)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt, hash] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hash, "base64");
  const actual = await derive("argon2id", {
    message: password,
    nonce: Buffer.from(salt, "base64"),
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Checked against when the username doesn't exist, so a wrong username takes
 * as long to refuse as a wrong password.
 */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

/** Passwords long enough to pass the length rule that are still the first ones guessed. */
const COMMON = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "111111111111",
  "000000000000",
  "aaaaaaaaaaaa",
  "abcdefghijkl",
  "abcd1234abcd",
  "qwertyuiopas",
  "qwertyuiop12",
  "qwertyuiop123",
  "qwerty123456",
  "1qaz2wsx3edc",
  "password1234",
  "password12345",
  "password123456",
  "passwordpassword",
  "p@ssw0rd1234",
  "welcome12345",
  "welcome123456",
  "iloveyou1234",
  "letmein12345",
  "admin1234567",
  "administrator",
  "administrator1",
  "changeme1234",
  "kerajaan1234",
  "malaysia1234",
  "malaysia12345",
  "selamat12345",
  "katalaluan123",
  "katalaluan1234",
  "katalaluanbaru",
]);

/** Why a password that passes the schema is still refused, or undefined. */
export function weakPassword(password: string, username: string): string | undefined {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is one of the first ones guessed. Choose another.";
  if (lower.includes(username.toLowerCase())) return "Don't use your username in your password.";
  if (/^(.)\1+$/.test(password)) return "Don't use one character over and over.";
  return undefined;
}

/** Throws the reason a password that passes the schema is still refused. */
export function assertStrongPassword(password: string, username: string) {
  const weak = weakPassword(password, username);
  if (weak) throw new HttpError(400, "weak_password", weak);
}
