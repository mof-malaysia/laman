/**
 * The media library. Each file lives in DATA_DIR/media/<id>/: the original
 * (original.<ext>) and, for raster images, narrower WebP copies made by a
 * job (w<width>.webp). Pages refer to files by id, so replacing a file
 * updates every use; the file before it waits in DATA_DIR/media-previous/<id>/
 * (outside what the publisher copies) so it can be put back. A usage index,
 * rewritten on every save, says who uses what. Deleting moves a file to
 * Recently deleted; it is purged after TRASH_DAYS unless a page's history
 * still refers to it.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type MediaInfo, type PageDocument, mediaIdsOf } from "@fiscal-sb/blocks";
import type { Media, MediaDetail, MediaKind, MediaList, WaitingItem } from "@fiscal-sb/contracts";
import type { ExpressionBuilder, Selectable } from "kysely";
import type { Db } from "../db/index.js";
import { now } from "../db/index.js";
import type { Database, MediaTable } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { TRASH_DAYS } from "./history.js";
import { Tree } from "./tree.js";
import { actingUser } from "../auth/acting.js";

/** Widths of the copies made for srcset; only those narrower than the original. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
const THUMBNAIL_WIDTH = 480;

type Detected = { type: string; ext: string; kind: "image" | "document" };

/** What a file is, from its bytes rather than its name or the browser's word for it. */
export function detectType(bytes: Buffer): Detected | null {
  const head = bytes.subarray(0, 16);
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { type: "image/jpeg", ext: "jpg", kind: "image" };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { type: "image/png", ext: "png", kind: "image" };
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP")
    return { type: "image/webp", ext: "webp", kind: "image" };
  if (head.toString("latin1", 0, 5) === "%PDF-")
    return { type: "application/pdf", ext: "pdf", kind: "document" };
  const text = bytes.subarray(0, 2048).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text))
    return { type: "image/svg+xml", ext: "svg", kind: "image" };
  return null;
}

/** Elements that can run code or pull in other documents, whatever their namespace prefix. */
const svgActive = new Set([
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
  "audio",
  "video",
  "handler",
  "listener",
]);
/** Animation elements, which can set a link to javascript: after the file is checked. */
const svgAnimation = new Set(["set", "animate", "animatemotion", "animatetransform"]);
const linkAttribute = new Set(["href", "src", "from", "to", "values"]);
const entities: Record<string, string> = {
  colon: ":",
  tab: "\t",
  newline: "\n",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** An attribute value as the browser reads it: entities decoded, spaces and controls gone. */
const linkValue = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match)
    // oxlint-disable-next-line no-control-regex -- browsers ignore these inside a URL scheme
    .replace(/[\s\u0000-\u001f]/g, "")
    .toLowerCase();

/** A data: URL that is only a raster picture, which can't run anything. */
const rasterData = /^data:image\/(png|jpe?g|gif|webp);/;

/**
 * Why an SVG can't be accepted, or undefined when it can. It is served from
 * the builder's own origin, so anything that could run code there is
 * refused outright rather than cleaned: scripts and foreign content under
 * any namespace prefix, event handlers, javascript: and similar links
 * (entity-encoded too), animations that change a link, and DTD entities.
 */
