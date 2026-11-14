/**
 * Upload links (docs/mcp.md § Media): `start_upload` gives an agent a URL it
 * posts the original file to (`curl -F file=@photo.jpg <url>`), so a large
 * image needn't be base64 in a tool call, where agents tend to shrink it
 * first. Each link is random, works once, lasts a few minutes and lives only
 * in this process's memory; only its hash is kept. Using it uploads through
 * /api/media as the officer, after checking the connection is still open.
 */
import type { UpdateMediaBody } from "@laman/contracts";
import type { z } from "zod";
import { hashToken, newToken } from "../auth/tokens.js";
import type { Api } from "./tool.js";

export const UPLOAD_LINK_MS = 15 * 60 * 1000;
/** Links an officer's connections can hold open at once; the oldest goes first. */
const PER_CONNECTION = 20;

export type UploadLink = {
  connectionId: string;
  userId: string;
  /** Alt text and the rest, applied once the file is in. */
  details: Partial<z.infer<typeof UpdateMediaBody>>;
  expiresAt: number;
};

const links = new Map<string, UploadLink>();

export function issueUploadLink(link: Omit<UploadLink, "expiresAt">) {
  const at = Date.now();
  for (const [key, old] of links) if (old.expiresAt < at) links.delete(key);
  const mine = [...links].filter(([, l]) => l.connectionId === link.connectionId);
  for (const [key] of mine.slice(0, Math.max(0, mine.length - PER_CONNECTION + 1)))
    links.delete(key);
  const token = newToken();
  const expiresAt = at + UPLOAD_LINK_MS;
  links.set(hashToken(token), { ...link, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

/** The link a token opens, spent; undefined when it's unknown, used or out of time. */
export function takeUploadLink(token: string) {
  const key = hashToken(token);
  const link = links.get(key);
  links.delete(key);
  return link && link.expiresAt >= Date.now() ? link : undefined;
}

/**
 * A file into the media library as the officer, then its alt text and the
 * rest: upload_media and upload links both add files this way.
 */
export async function addMedia(
  api: Api,
  filename: string,
  bytes: Buffer,
  details: UploadLink["details"],
) {
  const media = (await api.upload("/api/media", filename, bytes)) as { id: string };
  return Object.keys(details).length ? api.patch(`/api/media/${media.id}`, details) : media;
}
