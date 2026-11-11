/**
 * What changed between two versions of a page, block by block: for the
 * Publishing screen's side-by-side view and the page History's summary.
 * Blocks are matched by id, so a moved block isn't counted as changed.
 */
import {
  type Block,
  type FieldSpec,
  type PageDocument,
  type RichNode,
  blockFields,
  richTextToText,
} from "@fiscal-sb/blocks";
import { type MessageKey, t } from "@/i18n";
import { blockLabel, localBlockFields } from "@/i18n/registry";

export type FieldChange = { label: string; before: string; after: string };

export type PageChange = {
  /** The block's id, or `title`, `description`, `seo`, `redirect`, `entry` or `en`. */
  id: string;
  kind: "added" | "removed" | "changed" | "same";
  label: string;
  /** What was live, and what will be, as plain text. */
  before: string;
  after: string;
  /** For a changed block: each field that differs. */
  fields: FieldChange[];
};

/** Each kind of change in words, and its tag's colour. */
export const changeMarks: Record<
  PageChange["kind"],
  { label: MessageKey; variant: "default" | "success" | "warning" | "danger" }
> = {
  same: { label: "publishing.compare.unchanged", variant: "default" },
  changed: { label: "history.changed", variant: "warning" },
  added: { label: "history.added", variant: "success" },
  removed: { label: "history.removed", variant: "danger" },
};

/** Keys that carry no words an officer would recognise. */
const quiet = new Set([
  "id",
  "type",
  "kind",
  "marks",
  "attrs",
  "mediaId",
  "pageId",
  "variant",
  "status",
]);
const LIMIT = 280;

const isAddress = (text: string) => /^(https?:|mailto:|tel:|\/)/.test(text);
const clip = (text: string) => (text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text);

/** A value's words, joined, up to the limit: lists and links read as their text. */
function textOf(value: unknown, { addresses = true } = {}): string {
  const out: string[] = [];
  let length = 0;
  const add = (text: string) => {
    out.push(text);
    length += text.length + 3;
  };
  const walk = (v: unknown) => {
    if (length > LIMIT) return;
    if (typeof v === "string") {
      const text = v.trim();
      if (text && (addresses || !isAddress(text))) add(text);
    } else if (typeof v === "number") add(String(v));
    else if (Array.isArray(v)) for (const item of v) walk(item);
    else if (v && typeof v === "object")
      for (const [k, inner] of Object.entries(v)) if (!quiet.has(k)) walk(inner);
  };
  walk(value);
  return clip(out.join(" · "));
}

/** Rich text as it reads; anything else as its words. */
const fieldText = (value: unknown, spec: FieldSpec | undefined, addresses = true) =>
  spec?.widget === "richtext" && value && typeof value === "object"
    ? clip(
        richTextToText(value as RichNode)
          .replace(/\s+/g, " ")
          .trim(),
      )
    : textOf(value, { addresses });

/** Fields that hold words; styles, icons, switches, files and pages don't. */
const worded = new Set(["text", "textarea", "richtext", "link", "list", "group"]);

/** A whole block in a line: the words of its fields, without styles or addresses. */
function wordsOf(specs: FieldSpec[], props: unknown): string {
  const values = (props ?? {}) as Record<string, unknown>;
  const parts = specs.flatMap((spec) => {
    if (!worded.has(spec.widget)) return [];
    const value = values[spec.name];
    if (spec.widget === "list" && Array.isArray(value) && spec.fields)
      return value.map((item) => wordsOf(spec.fields!, item));
    if (spec.widget === "group" && spec.fields) return [wordsOf(spec.fields, value)];
    return [fieldText(value, spec, false)];
  });
  return clip(parts.filter(Boolean).join(" · "));
}

/** A field's value as the editor shows it: an option's label, On or Off, or its words. */
function valueOf(value: unknown, spec: FieldSpec | undefined): string {
  if (typeof value === "boolean") return t(value ? "diff.on" : "diff.off");
  const option = spec?.options?.find((o) => o.value === value);
  return option ? option.label : fieldText(value, spec);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A block in a line. */
const summary = (b: Block) => wordsOf(blockFields(b.type), b.props);

function blockChange(was: Block | undefined, now: Block | undefined): PageChange {
  const block = (now ?? was)!;
  const base = { id: block.id, label: blockLabel(block.type), fields: [] };
  if (!was) return { ...base, kind: "added", before: "", after: summary(now!) };
  if (!now) return { ...base, kind: "removed", before: summary(was), after: "" };
  if (same(was, now)) {
    const text = summary(now);
    return { ...base, kind: "same", before: text, after: text };
  }
  const a = was.props as Record<string, unknown>;
  const b = now.props as Record<string, unknown>;
  // Props are the block's top-level fields: one lookup of the block's specs serves them all.
  const specs = localBlockFields(now.type);
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !same(a[k], b[k]))
    .map((k) => {
      const spec = specs.find((s) => s.name === k);
      return { label: spec?.title ?? k, before: valueOf(a[k], spec), after: valueOf(b[k], spec) };
    });
  return { ...base, kind: "changed", before: summary(was), after: summary(now), fields };
}

/** A part of the page outside its blocks, when it differs. */
function partChange(id: string, label: string, before: unknown, after: unknown): PageChange[] {
  if (same(before, after)) return [];
  const kind = before == null ? "added" : after == null ? "removed" : "changed";
  return [{ id, kind, label, before: textOf(before), after: textOf(after), fields: [] }];
}

/**
 * Every block of both versions, in the new version's order with removed ones
 * after, and the page's other parts when they changed. With no `before`, the
 * page has never been live: everything is added.
 */
export function pageChanges(before: PageDocument | undefined, after: PageDocument): PageChange[] {
  const old = new Map(before?.ms.blocks.map((b) => [b.id, b]));
  const now = new Set(after.ms.blocks.map((b) => b.id));
  return [
    ...partChange("title", t("diff.title"), before?.ms.title, after.ms.title),
    ...partChange(
      "description",
      t("diff.description"),
      before?.ms.description,
      after.ms.description,
    ),
    ...partChange("entry", t("diff.entry"), before?.entry, after.entry),
    ...after.ms.blocks.map((block) => blockChange(old.get(block.id), block)),
    ...(before?.ms.blocks.filter((b) => !now.has(b.id)).map((b) => blockChange(b, undefined)) ??
      []),
    ...partChange("en", t("diff.en"), before?.en, after.en),
    ...partChange("seo", t("diff.seo"), before?.seo, after.seo),
    ...partChange("redirect", t("diff.redirect"), before?.redirect, after.redirect),
  ];
}
