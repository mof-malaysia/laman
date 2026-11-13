/**
 * Where off-site copies go: one small interface, and an implementation for
 * S3-compatible services (AWS S3, Cloudflare R2, Wasabi, MinIO, others).
 *
 * Azure (parked): see docs/site-builder.md § Off-site copies, Azure Blob Storage (parked).
 * Azure doesn't speak S3, so it has a store of its own below, commented out
 * with its import. To bring it back: uncomment both, put "azure" back in
 * OffsiteProvider, and re-add @azure/storage-blob to the catalog and this
 * package.
 */
import { createReadStream, createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
// Azure (parked): import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { OffsiteProvider } from "@fiscal-sb/contracts";

export type RemoteObject = { key: string; bytes: number; at: string };

export interface RemoteStore {
  /** Uploads `file` as `key`, with its SHA-256 beside it. */
  put(key: string, file: string, sha256: string): Promise<void>;
  /** A small object from memory: Test connection's. */
  putText(key: string, text: string): Promise<void>;
  /** Its size and the SHA-256 it was uploaded with, or null when there's no such object. */
  head(key: string): Promise<{ bytes: number; sha256: string | null } | null>;
  /** Every object under `prefix`. */
  list(prefix: string): Promise<RemoteObject[]>;
  /** Downloads `key` into `file`. */
  get(key: string, file: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** What a store is made from: the saved settings with the secret opened. */
export type StoreConfig = {
  provider: OffsiteProvider;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secret: string;
  pathStyle: boolean;
};

/** Parts of 16 MB, four at a time: a 2 GB archive is 128 parts, well under S3's 10,000. */
const PART_BYTES = 16 * 1024 * 1024;
const PARALLEL = 4;
/** Long enough for a slow link, short enough that a dead one fails the job rather than hanging it. */
const TIMEOUT_MS = 120_000;

export function storeFor(config: StoreConfig): RemoteStore {
  // Azure (parked): config.provider === "azure" ? azureStore(config) : s3Store(config)
  return s3Store(config);
}

/** The S3 address each provider uses, and whether it wants path-style requests. */
function s3Address(config: StoreConfig) {
  switch (config.provider) {
    case "aws":
      return { endpoint: undefined, region: config.region, pathStyle: false };
    case "wasabi":
      return {
        endpoint: `https://s3.${config.region}.wasabisys.com`,
        region: config.region,
        pathStyle: false,
      };
    case "r2":
      return { endpoint: config.endpoint, region: "auto", pathStyle: false };
    case "minio":
      return { endpoint: config.endpoint, region: config.region || "us-east-1", pathStyle: true };
    default:
      return {
        endpoint: config.endpoint,
        region: config.region || "us-east-1",
        pathStyle: config.pathStyle,
      };
  }
}

function s3Store(config: StoreConfig): RemoteStore {
  const address = s3Address(config);
  const client = new S3Client({
    region: address.region,
    endpoint: address.endpoint,
    forcePathStyle: address.pathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secret },
    // R2 and several others reject the checksums newer SDKs add by default.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { requestTimeout: TIMEOUT_MS, connectionTimeout: 15_000 },
    maxAttempts: 3,
  });
  const Bucket = config.bucket;
  return {
    async put(key, file, sha256) {
      await new Upload({
        client,
        params: {
          Bucket,
          Key: key,
          Body: createReadStream(file),
          ContentType: "application/octet-stream",
          Metadata: { sha256 },
        },
        partSize: PART_BYTES,
        queueSize: PARALLEL,
        leavePartsOnError: false,
      }).done();
    },
    async putText(key, text) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: text,
          ContentType: "text/plain; charset=utf-8",
        }),
      );
    },
    async head(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { bytes: head.ContentLength ?? 0, sha256: head.Metadata?.sha256 ?? null };
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },
    async list(prefix) {
      const out: RemoteObject[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
        );
        for (const item of page.Contents ?? [])
          if (item.Key)
            out.push({
              key: item.Key,
              bytes: item.Size ?? 0,
              at: (item.LastModified ?? new Date(0)).toISOString(),
            });
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return out;
    },
    async get(key, file) {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      await pipeline(object.Body as Readable, createWriteStream(file, { mode: 0o600 }));
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

// Azure (parked): the store, as it was tested against Azurite.
// /**
//  * Azure: the account name and either an account key or a SAS token (one that
//  * can create, write and list, and not delete, is the safer choice). A SAS is
//  * told apart by its `sig=`.
//  */
// function azureStore(config: StoreConfig): RemoteStore {
//   const base = (config.endpoint || `https://${config.accessKeyId}.blob.core.windows.net`).replace(
//     /\/+$/,
//     "",
//   );
//   const sas = /(^|[?&])sig=/.test(config.secret);
//   const service = sas
//     ? new BlobServiceClient(`${base}?${config.secret.replace(/^\?/, "")}`)
//     : new BlobServiceClient(
//         base,
//         new StorageSharedKeyCredential(config.accessKeyId, config.secret),
//       );
//   const container = service.getContainerClient(config.bucket);
//   return {
//     async put(key, file, sha256) {
//       await container.getBlockBlobClient(key).uploadFile(file, {
//         blockSize: PART_BYTES,
//         concurrency: PARALLEL,
//         metadata: { sha256 },
//         blobHTTPHeaders: { blobContentType: "application/octet-stream" },
//       });
//     },
//     async putText(key, text) {
//       await container.getBlockBlobClient(key).upload(text, Buffer.byteLength(text), {
//         blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" },
//       });
//     },
//     async head(key) {
//       try {
//         const props = await container.getBlobClient(key).getProperties();
//         return { bytes: props.contentLength ?? 0, sha256: props.metadata?.sha256 ?? null };
//       } catch (error) {
//         if (statusOf(error) === 404) return null;
//         throw error;
//       }
//     },
//     async list(prefix) {
//       const out: RemoteObject[] = [];
//       for await (const blob of container.listBlobsFlat({ prefix }))
//         out.push({
//           key: blob.name,
//           bytes: blob.properties.contentLength ?? 0,
//           at: (blob.properties.lastModified ?? new Date(0)).toISOString(),
//         });
//       return out;
//     },
//     async get(key, file) {
//       await container.getBlobClient(key).downloadToFile(file);
//     },
//     async delete(key) {
//       await container.getBlobClient(key).delete();
//     },
//   };
// }

/** The HTTP status an SDK error carries, when it has one. */
export function statusOf(error: unknown): number | undefined {
  const e = error as { $metadata?: { httpStatusCode?: number }; statusCode?: number };
  return e?.$metadata?.httpStatusCode ?? e?.statusCode;
}

/** An SDK or network error in words an ICT administrator can act on. */
export function describeError(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string };
  const code = e?.code ?? e?.name ?? "";
  const status = statusOf(error);
  const known: Record<string, string> = {
    ENOTFOUND: "The endpoint address couldn't be found. Check the endpoint and the region.",
    ECONNREFUSED: "The endpoint refused the connection. Check its address and port.",
    ETIMEDOUT: "The storage service didn't answer in time.",
    TimeoutError: "The storage service didn't answer in time.",
    NoSuchBucket: "There's no bucket by that name. Check its name and the region.",
    ContainerNotFound: "There's no container by that name in that storage account.",
    InvalidAccessKeyId: "The access key ID isn't recognised.",
    SignatureDoesNotMatch: "The secret key doesn't match the access key ID.",
    AuthenticationFailed: "The account key or SAS token was refused.",
    AuthorizationPermissionMismatch: "The SAS token doesn't allow this.",
    AccessDenied: "The keys aren't allowed to do this in that bucket.",
    PermanentRedirect: "The bucket is in another region. Check the region.",
    AuthorizationHeaderMalformed: "The region doesn't match the bucket's. Check the region.",
  };
  if (known[code]) return known[code];
  if (status === 403) return "The keys aren't allowed to do this in that bucket.";
  if (status === 404) return "The bucket or container wasn't found.";
  return (e?.message || String(error)).slice(0, 500);
}
