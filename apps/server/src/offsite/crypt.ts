/**
 * The two kinds of encryption off-site copies use. Settings' secrets (the
 * storage key, the passphrase) are sealed with a key from BACKUP_SECRET_KEY,
 * so site.db and the archives made from it never hold them readable.
 * Archives are encrypted with a key from the passphrase before they leave the
 * server, so the storage provider holds only ciphertext.
 *
 * Both are AES-256-GCM. An encrypted archive is
 * `LAMANENC1\n` · salt (16) · iv (12) · ciphertext · tag (16); the key is
 * scrypt(passphrase, salt). Streams, so a large archive never sits in memory.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const MAGIC = Buffer.from("LAMANENC1\n");
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + SALT + IV;
/** scrypt at 2^17: about a third of a second, once per archive. */
const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

/** The file name an encrypted archive gets. */
export const ENCRYPTED = ".enc";

const sealKey = (secretKey: string) =>
  Buffer.from(hkdfSync("sha256", secretKey, "laman", "offsite settings v1", 32));

/** Seals a setting's secret with BACKUP_SECRET_KEY: `v1.<base64 iv·tag·ciphertext>`. */
export function seal(value: string, secretKey: string) {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secretKey), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** Opens what `seal` made; throws when BACKUP_SECRET_KEY isn't the one it was sealed with. */
export function unseal(sealed: string, secretKey: string) {
  if (!sealed.startsWith("v1.")) throw new Error("Not a sealed setting");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(secretKey), raw.subarray(0, IV));
  decipher.setAuthTag(raw.subarray(IV, IV + TAG));
  try {
    return Buffer.concat([decipher.update(raw.subarray(IV + TAG)), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new Error(
      "The saved off-site secrets can't be opened: BACKUP_SECRET_KEY has changed since they were saved. Enter them again in Settings → Backups.",
    );
  }
}

/**
 * A short code for a passphrase, shown in Settings so two can be told apart
 * (is this the one written down?) without showing it: `xxxx-xxxx-xxxx`.
 */
export function fingerprint(passphrase: string) {
  const hex = scryptSync(passphrase, "laman backup passphrase fingerprint", 6, {
    N: 2 ** 14,
  }).toString("hex");
  return hex.match(/.{4}/g)!.join("-");
}

/** Encrypts `from` into `to` with `passphrase`. */
export async function encryptFile(from: string, to: string, passphrase: string) {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", await scrypt(passphrase, salt, 32, KDF), iv);
  const out = createWriteStream(to, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  try {
    await pipeline(createReadStream(from), cipher, out, { end: false });
    await new Promise<void>((resolve, reject) =>
      out.end(cipher.getAuthTag(), () => resolve()).once("error", reject),
    );
  } catch (error) {
    out.destroy();
    await rm(to, { force: true });
    throw error;
  }
}

/** Whether `file` starts like an encrypted archive. */
export async function isEncrypted(file: string) {
  const handle = await open(file, "r");
  try {
    const head = Buffer.alloc(MAGIC.length);
    await handle.read(head, 0, MAGIC.length, 0);
    return head.equals(MAGIC);
  } finally {
    await handle.close();
  }
}

/**
 * Decrypts `from` into `to`. A wrong passphrase or a damaged file fails at
 * the end, when the tag is checked, and leaves no `to` behind.
 */
export async function decryptFile(from: string, to: string, passphrase: string) {
  const { size } = await stat(from);
  if (size < HEADER + TAG || !(await isEncrypted(from)))
    throw new Error(`${from} isn't an encrypted backup`);
  const handle = await open(from, "r");
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  try {
    await handle.read(head, 0, HEADER, 0);
    await handle.read(tag, 0, TAG, size - TAG);
  } finally {
    await handle.close();
  }
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT);
  const iv = head.subarray(MAGIC.length + SALT);
  const decipher = createDecipheriv("aes-256-gcm", await scrypt(passphrase, salt, 32, KDF), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(from, { start: HEADER, end: size - TAG - 1 }),
      decipher,
      createWriteStream(to, { mode: 0o600 }),
    );
  } catch {
    await rm(to, { force: true });
    throw new Error(
      `${from} couldn't be decrypted: the passphrase is wrong, or the file is damaged.`,
    );
  }
}
