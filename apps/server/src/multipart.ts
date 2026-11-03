/** One file as a multipart/form-data body, as the media library's upload reads it. */
import { randomBytes } from "node:crypto";

export function multipartFile(filename: string, bytes: Buffer) {
  // Random, so no file's bytes happen to contain it.
  const boundary = `----sitebuilder${randomBytes(12).toString("hex")}`;
  const name = filename.replace(/["\r\n]/g, "_");
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
