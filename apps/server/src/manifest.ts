/**
 * What a publish leaves beside the site so the next one can skip what hasn't
 * changed: every file it wrote, with a fingerprint of what went into it. It
 * lives in the published folder and is swapped in with it, so the files and
 * the fingerprints describing them always match.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** The manifest's address in the published folder; the public server never serves it. */
export const MANIFEST_DIR = ".publish";
export const MANIFEST_FILE = `${MANIFEST_DIR}/manifest.json`;

export type Manifest = {
  version: 1;
  /** Each file's path in the folder ("berita/index.html"), and its fingerprint. */
  outputs: Record<string, string>;
};

/** JSON with object keys sorted, so the same value always gives the same text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export const fingerprint = (...parts: (string | Uint8Array)[]) => {
  const hash = createHash("sha256");
  parts.forEach((part, i) => hash.update(i ? "\0" : "").update(part));
  return hash.digest("base64url");
};

/** The manifest in `dir`, or undefined when there's none or it can't be read. */
export async function readManifest(dir: string): Promise<Manifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")) as Manifest;
    return parsed.version === 1 && parsed.outputs && typeof parsed.outputs === "object"
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
export async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
    .toSorted();
}
