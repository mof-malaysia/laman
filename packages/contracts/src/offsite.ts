/**
 * Off-site copies of backups (docs/site-builder.md § Off-site copies): each
 * archive the builder makes is also uploaded to an S3-compatible bucket or an
 * Azure Blob Storage container. Settings → Backups edits them; the secret key
 * and the encryption passphrase are stored sealed and never sent back.
 */
import { z } from "zod";

/** Where the copies go. `s3` is any other S3-compatible service. */
export const OffsiteProvider = z.enum(["aws", "r2", "wasabi", "minio", "s3", "azure"]);
export type OffsiteProvider = z.infer<typeof OffsiteProvider>;

/**
 * The folder a copy goes in, which the bucket's lifecycle rules expire at
 * their own age: scheduled backups in `daily`, the first of each Malaysian
 * month in `monthly`, Back up now in `manual`, the database copy made before
 * an upgrade in `upgrade`.
 */
export const OffsiteFolder = z.enum(["daily", "monthly", "manual", "upgrade"]);
export type OffsiteFolder = z.infer<typeof OffsiteFolder>;

/** Days each folder's copies are kept: the suggested lifecycle rules, and what the builder deletes by when it tidies up itself. */
export const offsiteKeepDays: Record<OffsiteFolder, number> = {
  daily: 30,
  monthly: 365,
  manual: 30,
  upgrade: 90,
};

/** Providers whose address the builder needs to be told. */
export const needsEndpoint = (provider: OffsiteProvider) =>
  provider === "r2" || provider === "minio" || provider === "s3";

/** Providers whose region the builder needs to be told. */
export const needsRegion = (provider: OffsiteProvider) =>
  provider === "aws" || provider === "wasabi" || provider === "s3";

/** S3 bucket and Azure container names: lowercase letters, numbers, dots and hyphens. */
const BucketName = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
    "Use 3–63 lowercase letters, numbers, dots or hyphens",
  );

/** A folder inside the bucket, stored with no slash at either end. */
const Prefix = z
  .string()
  .trim()
  .transform((p) => p.replace(/^\/+|\/+$/g, ""))
  .pipe(
    z
      .string()
      .max(200)
      .regex(
        /^([A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*)?$/,
        "Use letters, numbers, dots, hyphens, underscores and slashes",
      ),
  );

const fields = {
  enabled: z.boolean(),
  provider: OffsiteProvider,
  /** The service's address; "" for AWS, Wasabi and Azure, whose address follows from the rest. */
  endpoint: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
  /** "" where the provider doesn't need one (R2 is always "auto"). */
  region: z
    .string()
    .trim()
    .regex(/^([a-z0-9-]{2,40})?$/, "Use a region like ap-southeast-1"),
  /** The bucket, or the Azure container. */
  bucket: z.union([z.literal(""), BucketName]),
  prefix: Prefix,
  /** The access key ID, or the Azure storage account name. */
  accessKeyId: z.string().trim().max(256),
  /** Path-style addresses (`endpoint/bucket/key`), for MinIO and most self-hosted services. */
  pathStyle: z.boolean(),
  /** The builder deletes copies past `offsiteKeepDays` itself; needs keys that can delete. */
  prune: z.boolean(),
  /** Archives are encrypted with the passphrase before they leave the server. */
  encrypt: z.boolean(),
};

/** The off-site settings as Settings shows them: secrets are only ever "saved" or not. */
export const OffsiteSettings = z.object({
  ...fields,
  /** A secret key (or Azure account key or SAS token) is saved. */
  secretSaved: z.boolean(),
  /** A short code that tells passphrases apart without revealing them; null when none is saved. */
  passphraseFingerprint: z.string().nullable(),
  /** BACKUP_SECRET_KEY is set on the server: without it nothing can be saved. */
  canSave: z.boolean(),
});
export type OffsiteSettings = z.infer<typeof OffsiteSettings>;

/**
 * A save or a connection test. `secret` and `passphrase` replace the saved
 * ones when given and keep them when left out.
 */
export const OffsiteSettingsSave = z
  .object({
    ...fields,
    secret: z.string().trim().min(1).max(4096).optional(),
    passphrase: z.string().min(12, "Use at least 12 characters").max(1024).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) return;
    const missing = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (!value.bucket)
      missing("bucket", value.provider === "azure" ? "Enter the container" : "Enter the bucket");
    if (!value.accessKeyId)
      missing(
        "accessKeyId",
        value.provider === "azure" ? "Enter the storage account name" : "Enter the access key ID",
      );
    if (needsEndpoint(value.provider) && !value.endpoint)
      missing("endpoint", "Enter the endpoint address");
    if (needsRegion(value.provider) && !value.region) missing("region", "Enter the region");
  });
export type OffsiteSettingsSave = z.infer<typeof OffsiteSettingsSave>;

/**
 * How the off-site settings are kept in site.db (the `offsite` settings row).
 * `secret` and `passphrase` are sealed with BACKUP_SECRET_KEY, which isn't in
 * the database, so a backup archive doesn't carry them readable.
 */
export const OffsiteStored = z.object({
  ...fields,
  secret: z.string().nullable(),
  passphrase: z.string().nullable(),
  passphraseFingerprint: z.string().nullable(),
});
export type OffsiteStored = z.infer<typeof OffsiteStored>;

/** What Test connection found. */
export const OffsiteTestResult = z.object({
  ok: z.boolean(),
  /** The keys can delete too: null when the test didn't get that far. */
  canDelete: z.boolean().nullable(),
  /** Why it failed, in words. */
  error: z.string().nullable(),
});
export type OffsiteTestResult = z.infer<typeof OffsiteTestResult>;

/** A job that copies one archive in BACKUP_DIR off-site. */
export const BackupUploadPayload = z.object({
  /** The archive's file name in BACKUP_DIR. */
  file: z.string(),
  folder: OffsiteFolder,
  trigger: z.string().optional(),
});
export type BackupUploadPayload = z.infer<typeof BackupUploadPayload>;

/** A job that downloads the newest off-site copy and checks it as a restore would. */
export const BackupVerifyPayload = z.object({ trigger: z.string().optional() });
export type BackupVerifyPayload = z.infer<typeof BackupVerifyPayload>;

/** How the off-site copies stand, for the summary. */
export const OffsiteStatus = z.object({
  provider: OffsiteProvider,
  bucket: z.string(),
  encrypt: z.boolean(),
  /** The newest copy made. */
  last: z.object({ at: z.string(), file: z.string(), folder: OffsiteFolder }).nullable(),
  /** An upload that failed after the newest copy was made. */
  failed: z.object({ at: z.string(), error: z.string() }).nullable(),
  /** An upload is queued or running. */
  running: z.boolean(),
  /** The archives in BACKUP_DIR that have a copy off-site. */
  copied: z.array(z.string()),
  /** The last check of the newest copy: downloaded and opened as a restore would. */
  verified: z.object({ at: z.string(), ok: z.boolean(), error: z.string().nullable() }).nullable(),
});
export type OffsiteStatus = z.infer<typeof OffsiteStatus>;
