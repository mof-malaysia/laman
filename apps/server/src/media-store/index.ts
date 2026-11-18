/**
 * Which media store is in use: the bundled one (RustFS, from environment
 * variables), or the agency's own provider, set up in Settings → Media
 * storage and kept in the `mediaStorage` settings row with its secret sealed
 * by BACKUP_SECRET_KEY. The setup is locked while the library has live
 * files: Laman never copies media between stores.
 */
import { randomUUID } from "node:crypto";
import {
  type MediaStorage as MediaStorageView,
  type MediaStorageSave,
  MediaStorageStored,
  type MediaStorageTestResult,
} from "@laman/contracts";
import { readRow } from "../content/kv.js";
import { parseStored } from "../db/documents.js";
import type { Db } from "../db/index.js";
import type { Env } from "../env.js";
import { HttpError } from "../errors.js";
import { seal, unseal } from "../offsite/crypt.js";
import { describeError } from "../offsite/stores.js";
import {
  BUNDLED_BUCKETS,
  type Bucket,
  type MediaStore,
  type StoreSetup,
  s3MediaStore,
} from "./store.js";

export * from "./store.js";

/** The settings row an agency's own provider is kept in. */
export const MEDIA_STORAGE_ROW = "mediaStorage";

export type BundledConfig = {
  endpoint: string;
  accessKeyId: string;
  secret: string;
  /** Tests use buckets of their own; installs always use BUNDLED_BUCKETS. */
  buckets?: Record<Bucket, string>;
};

export async function readOwnSetup(db: Db) {
  return parseStored(MediaStorageStored, await readRow(db, MEDIA_STORAGE_ROW), "media storage");
}

/** An own provider's setup with its secret opened. */
export function ownSetup(stored: Omit<MediaStorageStored, "secret">, secret: string): StoreSetup {
  return {
    provider: stored.provider,
    endpoint: stored.endpoint,
    region: stored.region,
    pathStyle: stored.pathStyle,
    accessKeyId: stored.accessKeyId,
    secret,
    buckets: { private: stored.privateBucket, published: stored.publishedBucket },
    publicUrl: stored.publicUrl,
  };
}

/** The bundled store's address and keys, from the environment. */
export const bundledConfig = (env: Env, buckets?: Record<Bucket, string>): BundledConfig => ({
  endpoint: env.MEDIA_STORE_ENDPOINT,
  accessKeyId: env.MEDIA_STORE_ACCESS_KEY_ID,
  secret: env.MEDIA_STORE_SECRET_ACCESS_KEY,
  buckets,
});

/** The store a database names (the CLI's: a backup's copy, a restored database), opened. */
export const mediaStoreOf = (db: Db, env: Env) =>
  new MediaStorage(db, bundledConfig(env), env.BACKUP_SECRET_KEY).current();

export function bundledSetup(config: BundledConfig): StoreSetup {
  return {
    provider: "s3",
    endpoint: config.endpoint,
    region: "us-east-1",
    pathStyle: true,
    accessKeyId: config.accessKeyId,
    secret: config.secret,
    buckets: config.buckets ?? BUNDLED_BUCKETS,
    publicUrl: null,
  };
}

/** The store in use, read from site.db once and again after the setup changes. */
export class MediaStorage {
  readonly bundled: MediaStore;
  private cached: Promise<MediaStore> | undefined;
  private resolved: MediaStore | undefined;

  constructor(
    private readonly db: Db,
    bundled: BundledConfig,
    /** BACKUP_SECRET_KEY, which opens an own provider's secret. */
    readonly secretKey: string | undefined,
  ) {
    this.bundled = s3MediaStore("bundled", bundledSetup(bundled));
  }

  /** The store in use now. */
  current(): Promise<MediaStore> {
    this.cached ??= this.resolve().then(
      (store) => {
        this.resolved = store;
        return store;
      },
      (error: unknown) => {
        // Not cached, so the next request tries again (BACKUP_SECRET_KEY put right, say).
        this.cached = undefined;
        throw error;
      },
    );
    return this.cached;
  }

  /** The origin the admin's presigned links point at, for its CSP; null while they're the builder's own. */
  get linkOrigin() {
    return this.resolved?.linkOrigin ?? null;
  }

  /** After a setup is saved or removed. */
  reset() {
    this.cached = undefined;
    this.resolved = undefined;
  }

