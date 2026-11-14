/**
 * Off-site copies (docs/laman.md § Off-site copies). Every archive
 * the builder makes in BACKUP_DIR is also uploaded, by a `backup.upload` job
 * of its own, so a storage outage never stops the local backup and a failed
 * upload is retried without making another archive. Copies go in a folder
 * per kind (`OffsiteFolder`) for the bucket's lifecycle rules to expire;
 * the builder deletes old ones itself only when asked to (`prune`). Once a
 * week a `backup.verify` job downloads the newest copy and opens it as a
 * restore would.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type BackupUploadPayload,
  type OffsiteFolder,
  OffsiteFolder as Folders,
  type OffsiteSettings,
  type OffsiteSettingsSave,
  type OffsiteStatus,
  OffsiteStored,
  type OffsiteTestResult,
  offsiteKeepDays,
} from "@laman/contracts";
import { sql } from "kysely";
import { parseName, sha256, verifyBackup } from "../backup.js";
import { readRow, writeRow } from "../content/kv.js";
import { parseStored } from "../db/documents.js";
import { type Db, now } from "../db/index.js";
import { HttpError } from "../errors.js";
import { ENCRYPTED, decryptFile, encryptFile, fingerprint, seal, unseal } from "./crypt.js";
import { type RemoteStore, type StoreConfig, describeError } from "./stores.js";

export { describeError, storeFor } from "./stores.js";
export type { RemoteStore } from "./stores.js";

/** The settings row they're kept in. */
export const OFFSITE_ROW = "offsite";

/** The object Test connection writes, at the top of the prefix. */
export const TEST_OBJECT = "laman-connection-test.txt";

const DAY_MS = 86_400_000;

export const offsiteDefaults: OffsiteStored = {
  enabled: false,
  provider: "aws",
  endpoint: "",
  region: "",
  bucket: "",
  prefix: "",
  accessKeyId: "",
  pathStyle: false,
  prune: false,
  encrypt: false,
  secret: null,
  passphrase: null,
  passphraseFingerprint: null,
};

export async function readOffsite(db: Db): Promise<OffsiteStored> {
  return (
    parseStored(OffsiteStored, await readRow(db, OFFSITE_ROW), "off-site settings") ??
    offsiteDefaults
  );
}

export const saveOffsite = (db: Db, stored: OffsiteStored) => writeRow(db, OFFSITE_ROW, stored);

/** What Settings is sent: never a secret, sealed or not. */
export function viewOf(stored: OffsiteStored, secretKey: string | undefined): OffsiteSettings {
  const { secret, passphrase: _passphrase, ...rest } = stored;
  return { ...rest, secretSaved: Boolean(secret), canSave: Boolean(secretKey) };
}

/**
 * A save applied to what's stored: new secrets sealed, ones left out kept.
 * Turning encryption off keeps the passphrase, which the copies already
 * made still need.
 */
export function mergeSave(
  stored: OffsiteStored,
  save: OffsiteSettingsSave,
  secretKey: string,
): OffsiteStored {
  const { secret, passphrase, ...fields } = save;
  // Another service's keys never work for this one: a new provider needs its own.
  if (fields.enabled && !secret && stored.secret && fields.provider !== stored.provider)
    throw new HttpError(
      422,
      "offsite_secret_missing",
      // Azure (parked): "Enter the account key or SAS token for Azure." for "azure".
      "Enter the secret access key for the new storage service.",
    );
  const next: OffsiteStored = {
    ...fields,
    secret: secret ? seal(secret, secretKey) : stored.secret,
    passphrase: passphrase ? seal(passphrase, secretKey) : stored.passphrase,
    passphraseFingerprint: passphrase ? fingerprint(passphrase) : stored.passphraseFingerprint,
  };
  if (next.enabled && !next.secret)
    throw new HttpError(
      422,
      "offsite_secret_missing",
      // Azure (parked): "Enter the account key or SAS token." for "azure".
      "Enter the secret access key.",
    );
  if (next.encrypt && !next.passphrase)
    throw new HttpError(422, "offsite_passphrase_missing", "Enter a passphrase to encrypt copies.");
  return next;
}

