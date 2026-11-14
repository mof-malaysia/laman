/**
 * The drafting tools (docs/mcp.md § Drafting): pages, blocks, listings, the
 * navbar and footer, search, colours, site settings and media. Each change is
 * small: read the draft, change one thing, save it from the version read, so
 * someone's edit in between is refused (draft_conflict) rather than lost.
 * Nothing here goes live; publishing has its own tools.
 */
import {
  type Block,
  type BlockType,
  blockTypes,
  EntryFields,
  featureIcons,
  ListingSettings,
  Locale,
  newBlock,
  type PageDocument,
  PageRedirect,
  PageSeo,
  slugify,
  Slug,
} from "@laman/blocks";
import {
  Announcement,
  DropdownLayout,
  LinkTarget,
  type Navigation,
  NavFeature,
  NavItem,
  FooterColumn,
  Id,
  type Page,
  PageTemplate,
  SiteDocName,
  type SiteSearch,
  SiteSettings,
  type SiteTheme,
  UpdateMediaBody,
} from "@laman/contracts";
import { z } from "zod";
import { choiceFrom, ThemeInput } from "./theme.js";
import { addMedia, issueUploadLink } from "./uploads.js";
import { type Api, drafting, type Tool, ToolError, tool } from "./tool.js";

const Position = z
  .number()
  .int()
  .min(0)
  .describe("Where in the list, from 0. Leave out to add at the end.");
const LocaleInput = Locale.default("ms").describe(
  "The language version to change: ms (default) or en.",
);
const Label = z.string().trim().min(1).max(60);

// ── Pages ──────────────────────────────────────────────────────────────────

/** What an agent needs back after a page change: enough to make the next one. */
function pageResult(page: Page, locale: Locale = "ms") {
  const content = page.draft[locale];
  return {
    id: page.id,
    kind: page.kind,
    path: page.path,
    status: page.status,
    title: content?.title ?? page.title,
    draftVersion: page.draftVersion,
    locale,
    blocks: (content?.blocks ?? []).map((b) => ({ id: b.id, type: b.type })),
  };
}

/**
 * Reads a page, changes its draft, and saves it from the version it read, or
 * from `base`, the version the agent's own change was made against.
 */
async function editPage(
  api: Api,
  id: string,
  change: (draft: PageDocument) => void,
  locale: Locale = "ms",
  base?: string,
) {
  const page = (await api.get(`/api/pages/${id}`)) as Page;
  change(page.draft);
  const saved = (await api.put(`/api/pages/${id}/draft`, {
    draft: page.draft,
    base: base ?? page.draftVersion,
  })) as Page;
  return pageResult(saved, locale);
}

/** Changes the blocks of one language version of a page's draft. */
const editBlocks = (
  api: Api,
  pageId: string,
  locale: Locale,
  change: (blocks: Block[]) => void,
  base?: string,
) => editPage(api, pageId, (draft) => change(blocksOf(draft, locale)), locale, base);

/** The blocks of one language version; an English version starts from the BM title. */
function blocksOf(draft: PageDocument, locale: Locale) {
  if (locale === "en") draft.en ??= { title: draft.ms.title, blocks: [] };
  return draft[locale]!.blocks;
}

function indexOfBlock(blocks: Block[], blockId: string) {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0)
    throw new ToolError("block_not_found", `No block ${blockId} in this version of the page.`);
  return index;
}

const insertAt = <T>(list: T[], item: T, position: number | undefined) =>
  list.splice(position === undefined ? list.length : Math.min(position, list.length), 0, item);

const BlockInput = z.object({
  id: z.string().optional().describe("Keep a block's id to keep it; leave out for a new block."),
  type: z.enum(blockTypes),
  props: z.record(z.string(), z.unknown()).describe("As get_block_schema describes for the type."),
});

/** A block with an agent's props over the type's defaults; the API checks the result. */
function blockWith(type: BlockType, props: Record<string, unknown> = {}, id?: string): Block {
  const fresh = newBlock(type);
  return { ...fresh, ...(id && { id }), props: { ...fresh.props, ...props } } as Block;
}

// ── Site documents ─────────────────────────────────────────────────────────

type Drafted<T> = { draft: T; version: string; warnings?: unknown[] };

