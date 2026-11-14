/**
 * The check before a page goes live (docs/laman.md § Checks before
 * publishing): what in its draft would fail visitors, found by walking the
 * blocks' JSON rather than by a rule per block (Embed's address is the one
 * exception: whether the site allows it). Only a missing main heading
 * stops publishing; the rest are warnings an officer can publish past.
 */
import {
  SYSTEM_PATHS,
  blocks,
  embedDecision,
  hasHeading,
  linksOf,
  mediaUsesOf,
  newBlock,
  openingNames,
  templateIds,
  templateById,
} from "@laman/blocks";
import type { PageCheck } from "@laman/contracts";
import { sql } from "kysely";
import type { Db } from "../db/index.js";
import { HttpError } from "../errors.js";
import { getPage, listPages, sitePath } from "./pages.js";
import { readDoc } from "./site.js";

/** Every string in a value, with nothing else. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsOf(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) stringsOf(item, out);
  return out;
}

/** Words a person wrote, not a short label ("Mula", "98%"), an option's value or an address. */
const isWords = (text: string) =>
  text.trim().length >= 10 && !/^[a-z0-9-]+$/.test(text) && !/^(\/|#|https?:|mailto:)/.test(text);
/** Long enough to be someone's sentence rather than a button label. */
const isSentence = (text: string) => text.trim().length >= 15 && isWords(text);

const TITLE = "\u0000title";
let placeholders: Set<string> | undefined;
/**
 * The example text blocks and templates start with: left in, it was never
 * written. A block's own example text counts ("Tajuk bahagian", "Nama
 * Ketua Pengarah"); from templates only sentences, as their button labels
 * are often what an agency wants anyway.
 */
function placeholderText() {
  placeholders ??= new Set(
    [
      ...blocks.flatMap((b) => stringsOf(newBlock(b.type).props).filter(isWords)),
      ...templateIds.flatMap((id) =>
        stringsOf(templateById(id).blocks(TITLE)).filter(
          (text) => isSentence(text) && !text.includes(TITLE),
        ),
      ),
    ].map((text) => text.trim()),
  );
  return placeholders;
}

/** Link text that means nothing out of context ("klik sini"), lower case without punctuation. */
const vague = new Set([
  "klik sini",
  "klik di sini",
  "tekan sini",
  "di sini",
  "sini",
  "baca lagi",
  "baca seterusnya",
  "lagi",
  "seterusnya",
  "pautan",
  "click here",
  "here",
  "read more",
  "more",
  "link",
]);
const isVague = (text: string) =>
  vague.has(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim(),
  );

/** Alt text that's a file's name, or a word that only says it's a picture. */
const pictureWords = new Set(["gambar", "imej", "foto", "image", "photo", "picture", "img"]);
function looksLikeFile(alt: string, filename: string) {
  const text = alt.trim().toLowerCase();
  const stem = filename.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  return (
    /\.(jpe?g|png|gif|webp|avif|svg|heic|bmp|tiff?)$/.test(text) ||
    /^(img|dsc|dcim|pxl|image|photo|screenshot|whatsapp image)[\s_-]?\d/.test(text) ||
    text === stem ||
    pictureWords.has(text.replace(/\s*\d+$/, ""))
  );
}

/**
 * What would fail visitors on each of `ids` as its draft stands, keyed by id.
 * The site's page list, its redirects and the media used are read once for all.
 */
export async function pageChecks(db: Db, ids: readonly string[]) {
  const [pages, redirects, drafts, settings] = await Promise.all([
    listPages(db),
    db.selectFrom("redirects").select("source_path").execute(),
    Promise.all(ids.map((id) => getPage(db, id))),
    // The live settings: what a publish of the page will be rendered with.
    readDoc(db, "settings", "published"),
  ]);
  const embedRules = settings.embeds;
  const uses = drafts.flatMap((page) => page.draft.ms.blocks.flatMap((b) => mediaUsesOf(b.props)));
  const media = uses.length
    ? await db
        .selectFrom("media")
        .select(["id", "alt", "decorative", "filename", "type"])
        .where("id", "in", [...new Set(uses.map((u) => u.mediaId))])
        .execute()
    : [];
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const redirected = new Set(redirects.map((r) => r.source_path));
  const listings = pages.filter((p) => p.kind === "listing" && p.path !== "/");
  /** Whether the site answers `path` other than with a page: a redirect, a system path, a listing's later pages. */
  const servedOtherwise = (path: string) =>
    redirected.has(path) ||
    SYSTEM_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ||
    listings.some((l) => path.startsWith(`${l.path}/`));
  const examples = placeholderText();

  const checked: Record<string, PageCheck[]> = {};
  for (const page of drafts) {
    const checks: PageCheck[] = [];
    const warn = (check: Omit<PageCheck, "severity">) =>
      checks.push({ severity: "warn", ...check });
    if (!hasHeading(page.kind, page.draft.ms.blocks))
      checks.push({ code: "noHeading", severity: "block", blockId: null });
    for (const block of page.draft.ms.blocks) {
      const blockId = block.id;
      for (const use of mediaUsesOf(block.props)) {
        const file = mediaById.get(use.mediaId);
        if (!file?.type.startsWith("image/") || file.decorative) continue;
        const alt = (use.alt?.trim() || file.alt).trim();
        if (!alt) warn({ code: "altMissing", blockId, subject: file.filename });
        else if (looksLikeFile(alt, file.filename))
          warn({ code: "altFilename", blockId, subject: alt });
      }
      for (const link of linksOf(block.props)) {
        if (link.text && isVague(link.text))
          warn({ code: "vagueLink", blockId, subject: link.text.trim() });
        const path = sitePath(link.href);
        if (path === undefined || path === page.path) continue;
        const target = byPath.get(path);
        if (target?.status === "draft" || target?.status === "scheduled")
          warn({ code: "linkNotLive", blockId, subject: path });
        else if (!target && !servedOtherwise(path))
          warn({ code: "linkMissing", blockId, subject: path });
      }
      if (block.type === "embed" && block.props.url) {
        const decision = embedDecision(block.props.url, embedRules);
        if (!decision.allowed)
          warn({
            code: "embedNotAllowed",
            blockId,
            subject: "host" in decision ? decision.host : block.props.url,
          });
      }
      // Event details shows an event entry's own date; anywhere else it needs one typed in.
      if (block.type === "eventDetails" && !block.props.date?.trim() && !page.draft.entry?.event)
        warn({ code: "eventNoDate", blockId });
      for (const text of new Set(stringsOf(block.props).map((t) => t.trim())))
        if (examples.has(text)) warn({ code: "placeholder", blockId, subject: text });
    }
    checked[page.id] = checks;
  }
  return checked;
}

/**
 * Refuses to publish pages a check stops (409 `page_not_ready`), naming them.
 * Only the check that stops is run here, from the drafts alone.
 */
export async function assertReady(db: Db, ids: readonly string[]) {
  if (!ids.length) return;
  const rows = await db
    .selectFrom("pages")
    .select(["kind", "draft", sql<string>`json_extract(draft, '$.ms.title')`.as("title")])
    .where("id", "in", ids)
    .execute();
  const stopped = rows
    .filter((row) => !hasHeading(row.kind, JSON.parse(row.draft).ms.blocks))
    .map((row) => row.title);
  if (stopped.length)
    throw new HttpError(
      409,
      "page_not_ready",
      `${stopped.join(", ")} can't go live yet: ${stopped.length === 1 ? "it has" : "they have"} no main heading. Add a ${openingNames} at the top.`,
      { pages: stopped },
    );
}
