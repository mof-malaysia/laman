/**
 * Where the media library is kept (docs/laman.md § Media storage). Always
 * S3-compatible object storage: the store bundled with Laman (RustFS, set by
 * environment variables), or the agency's own provider, set up here by the
 * super admin. Every bucket is private. The setup can't change while the
 * library has live files: Laman never copies media between stores.
 */
import { z } from "zod";
import {
  BucketName,
  OffsiteProvider,
  StorageEndpoint,
  StorageRegion,
  needsEndpoint,
  needsRegion,
} from "./offsite.js";

const fields = {
  provider: OffsiteProvider,
  endpoint: StorageEndpoint,
  region: StorageRegion,
  /** Path-style addresses (`endpoint/bucket/key`), for MinIO and most self-hosted services. */
  pathStyle: z.boolean(),
  /** Uploads, their WebP sizes and the file before each replace. */
  privateBucket: BucketName,
  /** The files live pages use, copied there by each publish. */
  publishedBucket: BucketName,
  /**
   * Where visitors' browsers fetch the published files: a CDN with origin
   * access to the published bucket, or the bucket's own address when it's
   * public-read. Published pages link to `<publicUrl>/media/<id>/<file>`.
   */
  publicUrl: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, "")),
  accessKeyId: z.string().trim().min(1, "Enter the access key ID").max(256),
};

/** What the super admin enters. `secret` replaces the saved one when given, and keeps it when left out. */
export const MediaStorageSave = z
  .object({ ...fields, secret: z.string().trim().min(1).max(4096).optional() })
  .superRefine((value, ctx) => {
    const missing = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (needsEndpoint(value.provider) && !value.endpoint)
      missing("endpoint", "Enter the endpoint address");
    if (needsRegion(value.provider) && !value.region) missing("region", "Enter the region");
    if (value.privateBucket === value.publishedBucket)
      missing("publishedBucket", "Use a different bucket from the private one");
  });
export type MediaStorageSave = z.infer<typeof MediaStorageSave>;

/** How an agency's own provider is kept in site.db (the `mediaStorage` settings row): the secret sealed with BACKUP_SECRET_KEY. */
export const MediaStorageStored = z.object({ ...fields, secret: z.string() });
export type MediaStorageStored = z.infer<typeof MediaStorageStored>;

/** The agency's own provider as Settings shows it: the secret is only ever "saved". */
export const OwnMediaStorage = z.object({ ...fields, secretSaved: z.boolean() });
export type OwnMediaStorage = z.infer<typeof OwnMediaStorage>;

export const MediaStorage = z.object({
  /** `bundled`: the store that ships with Laman. `own`: the agency's provider below. */
  store: z.enum(["bundled", "own"]),
  own: OwnMediaStorage.nullable(),
  /** BACKUP_SECRET_KEY is set on the server: without it no setup can be saved. */
  canSave: z.boolean(),
  /** Files in the library and in Recently deleted. Live files lock the setup. */
  files: z.object({ live: z.number().int(), deleted: z.number().int() }),
  /** Off-site backups are on: on the bundled store, the media is copied there after each backup. */
  offsite: z.boolean(),
});
export type MediaStorage = z.infer<typeof MediaStorage>;

/** What Test connection found, in words an ICT administrator can act on. */
export const MediaStorageTestResult = z.object({
  ok: z.boolean(),
  /** Which bucket failed, when one did. */
  bucket: z.enum(["private", "published"]).nullable(),
  error: z.string().nullable(),
});
export type MediaStorageTestResult = z.infer<typeof MediaStorageTestResult>;