/** Reads a site document, changes its draft, and saves it from the version it read, or `base`. */
async function editDoc<T>(api: Api, name: SiteDocName, change: (draft: T) => void, base?: string) {
  const doc = (await api.get(`/api/${name}`)) as Drafted<T>;
  change(doc.draft);
  const saved = (await api.put(`/api/${name}`, {
    draft: doc.draft,
    base: base ?? doc.version,
  })) as Drafted<T>;
  return {
    draft: saved.draft,
    version: saved.version,
    ...(saved.warnings && { warnings: saved.warnings }),
  };
}

const editNav = (api: Api, change: (doc: Navigation) => void, base?: string) =>
  editDoc<Navigation>(api, "navigation", change, base);
const editSearch = (api: Api, change: (doc: SiteSearch) => void) =>
  editDoc<SiteSearch>(api, "search", change);

/** For tools that write a whole thing at once: the version it was read at, so a newer edit isn't overwritten. */
const ReadVersion = z
  .string()
  .optional()
  .describe(
    "The version you read (draftVersion or version), so a change made since is refused rather than overwritten.",
  );

/**
 * The list and index a navigation path points at: "navbar.1",
 * "navbar.1.links.0", "navbar.1.groups.0.links.2", "footer.columns.0.links.1".
 */
function locate(doc: Navigation, path: string) {
  const parts = path.split(".");
  const last = Number(parts.pop());
  let at: unknown = doc;
  for (const part of parts) {
    const key = /^\d+$/.test(part) ? Number(part) : part;
    at = at && typeof at === "object" ? (at as Record<string | number, unknown>)[key] : undefined;
  }
  if (!Array.isArray(at) || !Number.isInteger(last) || last < 0 || last >= at.length)
    throw new ToolError(
      "path_not_found",
      `Nothing at ${path}. Read get_navigation for the paths: navbar.N, navbar.N.links.N, navbar.N.groups.N.links.N, footer.columns.N, footer.columns.N.links.N.`,
    );
  return {
    list: at as Record<string, unknown>[],
    index: last,
    item: at[last] as Record<string, unknown>,
  };
}

/** The navbar dropdown a path names. */
function dropdown(doc: Navigation, path: string) {
  const { item } = locate(doc, path);
  if (!/^navbar\.\d+$/.test(path) || item.type !== "dropdown")
    throw new ToolError("not_a_dropdown", `${path} isn't a navbar dropdown.`);
  return item as Extract<NavItem, { type: "dropdown" }>;
}

