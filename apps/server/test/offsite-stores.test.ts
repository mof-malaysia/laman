/**
 * The real store implementation against a local stand-in, MinIO. Skipped
 * unless it's running:
 *
 *   docker run -d --rm -p 9100:9000 -e MINIO_ROOT_USER=laman \
 *     -e MINIO_ROOT_PASSWORD=laman-secret-key minio/minio server /data
 *   OFFSITE_TEST_S3=http://127.0.0.1:9100 \
 *     pnpm --filter @fiscal-sb/server test offsite-stores
 *
 * Azure (parked): the Azure tests below ran against Azurite, Microsoft's
 * emulator, with OFFSITE_TEST_AZURE=http://127.0.0.1:10100 and
 *   docker run -d --rm -p 10100:10000 mcr.microsoft.com/azure-storage/azurite \
 *     azurite-blob --blobHost 0.0.0.0 --skipApiVersionCheck
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
// Azure (parked):
// import {
//   AccountSASPermissions,
//   BlobServiceClient,
//   StorageSharedKeyCredential,
// } from "@azure/storage-blob";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import {
  fetchRemote,
  listRemote,
  offsiteDefaults,
  testConnection,
  uploadArchive,
} from "../src/offsite/index.js";
import { type StoreConfig, storeFor } from "../src/offsite/stores.js";

const s3Endpoint = process.env.OFFSITE_TEST_S3;
// Azure (parked):
// const azureEndpoint = process.env.OFFSITE_TEST_AZURE;
// /** Azurite's well-known development account. */
// const AZURITE = {
//   account: "devstoreaccount1",
//   key: "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
// };

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "laman-stores-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Uploads a 20 MB archive (more than one part), lists, fetches and deletes it. */
async function roundTrip(config: StoreConfig) {
  const store = storeFor(config);
  expect(await testConnection(store, "laman")).toEqual({ ok: true, canDelete: true, error: null });

  const backupDir = await mkdtemp(join(root, "backups-"));
  const file = `laman-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.tar.gz`;
  const data = randomBytes(20 * 1024 * 1024 + 123);
  await writeFile(join(backupDir, file), data);
  const stored = { ...offsiteDefaults, enabled: true, prefix: "laman", encrypt: true };
  const passphrase = "a passphrase for the store test";
  const { seal } = await import("../src/offsite/crypt.js");
  const secretKey = "x".repeat(32);
  stored.passphrase = seal(passphrase, secretKey);
  const copy = await uploadArchive({ store, stored, secretKey, backupDir, file, folder: "daily" });
  expect(copy.key).toBe(`laman/daily/${file}.enc`);

  const [listed] = await listRemote(store, "laman");
  expect(listed).toMatchObject({
    key: copy.key,
    file,
    folder: "daily",
    encrypted: true,
    bytes: copy.bytes,
  });
  const into = await mkdtemp(join(root, "fetched-"));
  const fetched = await fetchRemote(store, listed!, into, () => passphrase);
  expect((await readFile(fetched)).equals(data)).toBe(true);

  await store.delete(copy.key);
  expect(await store.head(copy.key)).toBeNull();
}

describe.skipIf(!s3Endpoint)("S3-compatible store (MinIO)", () => {
  it("uploads in parts, lists, downloads and deletes", async () => {
    const bucket = `laman-${randomUUID().slice(0, 8)}`;
    const credentials = { accessKeyId: "laman", secretAccessKey: "laman-secret-key" };
    await new S3Client({
      region: "us-east-1",
      endpoint: s3Endpoint,
      forcePathStyle: true,
      credentials,
    }).send(new CreateBucketCommand({ Bucket: bucket }));
    await roundTrip({
      provider: "minio",
      endpoint: s3Endpoint!,
      region: "",
      bucket,
      accessKeyId: credentials.accessKeyId,
      secret: credentials.secretAccessKey,
      pathStyle: true,
    });
  }, 60_000);

  it("says what's wrong with bad keys", async () => {
    const store = storeFor({
      provider: "minio",
      endpoint: s3Endpoint!,
      region: "",
      bucket: "nowhere",
      accessKeyId: "laman",
      secret: "not-the-secret",
      pathStyle: true,
    });
    const result = await testConnection(store, "");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/secret key doesn't match|isn't recognised|bucket/);
  }, 30_000);
});

// Azure (parked):
// describe.skipIf(!azureEndpoint)("Azure Blob store (Azurite)", () => {
//   it("uploads in blocks, lists, downloads and deletes", async () => {
//     const container = `laman-${randomUUID().slice(0, 8)}`;
//     const endpoint = `${azureEndpoint}/${AZURITE.account}`;
//     await new BlobServiceClient(
//       endpoint,
//       new StorageSharedKeyCredential(AZURITE.account, AZURITE.key),
//     )
//       .getContainerClient(container)
//       .create();
//     await roundTrip({
//       provider: "azure",
//       endpoint,
//       region: "",
//       bucket: container,
//       accessKeyId: AZURITE.account,
//       secret: AZURITE.key,
//       pathStyle: false,
//     });
//   }, 60_000);
//
//   it("takes a SAS token, and reports one that can't delete", async () => {
//     const container = `laman-${randomUUID().slice(0, 8)}`;
//     const endpoint = `${azureEndpoint}/${AZURITE.account}`;
//     const credential = new StorageSharedKeyCredential(AZURITE.account, AZURITE.key);
//     const service = new BlobServiceClient(endpoint, credential);
//     await service.getContainerClient(container).create();
//     // Create, write, list and read: no delete.
//     const url = service.generateAccountSasUrl(
//       new Date(Date.now() + 3_600_000),
//       AccountSASPermissions.parse("rwlc"),
//       "co",
//     );
//     const sas = new URL(url).search.slice(1);
//     const store = storeFor({
//       provider: "azure",
//       endpoint,
//       region: "",
//       bucket: container,
//       accessKeyId: AZURITE.account,
//       secret: sas,
//       pathStyle: false,
//     });
//     expect(await testConnection(store, "")).toEqual({ ok: true, canDelete: false, error: null });
//   }, 30_000);
// });