/** What changed, for the audit log: field names only, and never a secret's value. */
export function changedFields(before: OffsiteStored, save: OffsiteSettingsSave) {
  const changed: string[] = [];
  for (const key of Object.keys(offsiteDefaults) as (keyof OffsiteStored)[]) {
    if (key === "secret" || key === "passphrase" || key === "passphraseFingerprint") continue;
    if (before[key] !== save[key as keyof OffsiteSettingsSave]) changed.push(key);
  }
  if (save.secret) changed.push("secret");
  if (save.passphrase) changed.push("passphrase");
  return changed;
}

/** A store's settings with the secret opened: from what's saved, or a form's unsaved values. */
export function storeConfig(
  stored: OffsiteStored,
  secretKey: string | undefined,
  unsaved?: OffsiteSettingsSave,
): StoreConfig {
  const fields = unsaved ?? stored;
  let secret = unsaved?.secret;
  if (!secret) {
    if (!stored.secret)
      throw new HttpError(422, "offsite_secret_missing", "Enter the secret key first.");
    if (!secretKey)
      throw new HttpError(
        409,
        "backup_secret_key_missing",
        "BACKUP_SECRET_KEY isn't set on the server, so the saved secret can't be read.",
      );
    secret = unseal(stored.secret, secretKey);
  }
  return {
    provider: fields.provider,
    endpoint: fields.endpoint,
    region: fields.region,
    bucket: fields.bucket,
    accessKeyId: fields.accessKeyId,
    secret,
    pathStyle: fields.pathStyle,
  };
}

/** The passphrase that opens encrypted copies: the saved one, else BACKUP_PASSPHRASE. */
export function passphraseOf(
  stored: OffsiteStored | undefined,
  secretKey: string | undefined,
  fallback?: string,
) {
  if (stored?.passphrase && secretKey) return unseal(stored.passphrase, secretKey);
  if (fallback) return fallback;
  throw new Error(
    "This copy is encrypted. Set BACKUP_PASSPHRASE to the passphrase it was encrypted with.",
  );
}

const joinKey = (...parts: string[]) => parts.filter(Boolean).join("/");

/** Where an archive's copy goes: `<prefix>/<folder>/<file>[.enc]`. */
export const remoteKey = (
  prefix: string,
  folder: OffsiteFolder,
  file: string,
  encrypted: boolean,
) => joinKey(prefix, folder, basename(file) + (encrypted ? ENCRYPTED : ""));

export type RemoteArchive = {
  key: string;
  /** The archive's own name, without `.enc`: what `laman restore` takes once fetched. */
  file: string;
  folder: OffsiteFolder;
  at: string;
  bytes: number;
  dbOnly: boolean;
  encrypted: boolean;
};

/** The copies under `prefix`, newest first. Only objects named like an archive count. */
export async function listRemote(store: RemoteStore, prefix: string): Promise<RemoteArchive[]> {
  const out: RemoteArchive[] = [];
  for (const folder of Folders.options) {
    const base = `${joinKey(prefix, folder)}/`;
    for (const object of await store.list(base)) {
      const name = object.key.slice(base.length);
      const encrypted = name.endsWith(ENCRYPTED);
      const file = encrypted ? name.slice(0, -ENCRYPTED.length) : name;
      const parsed = !name.includes("/") && parseName(file);
      if (parsed)
        out.push({ key: object.key, file, folder, bytes: object.bytes, encrypted, ...parsed });
    }
  }
  return out.toSorted((a, b) => b.at.localeCompare(a.at));
}

/** Waits between upload tries: a blip in the network shouldn't fail the night's copy. */
const RETRY_DELAYS_MS = [5_000, 30_000];

