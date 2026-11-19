import { DeleteObjectCommand, ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ensureRustfs } from "../scripts/rustfs.js";
import { DEV_MEDIA_STORE } from "../src/env.js";
import { s3Client } from "../src/offsite/stores.js";

/**
 * The media store the tests run against: the dev RustFS container, started
 * when it isn't running. The tests' own buckets (laman-test-*) start empty.
 */
export default async function setup() {
  await ensureRustfs();
  const client = s3Client({
    provider: "minio",
    endpoint: DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT,
    region: "us-east-1",
    pathStyle: true,
    accessKeyId: DEV_MEDIA_STORE.MEDIA_STORE_ACCESS_KEY_ID,
    secret: DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY,
  });
  const { Buckets = [] } = await client.send(new ListBucketsCommand({}));
  for (const { Name: Bucket } of Buckets) {
    if (!Bucket?.startsWith("laman-test-")) continue;
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket, ContinuationToken: token }),
      );
      await Promise.all(
        (page.Contents ?? []).map(({ Key }) =>
          client.send(new DeleteObjectCommand({ Bucket, Key })),
        ),
      );
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  client.destroy();
}
