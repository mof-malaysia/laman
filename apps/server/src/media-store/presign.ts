/**
 * Presigned GET links (AWS Signature Version 4, query-string form): what the
 * admin, the canvas and previews open private files with. Written here rather
 * than taken from @aws-sdk/s3-request-presigner: it is one small, published
 * algorithm, and signing needs no network.
 *
 * A link's signing time is rounded down to a window, so the same file gets the
 * same link for a few minutes and the browser's cache keeps working; a file
 * replaced since signs from its replace time, so its link changes at once.
 */
import { createHash, createHmac } from "node:crypto";

export type PresignAddress = {
  /** "https://s3.ap-southeast-1.amazonaws.com", or the service's own address. */
  endpoint: string;
  region: string;
  /** `endpoint/bucket/key` rather than `bucket.endpoint/key`. */
  pathStyle: boolean;
  accessKeyId: string;
  secret: string;
};

const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** RFC 3986 encoding, as SigV4 wants it: everything but unreserved characters. */
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** 20261118T020500Z */
const amzDate = (at: Date) =>
  at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** The URL the object is at, before signing: its host and its path. */
export function objectUrl(
  address: Pick<PresignAddress, "endpoint" | "pathStyle">,
  bucket: string,
  key: string,
) {
  const base = new URL(address.endpoint);
  const path = key.split("/").map(encode).join("/");
  const prefix = base.pathname.replace(/\/+$/, "");
  if (address.pathStyle) return new URL(`${base.origin}${prefix}/${bucket}/${path}`);
  return new URL(`${base.protocol}//${bucket}.${base.host}${prefix}/${path}`);
}

/**
 * A link that opens `bucket/key` with GET until `signedAt + seconds`.
 * `signedAt` defaults to now; pass a rounded time to keep links stable.
 */
export function presignGet(
  address: PresignAddress,
  bucket: string,
  key: string,
  seconds: number,
  signedAt = new Date(),
) {
  const url = objectUrl(address, bucket, key);
  const time = amzDate(signedAt);
  const day = time.slice(0, 8);
  const scope = `${day}/${address.region}/s3/aws4_request`;
  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${address.accessKeyId}/${scope}`],
    ["X-Amz-Date", time],
    ["X-Amz-Expires", String(seconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = query
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .toSorted()
    .join("&");
  const canonical = [
    "GET",
    url.pathname,
    canonicalQuery,
    `host:${url.host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", time, scope, sha256(canonical)].join("\n");
  let signingKey = hmac(`AWS4${address.secret}`, day);
  for (const part of [address.region, "s3", "aws4_request"]) signingKey = hmac(signingKey, part);
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