  private async resolve(): Promise<MediaStore> {
    const own = await readOwnSetup(this.db);
    if (!own) return this.bundled;
    if (!this.secretKey)
      throw new HttpError(
        503,
        "media_storage_unreadable",
        "The media library is in the agency's own storage, but BACKUP_SECRET_KEY isn't set, so its secret key can't be opened. Set the same BACKUP_SECRET_KEY the site was set up with.",
      );
    let secret: string;
    try {
      secret = unseal(own.secret, this.secretKey);
    } catch {
      throw new HttpError(
        503,
        "media_storage_unreadable",
        "The media storage's secret key can't be opened: BACKUP_SECRET_KEY isn't the one it was saved with. Set the original BACKUP_SECRET_KEY.",
      );
    }
    return s3MediaStore("own", ownSetup(own, secret));
  }
}

/** Files in the library and in Recently deleted. */
export async function fileCounts(db: Db) {
  const row = await db
    .selectFrom("media")
    .select((eb) => [
      eb.fn.sum<number>(eb.case().when("deleted_at", "is", null).then(1).else(0).end()).as("live"),
      eb.fn
        .sum<number>(eb.case().when("deleted_at", "is not", null).then(1).else(0).end())
        .as("deleted"),
    ])
    .executeTakeFirstOrThrow();
  return { live: Number(row.live ?? 0), deleted: Number(row.deleted ?? 0) };
}

const withoutSecret = ({ secret: _secret, ...fields }: MediaStorageStored) => fields;

/** What Settings shows: never the secret. */
export async function mediaStorageView(
  db: Db,
  secretKey: string | undefined,
  offsite: boolean,
): Promise<MediaStorageView> {
  const own = await readOwnSetup(db);
  return {
    store: own ? "own" : "bundled",
    own: own ? { ...withoutSecret(own), secretSaved: true } : null,
    canSave: Boolean(secretKey),
    files: await fileCounts(db),
    offsite,
  };
}

/** Refuses a change of store while the library has live files. */
export async function assertUnlocked(db: Db) {
  const { live } = await fileCounts(db);
  if (live)
    throw new HttpError(
      409,
      "media_storage_locked",
      `The media library has ${live} ${live === 1 ? "file" : "files"}, so its storage can't change: Laman never copies files between stores. Delete them first, or keep this storage.`,
      { live },
    );
}

/** Only the keys or the published files' address differ: the same buckets, so no files move. */
export function sameStore(stored: Omit<MediaStorageStored, "secret">, save: MediaStorageSave) {
  return (
    stored.provider === save.provider &&
    stored.endpoint === save.endpoint &&
    stored.region === save.region &&
    stored.pathStyle === save.pathStyle &&
    stored.privateBucket === save.privateBucket &&
    stored.publishedBucket === save.publishedBucket
  );
}

/** A save as it's kept: the secret sealed, or the saved one kept (`secretOf` has checked there is one). */
export const storedOf = (
  before: MediaStorageStored | undefined,
  { secret, ...fields }: MediaStorageSave,
  secretKey: string,
): MediaStorageStored => ({ ...fields, secret: secret ? seal(secret, secretKey) : before!.secret });

/** The secret a test or save uses: the one typed, or the saved one opened. */
export function secretOf(
  before: MediaStorageStored | undefined,
  save: MediaStorageSave,
  secretKey: string,
) {
  if (save.secret) return save.secret;
  if (!before || before.provider !== save.provider)
    throw new HttpError(
      422,
      "media_storage_secret_missing",
      "Enter the secret access key for this storage service.",
    );
  try {
    return unseal(before.secret, secretKey);
  } catch {
    throw new HttpError(
      422,
      "media_storage_secret_missing",
      "The saved secret key can't be opened with this BACKUP_SECRET_KEY. Enter it again.",
    );
  }
}

/**
 * Writes, reads back, lists and deletes a small object in each bucket: the
 * media store does all four, so keys that can't delete fail.
 */
export async function testMediaStore(store: MediaStore): Promise<MediaStorageTestResult> {
  for (const bucket of ["private", "published"] as const) {
    const key = `laman-connection-test-${randomUUID()}.txt`;
    try {
      await store.put(bucket, key, Buffer.from("Laman connection test\n"), "text/plain");
      await store.read(bucket, key);
      await store.list(bucket, "laman-connection-test-");
      await store.delete(bucket, [key]);
    } catch (error) {
      return { ok: false, bucket, error: describeError(error) };
    }
  }
  return { ok: true, bucket: null, error: null };
}
