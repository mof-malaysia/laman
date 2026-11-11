/**
 * The block registry: every block an editor can place. Content validates
 * against it, the renderer maps each type to its FTDS component, and the
 * editor builds the palette and property panel from it.
 */
import { z } from "zod";
import { callout } from "./blocks/callout.js";
import { contact } from "./blocks/contact.js";
import { ctaBand } from "./blocks/cta-band.js";
import { ctaCards } from "./blocks/cta-cards.js";
import { ctaSplit } from "./blocks/cta-split.js";
import { details } from "./blocks/details.js";
import { downloadList } from "./blocks/download-list.js";
import { eligibility } from "./blocks/eligibility.js";
import { embed } from "./blocks/embed.js";
import { entryList } from "./blocks/entry-list.js";
import { eventDetails } from "./blocks/event-details.js";
import { faq } from "./blocks/faq.js";
import { featureGrid } from "./blocks/feature-grid.js";
import { hero } from "./blocks/hero.js";
import { image } from "./blocks/image.js";
import { impactStats } from "./blocks/impact-stats.js";
import { insetText } from "./blocks/inset-text.js";
import { latestEntries } from "./blocks/latest-entries.js";
import { linkList } from "./blocks/link-list.js";
import { logoCloud } from "./blocks/logo-cloud.js";
import { pageIntro } from "./blocks/page-intro.js";
import { partnerGrid } from "./blocks/partner-grid.js";
import { peopleGrid } from "./blocks/people-grid.js";
import { prose } from "./blocks/prose.js";
import { serviceHighlights } from "./blocks/service-highlights.js";
import { statsBand } from "./blocks/stats-band.js";
import { steps } from "./blocks/steps.js";
import { fieldsOf, type FieldSpec } from "./fields.js";

export const blocks = [
  hero,
  pageIntro,
  prose,
  insetText,
  details,
  image,
  featureGrid,
  serviceHighlights,
  steps,
  eligibility,
  linkList,
  downloadList,
  peopleGrid,
  partnerGrid,
  logoCloud,
  eventDetails,
  embed,
  statsBand,
  impactStats,
  faq,
  callout,
  contact,
  ctaBand,
  ctaCards,
  ctaSplit,
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
  blockSchema(pageIntro),
  blockSchema(prose),
  blockSchema(image),
  blockSchema(featureGrid),
  blockSchema(ctaBand),
  blockSchema(callout),
  blockSchema(linkList),
  blockSchema(downloadList),
  blockSchema(serviceHighlights),
  blockSchema(steps),
  blockSchema(eligibility),
  blockSchema(peopleGrid),
  blockSchema(insetText),
  blockSchema(details),
  blockSchema(statsBand),
  blockSchema(impactStats),
  blockSchema(ctaCards),
  blockSchema(ctaSplit),
  blockSchema(partnerGrid),
  blockSchema(logoCloud),
  blockSchema(eventDetails),
  blockSchema(embed),
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

/** The blocks that open a page with its h1, from the palette's opening group: a page has at most one. */
const openings = blocks.filter((b) => b.group === "opening");
const openingTypes = new Set<BlockType>(openings.map((b) => b.type));
/** Whether a block opens a page with its h1: a page has at most one. */
export const isOpening = (type: BlockType) => openingTypes.has(type);

/** The blocks that give a page its h1, by name: "Hero or Page intro". */
export const openingNames = openings.map((b) => b.label).join(" or ");

/**
 * Whether a page has its h1, which it needs before it goes live (not to be
 * saved): an entry's comes from its own title; other pages need an opening block.
 */
export const hasHeading = (kind: PageKind, list: { type: BlockType }[]) =>
  kind === "entry" || list.some((b) => isOpening(b.type));

/**
 * Problems with a page's blocks for its kind: blocks it may not use, more
 * than one opening (one h1), and the listing's one entry list.
 */
export function kindIssues(kind: PageKind, list: { type: BlockType }[]): string[] {
  const allowed = new Set(blocksFor(kind));
  const issues = [...new Set(list.filter((b) => !allowed.has(b.type)).map((b) => b.type))].map(
    (type) => `A ${kind} page can't use the ${blockDefinition(type).label} block`,
  );
  if (list.filter((b) => isOpening(b.type)).length > 1)
    issues.push(`A page has one ${openingNames}: it holds the page's only h1`);
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
