/** One file in a multipart/form-data body: reading the one a request sent, and writing one to send. */
import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { HttpError } from "./errors.js";

export function multipartFile(filename: string, bytes: Buffer) {
  // Random, so no file's bytes happen to contain it.
  const boundary = `----laman${randomBytes(12).toString("hex")}`;
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

/** The one file in a multipart request, read into memory (files are capped by MEDIA_MAX_MB). */
export async function readUpload(request: FastifyRequest) {
  const file = await request.file();
  if (!file) throw new HttpError(400, "file_missing", "Choose a file to upload");
  const bytes = await file.toBuffer().catch((error: { code?: string }) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE")
      throw new HttpError(413, "file_too_large", "The file is too large");
    throw error;
  });
  return { filename: file.filename, bytes };
}
