/**
 * The media store: where the media library's files are, always S3-compatible
 * object storage (docs/laman.md § Media storage). Two buckets, both private:
 *
 * - **private**: uploads (`media/<id>/original.<ext>`), their WebP sizes
 *   (`media/<id>/w<width>.webp`), and the file before the last replace
 *   (`previous/<id>/…`). The admin, the canvas and previews open them through
 *   presigned links that last minutes.
 * - **published**: copies of the files live pages use, at the same keys, put
 *   there by each publish. Visitors reach them through the builder's
 *   `/media/*` (the bundled store) or the agency's CDN (its own provider).
 *
 * Nothing about media is written under DATA_DIR.
 */
import type { Readable } from "node:stream";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { inPool } from "../files.js";
import { s3Address, s3Client, statusOf } from "../offsite/stores.js";
import type { StoreConfig } from "../offsite/stores.js";
import { presignGet } from "./presign.js";

export type Bucket = "private" | "published";

/** The bundled store's buckets: fixed, and made on boot when they're missing. */
export const BUNDLED_BUCKETS: Record<Bucket, string> = {
  private: "laman-media",
  published: "laman-published",
};

/** Where the builder passes presigned links through to the bundled store, which is on the Compose network only. */
export const STORE_PATH = "/media-store";

/** How long a link the admin is given works, and the window its signing time is rounded to. */
export const LINK_SECONDS = 30 * 60;
const LINK_WINDOW_MS = 5 * 60_000;

export type StoredObject = { key: string; bytes: number; etag: string };

export type StoreSetup = Omit<StoreConfig, "bucket"> & {
  buckets: Record<Bucket, string>;
  /** Published files' address: null on the bundled store, where the builder serves `/media/*`. */
  publicUrl: string | null;
};

export interface MediaStore {
  readonly kind: "bundled" | "own";
  readonly buckets: Record<Bucket, string>;
  /** The origin presigned links point at, for the admin's CSP; null when they're the builder's own. */
  readonly linkOrigin: string | null;
  put(bucket: Bucket, key: string, body: Buffer, type: string): Promise<void>;
  read(bucket: Bucket, key: string): Promise<Buffer>;
  /** An object to send on, honouring Range and If-None-Match; null when there's no such object. */
  open(
    bucket: Bucket,
    key: string,
    conditions?: { range?: string | undefined; ifNoneMatch?: string | undefined },
  ): Promise<OpenedObject | null>;
  copy(from: Bucket, fromKey: string, to: Bucket, toKey: string): Promise<void>;
  list(bucket: Bucket, prefix: string): Promise<StoredObject[]>;
  delete(bucket: Bucket, keys: string[]): Promise<void>;
  /**
   * A link that opens a private file for LINK_SECONDS. Signed from the start
   * of a five-minute window, or from `since` when that's later (a replace),
   * so the browser can cache it.
   */
  link(bucket: Bucket, key: string, since?: Date): string;
  /** Where visitors fetch a published file at `path` ("/media/<id>/<file>?v=…"). */
  publicLink(path: string): string;
  /** Makes the buckets when they're missing: the bundled store's first boot. */
  ensureBuckets(): Promise<void>;
}

export type OpenedObject = {
  status: number;
  body: Readable | null;
  headers: Record<string, string>;
};

/** Headers worth passing on from the store to the browser. */
export const PASSED = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

