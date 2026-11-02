/**
 * The block registry: every block an editor can place. Content validates
 * against it, the renderer maps each type to its FTDS component, and the
 * editor builds the palette and property panel from it.
 */
import { z } from "zod";
import { callout } from "./blocks/callout.js";
import { contact } from "./blocks/contact.js";
import { ctaBand } from "./blocks/cta-band.js";
import { entryList } from "./blocks/entry-list.js";
import { faq } from "./blocks/faq.js";
import { featureGrid } from "./blocks/feature-grid.js";
import { hero } from "./blocks/hero.js";
import { image } from "./blocks/image.js";
import { latestEntries } from "./blocks/latest-entries.js";
import { linkList } from "./blocks/link-list.js";
import { prose } from "./blocks/prose.js";
import { fieldsOf, type FieldSpec } from "./fields.js";

export const blocks = [
  hero,
  prose,
  image,
  featureGrid,
  linkList,
  faq,
  callout,
  contact,
  ctaBand,
  entryList,
  latestEntries,
] as const;

export type BlockType = (typeof blocks)[number]["type"];
export const blockTypes = blocks.map((b) => b.type) as [BlockType, ...BlockType[]];

const BlockId = z.string().regex(/^[a-z0-9-]{1,40}$/);

// Generic in the type and props themselves, so each block keeps its literal
// type and the union discriminates (BlockOf<"hero"> is the hero block).
const blockSchema = <const T extends string, P extends z.ZodObject>(definition: {
  type: T;
  props: P;
}) => z.object({ id: BlockId, type: z.literal(definition.type), props: definition.props });

export const Block = z.discriminatedUnion("type", [
  blockSchema(hero),
  blockSchema(prose),
  blockSchema(image),
  blockSchema(featureGrid),
  blockSchema(ctaBand),
  blockSchema(callout),
  blockSchema(linkList),
  blockSchema(faq),
  blockSchema(contact),
  blockSchema(entryList),
  blockSchema(latestEntries),
]);
export type Block = z.infer<typeof Block>;
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

const byType = new Map(blocks.map((b) => [b.type, b]));

export function blockDefinition(type: BlockType) {
  const definition = byType.get(type);
  if (!definition) throw new Error(`Unknown block type ${type}`);
  return definition;
}

const fieldCache = new Map<BlockType, FieldSpec[]>();

/** The property panel's fields for a block type. */
export function blockFields(type: BlockType): FieldSpec[] {
  let fields = fieldCache.get(type);
  if (!fields) {
    fields = fieldsOf(blockDefinition(type).props);
    fieldCache.set(type, fields);
  }
  return fields;
}

export type PageKind = "page" | "listing" | "entry";

/** The block types a kind of page may use: the palette offers these, the API rejects the rest. */
export const blocksFor = (kind: PageKind): BlockType[] =>
  blocks.filter((b) => (b.kinds as readonly PageKind[]).includes(kind)).map((b) => b.type);

/** Problems with a page's blocks for its kind: blocks it may not use, and the listing's one entry list. */
export function kindIssues(kind: PageKind, list: { type: BlockType }[]): string[] {
  const allowed = new Set(blocksFor(kind));
  const issues = [...new Set(list.filter((b) => !allowed.has(b.type)).map((b) => b.type))].map(
    (type) => `A ${kind} page can't use the ${blockDefinition(type).label} block`,
  );
  const lists = list.filter((b) => b.type === "entryList").length;
  if (kind === "listing" && lists !== 1)
    issues.push(
      lists === 0
        ? "A listing page needs its Entry list block"
        : "A listing page has one Entry list block",
    );
  return issues;
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** A new block of `type` with its default content. */
export function newBlock(type: BlockType, id: string = newId()): Block {
  const definition = blockDefinition(type);
  return Block.parse({ id, type, props: definition.defaults });
}