/** The list of links a path names: a dropdown's, one of its groups', or a footer column's. */
function linksAt(doc: Navigation, path: string) {
  if (/^navbar\.\d+$/.test(path)) return dropdown(doc, path).links;
  if (/^navbar\.\d+\.groups\.\d+$/.test(path) || /^footer\.columns\.\d+$/.test(path))
    return (locate(doc, path).item as { links: unknown[] }).links;
  throw new ToolError(
    "not_a_list",
    `${path} doesn't hold links: give a dropdown (navbar.N), one of its groups (navbar.N.groups.N) or a footer column (footer.columns.N).`,
  );
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

const Target = LinkTarget.describe(
  'A page from the tree, { "kind": "page", "pageId": … }, or { "kind": "url", "url": "https://…" }.',
);

/** Section by section, each one partial: the rest of the settings stay as they are. */
const { shape: sections } = SiteSettings;
/** An optional setting an agent can also take away, with null. */
const removable = <T extends z.ZodType>(schema: z.ZodOptional<T>) =>
  schema.unwrap().nullable().optional();
type Patch<S extends z.ZodRawShape> = z.ZodObject<{
  [K in keyof S]: z.ZodOptional<S[K] extends z.ZodDefault<infer I> ? I : S[K]>;
}>;
/**
 * A section as a change: every field optional, and defaults dropped, since a
 * default would fill in, and so reset, every field a change doesn't name.
 */
const patchOf = <S extends z.ZodRawShape>(section: z.ZodObject<S>) =>
  z.object(
    Object.fromEntries(
      Object.entries(section.shape).map(([key, field]) => [
        key,
        ((field instanceof z.ZodDefault ? field.unwrap() : field) as z.ZodType).optional(),
      ]),
    ),
  ) as unknown as Patch<S>;
const { shape: identity } = sections.identity;
const { shape: embeds } = sections.embeds.unwrap();
const SettingsChanges = z.object({
  identity: patchOf(sections.identity)
    .extend({
      logo: removable(identity.logo),
      favicon: removable(identity.favicon),
      socialImage: removable(identity.socialImage),
    })
    .optional(),
  appearance: patchOf(sections.appearance).optional(),
  contact: patchOf(sections.contact).optional(),
  social: sections.social.optional(),
  phase: patchOf(sections.phase)
    .extend({ feedbackUrl: removable(sections.phase.shape.feedbackUrl) })
    .optional(),
  search: patchOf(sections.search).optional(),
  publishing: patchOf(sections.publishing).optional(),
  analytics: patchOf(sections.analytics.unwrap()).optional(),
});

export const draftingTools: Tool[] = [
  // Pages
  drafting({
    name: "create_page",
    title: "Create a page",
    description:
      "A new page under `parentId` (the home page when left out), from a template (list_templates). Its address is the parent's plus `slug`, made from the title when left out. Starts as a draft.",
    input: z.object({
      title: z.string().trim().min(1).max(160),
      slug: Slug.optional(),
      parentId: Id.optional(),
      template: PageTemplate.optional(),
    }),
    run: async ({ api }, { title, slug, parentId, template }) =>
      pageResult(
        (await api.post("/api/pages", {
          title,
          slug: slug ?? slugify(title),
          ...(parentId && { parentId }),
          ...(template && { template }),
        })) as Page,
      ),
  }),
  drafting({
    name: "update_page_details",
    title: "Update page details",
    description:
      "A page's title and meta description (per language), search-engine settings, redirect, and for entries their fixed fields (date, category, summary, cover, pinned, and event: start, end, allDay, location, venue). Only what's given changes. An event that came from a calendar sync (event.source) can't be changed here: the next sync would put it back, so change it in its calendar. To change its address, use move_page.",
    input: z.object({
      id: Id,
      locale: LocaleInput,
      title: z.string().trim().min(1).max(160).optional(),
      description: z.string().max(160).optional(),
      seo: PageSeo.optional(),
      redirect: PageRedirect.nullable()
        .optional()
        .describe("Send visitors elsewhere; null removes it."),
      entry: EntryFields.partial().optional().describe("Entries only."),
    }),
    target: ({ id }) => id,
    run: ({ api }, { id, locale, title, description, seo, redirect, entry }) =>
      editPage(
        api,
        id,
        (draft) => {
          blocksOf(draft, locale);
          const content = draft[locale]!;
          if (title !== undefined) content.title = title;
          if (description !== undefined) content.description = description;
          if (seo) draft.seo = { ...draft.seo, ...seo };
          if (redirect !== undefined) draft.redirect = redirect;
          if (entry) {
            if (!draft.entry)
              throw new ToolError("not_an_entry", "Only entries have entry fields.");
            draft.entry = { ...draft.entry, ...defined(entry) };
          }
        },
        locale,
      ),
  }),
  drafting({
    name: "replace_page_blocks",
    title: "Replace a page's blocks",
    description:
      "Writes every block of one language version at once, in order. Keep a block's `id` to keep it; blocks without one are new. Props not given take the type's defaults. Prefer add_block and update_block for small changes.",
    input: z.object({
      id: Id,
      locale: LocaleInput,
      blocks: z.array(BlockInput).max(100),
      version: ReadVersion,
    }),
    target: ({ id }) => id,
    run: ({ api }, { id, locale, blocks, version }) =>
      editBlocks(
        api,
        id,
        locale,
        (list) => list.splice(0, Infinity, ...blocks.map((b) => blockWith(b.type, b.props, b.id))),
        version,
      ),
  }),
  drafting({
    name: "add_block",
    title: "Add a block",
    description:
      "Adds a block to a page's draft. `props` are laid over the type's defaults (get_block_schema), so give only what differs. The page's kind decides which blocks it may use (list_block_types).",
    input: z.object({
      pageId: Id,
      type: z.enum(blockTypes),
      props: z.record(z.string(), z.unknown()).optional(),
      position: Position.optional(),
      locale: LocaleInput,
    }),
    target: ({ pageId }) => pageId,
    run: ({ api }, { pageId, type, props, position, locale }) =>
      editBlocks(api, pageId, locale, (blocks) =>
        insertAt(blocks, blockWith(type, props), position),
      ),
  }),
  drafting({
    name: "update_block",
    title: "Update a block",
    description:
      "Changes some of a block's props: each one given replaces that prop (give a list or object whole). The rest stay as they are.",
    input: z.object({
      pageId: Id,
      blockId: z.string(),
      props: z.record(z.string(), z.unknown()),
      locale: LocaleInput,
    }),
    target: ({ pageId }) => pageId,
    run: ({ api }, { pageId, blockId, props, locale }) =>
      editBlocks(api, pageId, locale, (blocks) => {
        const block = blocks[indexOfBlock(blocks, blockId)]!;
        block.props = { ...block.props, ...props } as never;
      }),
  }),
  drafting({
    name: "move_block",
    title: "Move a block",
    description: "Moves a block to `position` (from 0) in its page.",
    input: z.object({
      pageId: Id,
      blockId: z.string(),
      position: z.number().int().min(0),
      locale: LocaleInput,
    }),
    target: ({ pageId }) => pageId,
    run: ({ api }, { pageId, blockId, position, locale }) =>
      editBlocks(api, pageId, locale, (blocks) => {
        const [block] = blocks.splice(indexOfBlock(blocks, blockId), 1);
        insertAt(blocks, block!, position);
      }),
  }),
  drafting({
    name: "remove_block",
    title: "Remove a block",
    description: "Removes a block from a page's draft. The page's history keeps the draft before.",
    input: z.object({ pageId: Id, blockId: z.string(), locale: LocaleInput }),
    target: ({ pageId }) => pageId,
    run: ({ api }, { pageId, blockId, locale }) =>
      editBlocks(api, pageId, locale, (blocks) => blocks.splice(indexOfBlock(blocks, blockId), 1)),
  }),
  drafting({
    name: "move_page",
    title: "Move or rename a page",
    description:
      "Moves a page to another parent or position, or changes its slug (the last part of its address). Pages under it move too. Moving a page that's on the site needs a role that can publish; set `redirect` to send its old address to the new one. `dryRun` reports the address changes without saving.",
    input: z.object({
      id: Id,
      parentId: Id.optional(),
      position: z.number().int().min(0).optional(),
      slug: Slug.optional(),
      redirect: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    }),
    target: ({ id }) => id,
    run: ({ api }, { id, ...body }) => api.post(`/api/pages/${id}/move`, defined(body)),
  }),
  drafting({
    name: "duplicate_page",
    title: "Duplicate a page",
    description:
      "A copy of a page's draft beside it, as a new draft, with the pages under it when `includeChildren`.",
    input: z.object({ id: Id, includeChildren: z.boolean().optional() }),
    target: ({ id }) => id,
    run: async ({ api }, { id, includeChildren }) =>
      pageResult(
        (await api.post(`/api/pages/${id}/duplicate`, defined({ includeChildren }))) as Page,
      ),
  }),
  drafting({
    name: "restore_revision_to_draft",
    title: "Restore a revision as the draft",
    description:
      "Makes an earlier revision (list_revisions) the page's draft. The current draft becomes a revision first, so this can be undone. Nothing goes live.",
    input: z.object({ pageId: Id, revisionId: Id }),
    target: ({ pageId }) => pageId,
    run: async ({ api }, { pageId, revisionId }) =>
      pageResult((await api.post(`/api/pages/${pageId}/revisions/${revisionId}/restore`)) as Page),
  }),
  drafting({
    name: "discard_page_changes",
    title: "Discard a page's changes",
    description:
      "Throws away a page's unpublished changes, going back to what's live. The discarded draft becomes a revision, so restore_revision_to_draft can bring it back. Refused for a page that has never been published.",
    input: z.object({ pageId: Id }),
    target: ({ pageId }) => pageId,
    destructive: true,
    run: async ({ api }, { pageId }) =>
      pageResult((await api.post(`/api/pages/${pageId}/discard`)) as Page),
  }),

  // Listings
  drafting({
    name: "make_listing",
    title: "Make a page a listing",
    description:
      "Turns an ordinary page into a listing that holds dated entries (news, notices, events), adding an Entry list block.",
    input: z.object({ id: Id }),
    target: ({ id }) => id,
    run: async ({ api }, { id }) =>
      pageResult((await api.post(`/api/pages/${id}/make-listing`)) as Page),
  }),
  drafting({
    name: "update_listing",
    title: "Update a listing's settings",
    description:
      "A listing's settings (get_listing): entry categories, event locations (for the event calendar's filter), the order of its entries (publishAt: newest first; eventStart: coming events first), its entries' addresses (slug or year), the blocks new entries start with, and its RSS feed. Only what's given changes; categories and locations are replaced whole.",
    input: z.object({ id: Id, ...patchOf(ListingSettings).shape }),
    target: ({ id }) => id,
    run: async ({ api }, { id, ...changes }) => {
      const { settings } = (await api.get(`/api/pages/${id}/listing`)) as {
        settings: ListingSettings;
      };
      return api.put(`/api/pages/${id}/listing`, {
        settings: { ...settings, ...defined(changes) },
      });
    },
  }),
  drafting({
    name: "create_entry",
    title: "Create an entry",
    description:
      "A new entry (article, notice, event) under a listing, dated now, with the listing's starting blocks. Then fill it with the block tools and update_page_details (entry fields).",
    input: z.object({ listingId: Id, title: z.string().trim().min(1).max(160) }),
    target: ({ listingId }) => listingId,
    run: async ({ api }, { listingId, title }) =>
      pageResult((await api.post(`/api/pages/${listingId}/entries`, { title })) as Page),
  }),

  // Navbar
  drafting({
    name: "add_navbar_link",
    title: "Add a navbar link",
    description: "A link at the top level of the navbar (up to 8 items).",
    input: z.object({ label: Label, target: Target, position: Position.optional() }),
    run: ({ api }, { label, target, position }) =>
      editNav(api, (doc) =>
        insertAt<NavItem>(doc.navbar, { type: "link", label, target }, position),
      ),
  }),
  drafting({
    name: "add_navbar_dropdown",
    title: "Add a navbar dropdown",
    description:
      "A dropdown menu in the navbar. `list`: plain links in columns. `described`: each link with an icon and a line. `grouped`: titled columns (add_dropdown_group). Then add links with add_dropdown_link.",
    input: z.object({
      label: Label,
      layout: DropdownLayout.default("list"),
      columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
      position: Position.optional(),
    }),
    run: ({ api }, { label, layout, columns, position }) =>
      editNav(api, (doc) =>
        insertAt<NavItem>(
          doc.navbar,
          { type: "dropdown", label, layout, columns, links: [], groups: [] },
          position,
        ),
      ),
  }),
  drafting({
    name: "update_navbar_item",
    title: "Update a navbar item",
    description:
      "Changes a top-level navbar item (`navbar.N`): its label, a link's target, or a dropdown's layout and columns.",
    input: z.object({
      path: z.string().regex(/^navbar\.\d+$/, "A top-level item: navbar.N"),
      label: Label.optional(),
      target: Target.optional(),
      layout: DropdownLayout.optional(),
      columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    }),
    run: ({ api }, { path, ...changes }) =>
      editNav(api, (doc) => {
        const { item } = locate(doc, path);
        const { target, layout, columns, label } = changes;
        if (item.type === "link" && (layout || columns))
          throw new ToolError("not_a_dropdown", `${path} is a link: only dropdowns have a layout.`);
        if (item.type === "dropdown" && target)
          throw new ToolError("not_a_link", `${path} is a dropdown: its links have targets.`);
        Object.assign(item, defined({ label, target, layout, columns }));
      }),
  }),
  drafting({
    name: "add_dropdown_link",
    title: "Add a dropdown link",
    description:
      "A link in a navbar dropdown (`navbar.N`, up to 16) or one of its groups (`navbar.N.groups.N`, up to 12). `description` and `icon` show in the described layout.",
    input: z.object({
      path: z.string(),
      label: Label,
      target: Target,
      description: z.string().trim().max(120).optional(),
      icon: z.enum(featureIcons).optional(),
      position: Position.optional(),
    }),
    run: ({ api }, { path, position, ...link }) =>
      editNav(api, (doc) => {
        if (path.startsWith("footer"))
          throw new ToolError("not_a_dropdown", "For the footer, use add_footer_link.");
        insertAt(linksAt(doc, path), defined(link), position);
      }),
  }),
  drafting({
    name: "add_dropdown_group",
    title: "Add a dropdown group",
    description: "A titled column in a grouped navbar dropdown (`navbar.N`, up to 4).",
    input: z.object({ path: z.string(), heading: Label, position: Position.optional() }),
    run: ({ api }, { path, heading, position }) =>
      editNav(api, (doc) => insertAt(dropdown(doc, path).groups, { heading, links: [] }, position)),
  }),
  drafting({
    name: "set_dropdown_feature",
    title: "Set a dropdown's featured card",
    description: "The card beside a navbar dropdown's links (`navbar.N`); null removes it.",
    input: z.object({ path: z.string(), feature: NavFeature.nullable() }),
    run: ({ api }, { path, feature }) =>
      editNav(api, (doc) => {
        const item = dropdown(doc, path);
        if (feature) item.feature = feature;
        else delete item.feature;
      }),
  }),
  drafting({
    name: "set_dropdown_footer_link",
    title: "Set a dropdown's footer link",
    description:
      'The "see all" link at the foot of a navbar dropdown (`navbar.N`); null removes it.',
    input: z.object({
      path: z.string(),
      link: z.object({ text: Label, target: Target }).nullable(),
    }),
    run: ({ api }, { path, link }) =>
      editNav(api, (doc) => {
        const item = dropdown(doc, path);
        if (link) item.footerLink = link;
        else delete item.footerLink;
      }),
  }),

  // Footer
  drafting({
    name: "add_footer_column",
    title: "Add a footer column",
    description:
      "A titled column of links in the footer (up to 4). Then add links with add_footer_link.",
    input: z.object({ heading: Label, position: Position.optional() }),
    run: ({ api }, { heading, position }) =>
      editNav(api, (doc) =>
        insertAt<z.infer<typeof FooterColumn>>(
          doc.footer.columns,
          { heading, links: [] },
          position,
        ),
      ),
  }),
  drafting({
    name: "update_footer_column",
    title: "Rename a footer column",
    description: "Changes a footer column's heading (`footer.columns.N`).",
    input: z.object({
      path: z.string().regex(/^footer\.columns\.\d+$/, "A footer column: footer.columns.N"),
      heading: Label,
    }),
    run: ({ api }, { path, heading }) =>
      editNav(api, (doc) => {
        locate(doc, path).item.heading = heading;
      }),
  }),
  drafting({
    name: "add_footer_link",
    title: "Add a footer link",
    description: "A link in a footer column (`footer.columns.N`, up to 12).",
    input: z.object({
      path: z.string(),
      label: Label,
      target: Target,
      position: Position.optional(),
    }),
    run: ({ api }, { path, label, target, position }) =>
      editNav(api, (doc) => {
        if (!path.startsWith("footer"))
          throw new ToolError("not_a_footer_column", "For the navbar, use add_dropdown_link.");
        insertAt(linksAt(doc, path), { label, target }, position);
      }),
  }),

  // Navigation, either part
  drafting({
    name: "update_navigation_item",
    title: "Update a navigation link or group",
    description:
      "Changes a link inside a dropdown, group or footer column (label, target, description, icon), or a dropdown group's heading. For top-level items use update_navbar_item; for footer columns, update_footer_column.",
    input: z.object({
      path: z.string(),
      label: Label.optional(),
      target: Target.optional(),
      description: z.string().trim().max(120).optional(),
      icon: z.enum(featureIcons).optional(),
      heading: Label.optional(),
    }),
    run: ({ api }, { path, ...changes }) =>
      editNav(api, (doc) => {
        const { item } = locate(doc, path);
        const isGroup = /\.groups\.\d+$/.test(path);
        if (isGroup ? changes.label || changes.target : changes.heading)
          throw new ToolError(
            "wrong_fields",
            isGroup
              ? "A group has only a heading."
              : "A link has a label and target, not a heading.",
          );
        Object.assign(item, defined(changes));
      }),
  }),
  drafting({
    name: "move_navigation_item",
    title: "Move a navigation item",
    description:
      "Moves any navbar item, link, group or footer column to `position` (from 0) within its own list.",
    input: z.object({ path: z.string(), position: z.number().int().min(0) }),
    run: ({ api }, { path, position }) =>
      editNav(api, (doc) => {
        const { list, index } = locate(doc, path);
        const [item] = list.splice(index, 1);
        insertAt(list, item!, position);
      }),
  }),
  drafting({
    name: "remove_navigation_item",
    title: "Remove a navigation item",
    description: "Removes a navbar item, link, group or footer column, with everything in it.",
    input: z.object({ path: z.string() }),
    run: ({ api }, { path }) =>
      editNav(api, (doc) => {
        const { list, index } = locate(doc, path);
        list.splice(index, 1);
      }),
  }),
  drafting({
    name: "replace_navigation",
    title: "Replace the navigation",
    description:
      "Writes the whole navbar and footer at once, as get_navigation returns them. For rebuilding them; prefer the smaller tools for changes.",
    input: z.object({
      navbar: z.array(NavItem).max(8),
      footer: z.object({ columns: z.array(FooterColumn).max(4) }),
      version: ReadVersion,
    }),
    run: ({ api }, { version, ...navigation }) =>
      editNav(api, (doc) => Object.assign(doc, navigation), version),
  }),

  // Search
  drafting({
    name: "set_search_options",
    title: "Set search options",
    description:
      "Turns site search on or off (the Cari link, /carian and its index), and whether visitors can filter results by collection and category.",
    input: z.object({ on: z.boolean().optional(), filters: z.boolean().optional() }),
    run: ({ api }, changes) => editSearch(api, (doc) => Object.assign(doc, defined(changes))),
  }),
  drafting({
    name: "add_search_pin",
    title: "Pin a search result",
    description:
      "Puts a page first when a visitor searches for one of `terms` (up to 10 words, each up to 40 characters; up to 50 pins).",
    input: z.object({
      terms: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
      pageId: Id,
    }),
    target: ({ pageId }) => pageId,
    run: ({ api }, { terms, pageId }) =>
      editSearch(api, (doc) => {
        doc.pins.push({ terms: terms.map((t) => t.toLowerCase()), pageId });
      }),
  }),
  drafting({
    name: "update_search_pin",
    title: "Update a pinned result",
    description:
      "Changes the words or page of a pin, by its position in get_search's `pins` (from 0).",
    input: z.object({
      index: z.number().int().min(0),
      terms: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
      pageId: Id.optional(),
    }),
    run: ({ api }, { index, terms, pageId }) =>
      editSearch(api, (doc) => {
        const pin = doc.pins[index];
        if (!pin) throw new ToolError("pin_not_found", `There's no pin ${index}.`);
        if (terms) pin.terms = terms.map((t) => t.toLowerCase());
        if (pageId) pin.pageId = pageId;
      }),
  }),
  drafting({
    name: "remove_search_pin",
    title: "Remove a pinned result",
    description: "Removes a pin, by its position in get_search's `pins` (from 0).",
    input: z.object({ index: z.number().int().min(0) }),
    run: ({ api }, { index }) =>
      editSearch(api, (doc) => {
        if (!doc.pins[index]) throw new ToolError("pin_not_found", `There's no pin ${index}.`);
        doc.pins.splice(index, 1);
      }),
  }),

  // Colours
  drafting({
    name: "set_theme",
    title: "Set the site's colours",
    description:
      "Sets the main colour, the accent, or both. The main colour is a preset (list_theme_presets) or the agency's own colour; it's what links, buttons and focus outlines use, and the builder makes its ramp, darkened where needed to pass WCAG 2.2 AA. The accent is an optional second brand colour for decoration only (brand bars, icon circles, figures, event dates and the hero's Accent wash); null takes it away. What isn't given stays as it is. preview_theme shows the result first; publish_theme sends it live.",
    input: ThemeInput,
    run: ({ api }, input) =>
      // The save takes only the colours; the ramps stored beside them are made again from them.
      editDoc<SiteTheme>(api, "theme", (draft) => {
        const choice = choiceFrom(draft, input);
        delete draft.seed;
        delete draft.accent;
        Object.assign(draft, choice);
      }),
  }),

  // Site settings and the announcement
  drafting({
    name: "update_settings",
    title: "Update site settings",
    description:
      "Changes site settings section by section (get_settings): identity, appearance (masthead, site name in the navbar, logo in the footer), contact, social (replaced whole), phase, search, publishing, analytics. In each section only the fields given change; null takes away the logo, favicon, social image or feedback address. What pages may embed is update_embeds, for Admins.",
    input: SettingsChanges,
    run: ({ api }, changes) =>
      editDoc<Record<string, unknown>>(api, "settings", (doc) => {
        for (const [section, value] of Object.entries(changes)) {
          if (value === undefined) continue;
          if (Array.isArray(value) || typeof value !== "object" || value === null) {
            doc[section] = value;
            continue;
          }
          const merged: Record<string, unknown> = {
            ...(doc[section] as object),
            ...defined(value),
          };
          for (const [key, field] of Object.entries(value)) if (field === null) delete merged[key];
          doc[section] = merged;
        }
      }),
  }),
  tool({
    name: "update_embeds",
    title: "Change what pages may embed",
    description:
      "Which sites the Embed block may frame (get_settings `embeds`): built-in services switched on (only each one's embed addresses, never the rest of its site) and the site's own host names, each allowed whole. Each list given replaces the old one. Saved in the settings draft; publish_settings sends it live, and a page whose embed is no longer allowed loses it at that publish.",
    access: "site.manage",
    input: z.object({
      services: embeds.services.unwrap().optional(),
      hosts: embeds.hosts.optional(),
    }),
    run: ({ api }, change) => {
      if (!change.services && !change.hosts)
        throw new ToolError("invalid_input", "Give services, hosts or both.");
      return editDoc<SiteSettings>(api, "settings", (doc) => {
        doc.embeds = { ...doc.embeds, ...defined(change) };
      });
    },
  }),
  drafting({
    name: "update_announcement",
    title: "Update the announcement",
    description:
      "The bar under the navbar: on or off, its tag and colour, message, link, dates (from, until) and where it shows (all pages or the home page). Only what's given changes; a null link or date removes it.",
    input: z.object({
      ...Announcement.omit({ link: true, from: true, until: true }).partial().shape,
      link: Announcement.shape.link.unwrap().nullable().optional(),
      from: Announcement.shape.from.unwrap().nullable().optional(),
      until: Announcement.shape.until.unwrap().nullable().optional(),
    }),
    run: ({ api }, changes) =>
      editDoc<Record<string, unknown>>(api, "announcement", (doc) => {
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) delete doc[key];
          else if (value !== undefined) doc[key] = value;
        }
      }),
  }),
  drafting({
    name: "discard_draft",
    title: "Discard a site document's draft",
    description:
      "Throws away the unpublished changes to settings, navigation, the announcement, search or colours, going back to what's live.",
    input: z.object({ document: SiteDocName }),
    destructive: true,
    run: ({ api }, { document }) => api.post(`/api/${document}/discard`),
  }),

  // Media
  drafting({
    name: "upload_media",
    title: "Upload a file",
    description:
      "Adds a file from the officer's machine to the media library: JPEG, PNG, WebP, SVG or PDF, base64-encoded, up to the site's upload limit. Give images alt text (or mark them decorative). Use the returned id in blocks. For anything over about 1 MB, or whenever you can run curl, use start_upload instead. Send the file as it is: never resize or recompress it, since the builder makes the smaller copies pages need and keeps the original for the largest screens.",
    input: z.object({
      filename: z.string().trim().min(1).max(200),
      data: z.string().min(1).describe("The file's bytes, base64-encoded."),
      ...UpdateMediaBody.shape,
    }),
    run: async ({ api }, { filename, data, ...details }) => {
      const bytes = Buffer.from(data, "base64");
      if (!bytes.length) throw new ToolError("invalid_input", "`data` isn't base64.");
      return addMedia(api, filename, bytes, defined(details));
    },
  }),
  drafting({
    name: "start_upload",
    title: "Get an upload link",
    description:
      "A one-time link to post a file to straight from disk, so it needn't go through a tool call as base64: the better way to add images when you can run a shell command. Post the original, never a resized or recompressed copy (the builder makes the smaller copies itself): `curl -sS -F \"file=@/path/to/photo.jpg\" <url>`. The answer is the media file; use its `id` in blocks. JPEG, PNG, WebP, SVG or PDF, up to the site's upload limit. The link works once, for 15 minutes. Alt text and the rest given here are applied to the file when it arrives.",
    input: z.object({ ...UpdateMediaBody.shape }),
    run: async ({ user, connection, origin }, details) => {
      const { token, expiresAt } = issueUploadLink({
        connectionId: connection.id,
        userId: user.id,
        details: defined(details),
      });
      const url = `${origin}/mcp/uploads/${token}`;
      return {
        url,
        expiresAt,
        field: "file",
        example: `curl -sS -F "file=@/path/to/photo.jpg" ${url}`,
      };
    },
  }),
  drafting({
    name: "update_media",
    title: "Update a file's details",
    description: "A file's alt text (or whether it's decorative), caption and credit.",
    input: z.object({ id: Id, ...UpdateMediaBody.shape }),
    target: ({ id }) => id,
    run: ({ api }, { id, ...details }) => api.patch(`/api/media/${id}`, defined(details)),
  }),
];