export function s3MediaStore(kind: "bundled" | "own", setup: StoreSetup): MediaStore {
  const client = s3Client(setup);
  const address = s3Address(setup);
  // AWS's own endpoint follows from the region; the others are given.
  const endpoint =
    address.endpoint ??
    (setup.region === "us-east-1"
      ? "https://s3.amazonaws.com"
      : `https://s3.${setup.region}.amazonaws.com`);
  const signer = {
    endpoint,
    region: address.region,
    pathStyle: address.pathStyle,
    accessKeyId: setup.accessKeyId,
    secret: setup.secret,
  };
  const name = (bucket: Bucket) => setup.buckets[bucket];

  return {
    kind,
    buckets: setup.buckets,
    linkOrigin:
      kind === "bundled" ? null : new URL(presignGet(signer, name("private"), "x", 1)).origin,

    async put(bucket, key, body, type) {
      await client.send(
        new PutObjectCommand({ Bucket: name(bucket), Key: key, Body: body, ContentType: type }),
      );
    },

    async read(bucket, key) {
      const object = await client.send(new GetObjectCommand({ Bucket: name(bucket), Key: key }));
      return Buffer.from(await object.Body!.transformToByteArray());
    },

    async open(bucket, key, conditions = {}) {
      try {
        const object = await client.send(
          new GetObjectCommand({
            Bucket: name(bucket),
            Key: key,
            Range: conditions.range,
            IfNoneMatch: conditions.ifNoneMatch,
          }),
        );
        const headers: Record<string, string> = {};
        const raw = {
          "content-type": object.ContentType,
          "content-length": object.ContentLength?.toString(),
          "content-range": object.ContentRange,
          "accept-ranges": object.AcceptRanges,
          etag: object.ETag,
          "last-modified": object.LastModified?.toUTCString(),
        };
        for (const header of PASSED) if (raw[header]) headers[header] = raw[header];
        return {
          status: object.ContentRange ? 206 : 200,
          body: object.Body as Readable,
          headers,
        };
      } catch (error) {
        const status = statusOf(error);
        if (status === 304) return { status: 304, body: null, headers: {} };
        if (status === 404) return null;
        if (status === 416) return { status: 416, body: null, headers: {} };
        throw error;
      }
    },

    async copy(from, fromKey, to, toKey) {
      await client.send(
        new CopyObjectCommand({
          Bucket: name(to),
          Key: toKey,
          CopySource: `${name(from)}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
        }),
      );
    },

    async list(bucket, prefix) {
      const out: StoredObject[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: name(bucket), Prefix: prefix, ContinuationToken }),
        );
        for (const item of page.Contents ?? [])
          if (item.Key) out.push({ key: item.Key, bytes: item.Size ?? 0, etag: item.ETag ?? "" });
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return out;
    },

    async delete(bucket, keys) {
      // One at a time rather than DeleteObjects, whose required checksum some services refuse.
      await inPool(keys, (Key) =>
        client.send(new DeleteObjectCommand({ Bucket: name(bucket), Key })),
      );
    },

    link(bucket, key, since) {
      const window = Math.floor(Date.now() / LINK_WINDOW_MS) * LINK_WINDOW_MS;
      const from =
        since && since.getTime() > window && since.getTime() <= Date.now() ? since : null;
      const signedAt = new Date(from ? Math.floor(from.getTime() / 1000) * 1000 : window);
      const url = presignGet(signer, name(bucket), key, LINK_SECONDS, signedAt);
      if (kind === "own") return url;
      // The bundled store isn't reachable from browsers: the builder passes the link through.
      const parsed = new URL(url);
      return `${STORE_PATH}${parsed.pathname}${parsed.search}`;
    },

    publicLink(path) {
      return setup.publicUrl ? `${setup.publicUrl}${path}` : path;
    },

    async ensureBuckets() {
      for (const bucket of Object.values(setup.buckets)) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          if (statusOf(error) !== 404) throw error;
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
      }
    },
  };
}

/** Every key under `prefix` in a bucket, deleted. */
export async function deletePrefix(store: MediaStore, bucket: Bucket, prefix: string) {
  const keys = (await store.list(bucket, prefix)).map((o) => o.key);
  if (keys.length) await store.delete(bucket, keys);
}

/** Every object under `from` moved to the same names under `to`, in the same bucket. */
export async function movePrefix(store: MediaStore, bucket: Bucket, from: string, to: string) {
  const objects = await store.list(bucket, from);
  for (const object of objects)
    await store.copy(bucket, object.key, bucket, to + object.key.slice(from.length));
  if (objects.length)
    await store.delete(
      bucket,
      objects.map((o) => o.key),
    );
}