async function withRetries<T>(run: () => Promise<T>, delays: number[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

/**
 * Uploads one archive in `backupDir`: encrypted first when asked, then
 * checked in the bucket by size and by the SHA-256 stored beside it.
 */
export async function uploadArchive(options: {
  store: RemoteStore;
  stored: OffsiteStored;
  secretKey: string | undefined;
  backupDir: string;
  file: string;
  folder: OffsiteFolder;
  retryDelays?: number[];
}) {
  const { store, stored, backupDir, folder } = options;
  const file = basename(options.file);
  const local = join(backupDir, file);
  if (!parseName(file)) throw new Error(`${file} isn't a backup archive`);
  if (!existsSync(local))
    throw new Error(`${file} isn't in BACKUP_DIR any more, so it couldn't be copied off-site.`);
  let source = local;
  let temp: string | undefined;
  try {
    if (stored.encrypt) {
      temp = join(backupDir, `.${file}${ENCRYPTED}.partial`);
      await encryptFile(local, temp, passphraseOf(stored, options.secretKey));
      source = temp;
    }
    const sum = await sha256(source);
    const { size: bytes } = await stat(source);
    const key = remoteKey(stored.prefix, folder, file, stored.encrypt);
    await withRetries(() => store.put(key, source, sum), options.retryDelays ?? RETRY_DELAYS_MS);
    const head = await store.head(key);
    if (!head || head.bytes !== bytes || (head.sha256 && head.sha256 !== sum))
      throw new Error(
        `The copy of ${file} in the bucket doesn't match the archive (${head ? `${head.bytes} bytes, expected ${bytes}` : "not found after upload"}).`,
      );
    return { key, bytes };
  } finally {
    if (temp) await rm(temp, { force: true });
  }
}

/**
 * Deletes copies older than their folder's `offsiteKeepDays`, by the time in
 * the archive's name. The newest copy in each folder is always kept, and
 * nothing that isn't named like an archive is touched.
 */
export async function pruneRemote(store: RemoteStore, prefix: string, at = Date.now()) {
  const deleted: string[] = [];
  const archives = await listRemote(store, prefix);
  for (const folder of Folders.options) {
    const inFolder = archives.filter((archive) => archive.folder === folder);
    for (const archive of inFolder.slice(1))
      if (at - Date.parse(archive.at) > offsiteKeepDays[folder] * DAY_MS) {
        await store.delete(archive.key);
        deleted.push(archive.key);
      }
  }
  return deleted;
}

/** Downloads a copy into `dir`, decrypting it when it's encrypted: the path of the archive. */
export async function fetchRemote(
  store: RemoteStore,
  archive: RemoteArchive,
  dir: string,
  passphrase: () => string,
) {
  const target = join(dir, archive.file);
  if (!archive.encrypted) {
    await store.get(archive.key, target);
    return target;
  }
  const download = join(dir, `.${archive.file}${ENCRYPTED}.partial`);
  try {
    await store.get(archive.key, download);
    await decryptFile(download, target, passphrase());
    return target;
  } finally {
    await rm(download, { force: true });
  }
}

/**
 * Downloads the newest full copy into a scratch folder and checks it end to
 * end, as `laman backup --verify` does a local one.
 */
export async function verifyRemote(options: {
  store: RemoteStore;
  stored: OffsiteStored;
  secretKey: string | undefined;
  scratch: string;
}) {
  const newest = (await listRemote(options.store, options.stored.prefix)).find((a) => !a.dbOnly);
  if (!newest) throw new Error("There's no full backup off-site yet.");
  const work = await mkdtemp(join(options.scratch, ".offsite-verify-"));
  try {
    const file = await fetchRemote(options.store, newest, work, () =>
      passphraseOf(options.stored, options.secretKey),
    );
    const manifest = await verifyBackup(file, work);
    return { key: newest.key, createdAt: manifest.createdAt, bytes: newest.bytes };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Writes, reads back, lists and tries to delete a small object. Keys that
 * can't delete pass, and are the safer kind: they're reported as such.
 */
export async function testConnection(
  store: RemoteStore,
  prefix: string,
): Promise<OffsiteTestResult> {
  const key = joinKey(prefix, TEST_OBJECT);
  try {
    await store.putText(key, `Laman connection test, ${now()}\n`);
    if (!(await store.head(key)))
      return {
        ok: false,
        canDelete: null,
        error: "The test file was uploaded but can't be found.",
      };
    await store.list(prefix ? `${prefix}/` : "");
  } catch (error) {
    return { ok: false, canDelete: null, error: describeError(error) };
  }
  try {
    await store.delete(key);
    return { ok: true, canDelete: true, error: null };
  } catch {
    return { ok: true, canDelete: false, error: null };
  }
}

/** The first moment of `at`'s month in Malaysia, as UTC. */
export function malaysianMonthStart(at = new Date()) {
  const local = new Date(at.getTime() + 8 * 3600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 8 * 3600_000,
  ).toISOString();
}

const folderOf = sql<string>`json_extract(payload, '$.folder')`;

/**
 * The folder a backup's copy goes in: the first scheduled one of each
 * Malaysian month in `monthly`, the other scheduled ones in `daily`, and
 * ones someone asked for in `manual`.
 */
export async function folderFor(db: Db, trigger: string | undefined): Promise<OffsiteFolder> {
  if (trigger !== "scheduled") return "manual";
  const monthly = await db
    .selectFrom("jobs")
    .select("id")
    .where("kind", "=", "backup.upload")
    .where("status", "!=", "failed")
    .where(folderOf, "=", "monthly")
    .where("created_at", ">=", malaysianMonthStart())
    .executeTakeFirst();
  return monthly ? "daily" : "monthly";
}

/** Whether a weekly check of the newest copy is due: none finished or waiting in the last `ms`. */
export async function verifyDue(db: Db, ms = 6.5 * DAY_MS) {
  const recent = await db
    .selectFrom("jobs")
    .select("id")
    .where("kind", "=", "backup.verify")
    .where((eb) =>
      eb.or([
        eb("status", "in", ["queued", "running"]),
        eb("created_at", ">", new Date(Date.now() - ms).toISOString()),
      ]),
    )
    .executeTakeFirst();
  return !recent;
}

/** How the copies stand, from the upload and check jobs; null when off-site copies are off. */
export async function offsiteStatus(db: Db, stored: OffsiteStored): Promise<OffsiteStatus | null> {
  if (!stored.enabled) return null;
  const done = await db
    .selectFrom("jobs")
    .select(["payload", "finished_at"])
    .where("kind", "=", "backup.upload")
    .where("status", "=", "done")
    .orderBy("finished_at", "desc")
    .limit(500)
    .execute();
  const payloads = done.map((row) => JSON.parse(row.payload) as BackupUploadPayload);
  const last = done[0] && {
    at: done[0].finished_at!,
    file: payloads[0]!.file,
    folder: payloads[0]!.folder,
  };
  const [failed, running, verified] = await Promise.all([
    db
      .selectFrom("jobs")
      .select(["finished_at", "error"])
      .where("kind", "=", "backup.upload")
      .where("status", "=", "failed")
      .where("finished_at", ">", last?.at ?? "")
      .orderBy("finished_at", "desc")
      .executeTakeFirst(),
    db
      .selectFrom("jobs")
      .select("id")
      .where("kind", "=", "backup.upload")
      .where("status", "in", ["queued", "running"])
      .executeTakeFirst(),
    db
      .selectFrom("jobs")
      .select(["finished_at", "status", "error"])
      .where("kind", "=", "backup.verify")
      .where("status", "in", ["done", "failed"])
      .orderBy("finished_at", "desc")
      .executeTakeFirst(),
  ]);
  return {
    provider: stored.provider,
    bucket: stored.bucket,
    encrypt: stored.encrypt,
    last: last ?? null,
    failed: failed ? { at: failed.finished_at!, error: failed.error ?? "" } : null,
    running: Boolean(running),
    copied: [...new Set(payloads.map((payload) => payload.file))],
    verified: verified
      ? {
          at: verified.finished_at!,
          ok: verified.status === "done",
          error: verified.status === "failed" ? (verified.error ?? "") : null,
        }
      : null,
  };
}