export function svgProblem(svg: string): string | undefined {
  if (/<!ENTITY/i.test(svg) || /<!DOCTYPE[^>]*\[/i.test(svg)) return "entities";
  for (const [, name = ""] of svg.matchAll(/<\s*(?:[\w.-]+:)?([\w.-]+)/g)) {
    const local = name.toLowerCase();
    if (svgActive.has(local)) return `the <${local}> element`;
    if (svgAnimation.has(local) && /attributeName\s*=\s*["']?\s*(?:[\w.-]+:)?href/i.test(svg))
      return "an animation that changes a link";
  }
  for (const [, attribute = "", ...quoted] of svg.matchAll(
    /\s([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    const local = (attribute.split(":").at(-1) ?? "").toLowerCase();
    if (local.startsWith("on")) return `the ${attribute} handler`;
    if (!linkAttribute.has(local)) continue;
    const value = linkValue(quoted.find((v) => v !== undefined) ?? "");
    if (
      /^(javascript|vbscript):/.test(value) ||
      (value.startsWith("data:") && !rasterData.test(value))
    )
      return "a link that runs code";
  }
  return undefined;
}

/** The library's folders in DATA_DIR: each file's own, and the one before its last replace. */
export const MEDIA_DIR = "media";
export const PREVIOUS_DIR = "media-previous";
const dirOf = (dataDir: string, id: string) => join(dataDir, MEDIA_DIR, id);
const previousDirOf = (dataDir: string, id: string) => join(dataDir, PREVIOUS_DIR, id);
/**
 * A file's address. A replaced file keeps its name, so its addresses carry
 * when it was replaced: browsers (the admin's and visitors') then fetch the
 * new one instead of showing the copy they cached.
 */
const urlOf = (id: string, file: string, replacedAt?: string | null) =>
  `/media/${id}/${file}${replacedAt ? `?v=${Date.parse(replacedAt).toString(36)}` : ""}`;
const variantFile = (width: number) => `w${width}.webp`;

/**
 * A row as the API shows it. `live` is when the last publish was queued: a
 * file replaced after it, that something uses, isn't on the live site yet.
 */
function toMedia(
  row: Selectable<MediaTable> & { used_by?: number | string | null },
  live?: string | null,
): Media {
  const variants = JSON.parse(row.variants) as number[];
  const original = urlOf(row.id, `original.${row.ext}`, row.replaced_at);
  const thumb = variants.find((w) => w >= THUMBNAIL_WIDTH) ?? variants.at(-1);
  return {
    id: row.id,
    filename: row.filename,
    type: row.type,
    kind: row.type === "application/pdf" ? "document" : "image",
    size: row.size,
    width: row.width,
    height: row.height,
    alt: row.alt,
    decorative: Boolean(row.decorative),
    caption: row.caption,
    credit: row.credit,
    variants,
    status: row.status,
    url: original,
    thumbnailUrl: thumb ? urlOf(row.id, variantFile(thumb), row.replaced_at) : original,
    usedBy: Number(row.used_by ?? 0),
    notLive: Boolean(
      row.replaced_at && Number(row.used_by ?? 0) && (!live || row.replaced_at > live),
    ),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const notFound = () => new HttpError(404, "media_not_found", "No file with that id");

/** An image with no alt text that isn't marked decorative. */
const needsAlt = (eb: ExpressionBuilder<Database, "media">) =>
  eb.and([
    eb("type", "!=", "application/pdf"),
    eb("decorative", "=", 0),
    eb(eb.fn("trim", [eb.ref("alt")]), "=", ""),
  ]);

/** How many owners (pages, settings) use the file. */
const usedBy = (eb: ExpressionBuilder<Database, "media">) =>
  eb
    .selectFrom("media_usage")
    .select((e) => e.fn.countAll<number>().as("n"))
    .whereRef("media_usage.media_id", "=", "media.id")
    .as("used_by");

export async function listMedia(
  db: Db,
  query: {
    search?: string | undefined;
    kind?: MediaKind | undefined;
    unused?: boolean | undefined;
    needsAlt?: boolean | undefined;
    deleted?: boolean | undefined;
    page: number;
    pageSize: number;
  },
): Promise<MediaList> {
  const { page, pageSize } = query;
  let base = db.selectFrom("media").where("deleted_at", query.deleted ? "is not" : "is", null);
  if (query.search) {
    const like = `%${query.search.replaceAll("%", "\\%")}%`;
    base = base.where((eb) =>
      eb.or([eb("filename", "like", like), eb("alt", "like", like), eb("caption", "like", like)]),
    );
  }
  if (query.kind === "document") base = base.where("type", "=", "application/pdf");
  if (query.kind === "image") base = base.where("type", "!=", "application/pdf");
  if (query.needsAlt) base = base.where(needsAlt);
  if (query.unused)
    base = base.where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("media_usage").select("owner").whereRef("media_id", "=", "media.id"),
        ),
      ),
    );
  const [rows, total, counts, live] = await Promise.all([
    base
      .selectAll("media")
      .select(usedBy)
      .orderBy(query.deleted ? "deleted_at" : "created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute(),
    base.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db
      .selectFrom("media")
      .select((eb) => [
        eb.fn
          .sum<number>(
            eb
              .case()
              .when(eb.and([eb("deleted_at", "is", null), needsAlt(eb)]))
              .then(1)
              .else(0)
              .end(),
          )
          .as("needsAlt"),
        eb.fn
          .sum<number>(eb.case().when("deleted_at", "is not", null).then(1).else(0).end())
          .as("deleted"),
      ])
      .executeTakeFirstOrThrow(),
    lastPublishAt(db),
  ]);
  return {
    items: rows.map((row) => toMedia(row, live)),
    total: Number(total.n),
    needsAlt: Number(counts.needsAlt ?? 0),
    deleted: Number(counts.deleted ?? 0),
    trashDays: TRASH_DAYS,
  };
}

export async function getMedia(db: Db, id: string): Promise<MediaDetail> {
  const row = await db
    .selectFrom("media")
    .selectAll("media")
    .select(usedBy)
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) throw notFound();
  const owners = await db
    .selectFrom("media_usage")
    .select("owner")
    .where("media_id", "=", id)
    .execute();
  const pageIds = owners.flatMap((o) => (o.owner.startsWith("page:") ? [o.owner.slice(5)] : []));
  const [tree, pages, live] = await Promise.all([
    // Every page, deleted or not, so a deleted page's old address can be named.
    db
      .selectFrom("pages")
      .select(["id", "parent_id", "slug", "position", "kind"])
      .execute()
      .then((rows) => new Tree(rows)),
    pageIds.length
      ? db
          .selectFrom("pages")
          .select(["id", "draft", "deleted_at"])
          .where("id", "in", pageIds)
          .execute()
      : [],
    lastPublishAt(db),
  ]);
  const previous = row.previous
    ? (JSON.parse(row.previous) as {
        filename: string;
        type: string;
        replaced_at: string;
      })
    : null;
  return {
    ...toMedia(row, live),
    usedOn: pages.map((p) => ({
      id: p.id,
      title: (JSON.parse(p.draft) as PageDocument).ms.title,
      path: tree.path(p.id),
      deleted: p.deleted_at !== null,
    })),
    usedBySettings: owners.some((o) => o.owner === "settings"),
    previous: previous
      ? {
          filename: previous.filename,
          kind: previous.type === "application/pdf" ? ("document" as const) : ("image" as const),
          replacedAt: previous.replaced_at,
          // Outside what the publisher copies, so the admin reads it through the API.
          url: `/api/media/${row.id}/previous/file?v=${Date.parse(previous.replaced_at).toString(36)}`,
        }
      : null,
  };
}

/** When the last successful publish was queued: a rebuild copies every file as it is when it runs. */
async function lastPublishAt(db: Db) {
  const row = await db
    .selectFrom("jobs")
    .select("created_at")
    .where("kind", "=", "publish")
    .where("status", "=", "done")
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  return row?.created_at ?? null;
}

/** Files replaced since the last publish that something uses: the next publish takes them live. */
export async function waitingMedia(db: Db): Promise<WaitingItem[]> {
  const live = await lastPublishAt(db);
  let query = db
    .selectFrom("media")
    .select(["id", "filename", "replaced_at"])
    .where("replaced_at", "is not", null)
    .where("deleted_at", "is", null)
    .where((eb) =>
      eb.exists(eb.selectFrom("media_usage").select("owner").whereRef("media_id", "=", "media.id")),
    );
  if (live) query = query.where("replaced_at", ">", live);
  const rows = await query.orderBy("replaced_at", "desc").execute();
  return rows.map((r) => ({
    kind: "media" as const,
    id: r.id,
    filename: r.filename,
    replacedAt: r.replaced_at ?? "",
  }));
}

/** A raster image re-encoded in its own format without metadata; as it was if sharp can't read it. */
async function withoutMetadata(bytes: Buffer) {
  const { default: sharp } = await import("sharp");
  try {
    const image = sharp(bytes).rotate();
    const { format } = await image.metadata();
    return await (format === "jpeg" ? image.jpeg({ quality: 92 }) : image).toBuffer();
  } catch {
    return bytes;
  }
}

/** Width and height of an image, when sharp can read them. */
async function dimensions(bytes: Buffer) {
  const { default: sharp } = await import("sharp");
  try {
    const meta = await sharp(bytes).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

export type Upload = { filename: string; bytes: Buffer };

/** What the file is, or why it can't go in the library. */
function check(upload: Upload, maxBytes: number) {
  if (upload.bytes.length > maxBytes)
    throw new HttpError(
      413,
      "file_too_large",
      `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
    );
  const detected = detectType(upload.bytes);
  if (!detected)
    throw new HttpError(
      415,
      "file_type_not_allowed",
      "Upload a JPEG, PNG, WebP or SVG image, or a PDF",
    );
  return detected;
}

/** Checks and stores a file; raster images then wait for their variants. */
async function store(dataDir: string, id: string, upload: Upload, maxBytes: number) {
  const detected = check(upload, maxBytes);
  if (detected.ext === "svg") {
    const problem = svgProblem(upload.bytes.toString("utf8"));
    if (problem)
      throw new HttpError(
        415,
        "svg_not_allowed",
        `This SVG has ${problem}, which could run code on the site. Export it again as a plain SVG, or upload a PNG.`,
      );
  }
  const raster = detected.kind === "image" && detected.ext !== "svg";
  // Photos carry EXIF (where it was taken, the camera's owner): the original
  // is published too, so it's rewritten without it, upright.
  const bytes = raster ? await withoutMetadata(upload.bytes) : upload.bytes;
  const dir = dirOf(dataDir, id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `original.${detected.ext}`), bytes);
  const size = detected.kind === "image" ? await dimensions(bytes) : { width: null, height: null };
  return { ...detected, bytes, raster, ...size };
}

export async function createMedia(
  db: Db,
  dataDir: string,
  upload: Upload,
  maxBytes: number,
): Promise<{ media: MediaDetail; needsVariants: boolean }> {
  const id = randomUUID();
  const file = await store(dataDir, id, upload, maxBytes);
  const time = now();
  await db
    .insertInto("media")
    .values({
      id,
      created_by: actingUser(),
      filename: upload.filename.slice(0, 200) || `file.${file.ext}`,
      type: file.type,
      ext: file.ext,
      size: file.bytes.length,
      width: file.width,
      height: file.height,
      status: file.raster ? "processing" : "ready",
      created_at: time,
      updated_at: time,
    })
    .execute();
  return { media: await getMedia(db, id), needsVariants: file.raster };
}

/** The row fields a replace changes, kept so the file before it can be put back. */
const FILE_FIELDS = [
  "filename",
  "type",
  "ext",
  "size",
  "width",
  "height",
  "variants",
  "variants_size",
  "status",
] as const;

/**
 * A new file under the same id: every page using it shows the new one, in
 * drafts at once and on the live site at the next publish. The file before
 * it is kept, so the replace can be undone.
 */
export async function replaceMedia(
  db: Db,
  dataDir: string,
  id: string,
  upload: Upload,
  maxBytes: number,
): Promise<{ media: MediaDetail; needsVariants: boolean }> {
  const row = await db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) throw notFound();
  check(upload, maxBytes);
  const time = now();
  const previousDir = previousDirOf(dataDir, id);
  await rm(previousDir, { recursive: true, force: true });
  await mkdir(join(dataDir, PREVIOUS_DIR), { recursive: true });
  await rename(dirOf(dataDir, id), previousDir).catch(() => undefined);
  const file = await store(dataDir, id, upload, maxBytes);
  await db
    .updateTable("media")
    .set({
      filename: upload.filename.slice(0, 200) || `file.${file.ext}`,
      type: file.type,
      ext: file.ext,
      size: file.bytes.length,
      width: file.width,
      height: file.height,
      variants: "[]",
      variants_size: 0,
      status: file.raster ? "processing" : "ready",
      replaced_at: time,
      previous: JSON.stringify({
        ...Object.fromEntries(FILE_FIELDS.map((f) => [f, row[f]])),
        replaced_at: time,
      }),
      updated_at: time,
    })
    .where("id", "=", id)
    .execute();
  return { media: await getMedia(db, id), needsVariants: file.raster };
}

/** The file before the last replace, for the admin to show before putting it back. */
export async function previousFile(db: Db, dataDir: string, id: string) {
  const row = await db
    .selectFrom("media")
    .select("previous")
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row?.previous)
    throw new HttpError(404, "no_previous_file", "This file hasn't been replaced");
  const previous = JSON.parse(row.previous) as { ext: string; type: string };
  return {
    path: join(previousDirOf(dataDir, id), `original.${previous.ext}`),
    type: previous.type,
  };
}

/** Puts back the file before the last replace; the one it replaces becomes the previous, so this can be undone too. */
export async function restorePrevious(db: Db, dataDir: string, id: string) {
  const row = await db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) throw notFound();
  if (!row.previous)
    throw new HttpError(
      409,
      "no_previous_file",
      "This file hasn't been replaced, so there is nothing to put back",
    );
  const previous = JSON.parse(row.previous) as Record<(typeof FILE_FIELDS)[number], never>;
  const dir = dirOf(dataDir, id);
  const previousDir = previousDirOf(dataDir, id);
  const swap = `${previousDir}.swap`;
  await rm(swap, { recursive: true, force: true });
  await rename(dir, swap);
  await rename(previousDir, dir);
  await rename(swap, previousDir);
  const time = now();
  await db
    .updateTable("media")
    .set({
      ...Object.fromEntries(FILE_FIELDS.map((f) => [f, previous[f]])),
      replaced_at: time,
      previous: JSON.stringify({
        ...Object.fromEntries(FILE_FIELDS.map((f) => [f, row[f]])),
        replaced_at: time,
      }),
      updated_at: time,
    })
    .where("id", "=", id)
    .execute();
  return getMedia(db, id);
}

/** The variants job: WebP copies at each width narrower than the original. */
export async function makeVariants(db: Db, dataDir: string, id: string) {
  const row = await db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return { variants: 0 };
  const { default: sharp } = await import("sharp");
  const dir = dirOf(dataDir, id);
  try {
    const original = join(dir, `original.${row.ext}`);
    const widths = VARIANT_WIDTHS.filter((w) => !row.width || w < row.width);
    // An image narrower than every width still gets one copy at its own size.
    if (!widths.length && row.width) widths.push(row.width as (typeof VARIANT_WIDTHS)[number]);
    let bytes = 0;
    for (const width of widths) {
      const info = await sharp(original)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(join(dir, variantFile(width)));
      bytes += info.size;
    }
    await db
      .updateTable("media")
      .set({ variants: JSON.stringify(widths), variants_size: bytes, status: "ready" })
      .where("id", "=", id)
      .execute();
    return { variants: widths.length };
  } catch (error) {
    await db.updateTable("media").set({ status: "failed" }).where("id", "=", id).execute();
    throw error;
  }
}

export async function updateMedia(
  db: Db,
  id: string,
  input: {
    alt?: string | undefined;
    decorative?: boolean | undefined;
    caption?: string | undefined;
    credit?: string | undefined;
  },
) {
  const { decorative, ...text } = input;
  const set = {
    ...Object.fromEntries(Object.entries(text).filter(([, v]) => v !== undefined)),
    ...(decorative !== undefined && { decorative: decorative ? 1 : 0 }),
  };
  const result = await db
    .updateTable("media")
    .set({ ...set, updated_at: now() })
    .where("id", "=", id)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) throw notFound();
  return getMedia(db, id);
}

/** Moves a file nobody uses to Recently deleted; a file in use says where. */
export async function deleteMedia(db: Db, id: string) {
  const media = await getMedia(db, id);
  if (media.usedOn.length || media.usedBySettings) {
    const names = media.usedOn.map((p) =>
      p.deleted ? `${p.title} (in Recently deleted)` : p.title,
    );
    throw new HttpError(
      409,
      "media_in_use",
      `This file is used on ${names.join(", ") || "the site settings"}. Remove it there first.`,
      { usedOn: media.usedOn, usedBySettings: media.usedBySettings },
    );
  }
  if (media.deletedAt) return media;
  await db.updateTable("media").set({ deleted_at: now() }).where("id", "=", id).execute();
  return getMedia(db, id);
}

/** Brings a file back from Recently deleted. */
export async function restoreMedia(db: Db, id: string) {
  const result = await db
    .updateTable("media")
    .set({ deleted_at: null })
    .where("id", "=", id)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) throw notFound();
  return getMedia(db, id);
}

/**
 * Removes files deleted more than TRASH_DAYS ago for good, except those an
 * earlier version of a page still refers to: restoring that version would
 * otherwise show a missing image.
 */
export async function purgeDeletedMedia(db: Db, dataDir: string) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  const old = await db.selectFrom("media").select("id").where("deleted_at", "<", cutoff).execute();
  for (const { id } of old) {
    const inHistory = await db
      .selectFrom("revisions")
      .select("id")
      .where("content", "like", `%${id}%`)
      .limit(1)
      .executeTakeFirst();
    if (inHistory) continue;
    await db.deleteFrom("media").where("id", "=", id).execute();
    await rm(dirOf(dataDir, id), { recursive: true, force: true });
    await rm(previousDirOf(dataDir, id), { recursive: true, force: true });
  }
}

/** Rewrites the usage index for one owner from the values it holds. */
export async function setUsage(db: Db, owner: string, values: unknown[]) {
  const ids = new Set<string>();
  for (const value of values) mediaIdsOf(value, ids);
  await db.deleteFrom("media_usage").where("owner", "=", owner).execute();
  if (!ids.size) return;
  const known = await db
    .selectFrom("media")
    .select("id")
    .where("id", "in", [...ids])
    .execute();
  if (!known.length) return;
  await db
    .insertInto("media_usage")
    .values(known.map((m) => ({ media_id: m.id, owner })))
    .onConflict((oc) => oc.doNothing())
    .execute();
  // A file something uses again (a restored version, say) is back in the library.
  await db
    .updateTable("media")
    .set({ deleted_at: null })
    .where(
      "id",
      "in",
      known.map((m) => m.id),
    )
    .where("deleted_at", "is not", null)
    .execute();
}

/**
 * A page uses what its draft and its published revision use. A page in
 * Recently deleted still does, so restoring it never finds its images gone.
 */
export async function syncPageUsage(db: Db, pageId: string) {
  const row = await db
    .selectFrom("pages")
    .leftJoin("revisions", "revisions.id", "pages.published_revision_id")
    .select(["pages.draft", "revisions.content"])
    .where("pages.id", "=", pageId)
    .executeTakeFirst();
  const values = !row ? [] : [JSON.parse(row.draft), row.content ? JSON.parse(row.content) : null];
  await setUsage(db, `page:${pageId}`, values);
}

/** What the renderer needs for the media in `values`. Missing files are left out. */
export async function mediaInfo(db: Db, values: unknown[]): Promise<Record<string, MediaInfo>> {
  const ids = new Set<string>();
  for (const value of values) mediaIdsOf(value, ids);
  if (!ids.size) return {};
  const rows = await db
    .selectFrom("media")
    .selectAll()
    .where("id", "in", [...ids])
    .execute();
  return Object.fromEntries(
    rows.map((row) => {
      const media = toMedia(row);
      const variants = media.variants.map((width) => ({
        url: urlOf(row.id, variantFile(width), row.replaced_at),
        width,
      }));
      const largest = variants.at(-1);
      return [
        row.id,
        {
          url: media.kind === "image" && largest && row.ext !== "svg" ? largest.url : media.url,
          alt: media.alt,
          credit: media.credit,
          filename: media.filename,
          type: media.type,
          size: media.size,
          width: media.width,
          height: media.height,
          variants,
        },
      ];
    }),
  );
}

export async function mediaTotals(db: Db) {
  const row = await db
    .selectFrom("media")
    .where("deleted_at", "is", null)
    .select((eb) => [
      eb.fn.countAll<number>().as("count"),
      eb.fn.sum<number>(eb("size", "+", eb.ref("variants_size"))).as("bytes"),
      eb.fn
        .sum<number>(eb.case().when("status", "=", "processing").then(1).else(0).end())
        .as("processing"),
    ])
    .executeTakeFirstOrThrow();
  return {
    count: Number(row.count),
    bytes: Number(row.bytes ?? 0),
    processing: Number(row.processing ?? 0),
  };
}

/** The media folders of `ids`, for the publisher to copy. */
export async function mediaFolders(dataDir: string, ids: Set<string>) {
  const root = join(dataDir, MEDIA_DIR);
  const present = await readdir(root).catch(() => [] as string[]);
  const out: string[] = [];
  for (const id of present)
    if (ids.has(id) && (await stat(join(root, id))).isDirectory()) out.push(join(root, id));
  return out;
}
