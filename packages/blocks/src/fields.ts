/**
 * Field builders for block schemas. Each is a Zod schema with `.meta()` that
 * says how the property panel edits it; `fieldsOf()` reads that back through
 * Zod's JSON Schema output, so the schema is the only description of a block.
 */
import { z } from "zod";

export type Widget =
  | "text"
  | "textarea"
  | "richtext"
  | "select"
  | "icon"
  | "link"
  | "list"
  | "group"
  | "media"
  | "toggle"
  | "page"
  /** An address for the Embed block: text, with what the site allows to embed. */
  | "embed";

type Meta = {
  /** Shown in the property panel. */
  title: string;
  widget: Widget;
  /** Edited in place on the canvas as well as in the panel. */
  inline?: boolean;
  /** Option labels for a select, keyed by value. */
  optionLabels?: Record<string, string>;
  /** What a media field accepts: images, documents, or any file in the library. */
  mediaKind?: MediaKind;
  /** What a page field offers: any page, or listing pages only (not where the field is offered: see `kinds`). */
  pageKind?: "any" | "listing";
  /** Shown only when each named sibling field holds one of its values; see `panel`. */
  when?: When;
  /** Offered only on these kinds of page; see `panel`. */
  kinds?: readonly PageKind[];
  /** A site feature it needs: locked, with a note, while that's off; see `panel`. */
  needs?: SiteFeature;
  /** One line under the field in the property panel. */
  help?: string;
  /** An example in the empty field: site content, so in the site's language, never translated. */
  placeholder?: string;
};

/** What a page is: an ordinary page, a listing of entries, or an entry under one. */
export type PageKind = "page" | "listing" | "entry";

export type MediaKind = "image" | "document" | "any";

/** A site-wide feature a field can need, set up outside the page. */
export type SiteFeature = "siteSearch";

/**
 * Sibling field name to the values it must hold for a field to show, e.g.
 * `{ layout: ["split"] }`; a toggle's values are "true" and "false".
 */
export type When = Record<string, readonly string[]>;

const meta = (m: Meta) => m;

/**
 * Adds panel behaviour to a field: `when` hides it unless its siblings hold
 * the given values, `kinds` unless the page is one of those kinds (hidden
 * fields keep their values, and the renderer ignores them), `needs` locks a
 * toggle while that site feature is off (the panel says why), `help` adds a
 * line under it. Wrap the field before `.optional()` or `.default()`.
 */
export const panel = <T extends z.ZodType>(
  schema: T,
  extra: { when?: When; kinds?: readonly PageKind[]; needs?: SiteFeature; help?: string },
): T => schema.meta({ ...(schema.meta() as Meta), ...extra }) as T;

/** Whether a field shows, given its siblings' values (or their defaults) and the page's kind. */
export function fieldShown(
  spec: FieldSpec,
  siblings: unknown,
  specs: FieldSpec[],
  kind?: PageKind,
): boolean {
  if (spec.kinds && kind && !spec.kinds.includes(kind)) return false;
  if (!spec.when) return true;
  const values = (siblings ?? {}) as Record<string, unknown>;
  return Object.entries(spec.when).every(([name, allowed]) => {
    const value = values[name] ?? specs.find((s) => s.name === name)?.defaultValue;
    return (
      (typeof value === "string" || typeof value === "boolean") && allowed.includes(String(value))
    );
  });
}

/**
 * Links editors may write: site paths, anchors, web and mail addresses.
 * Anything else (`javascript:`, `data:`) is rejected.
 */
export const Href = z
  .string()
  .max(500)
  .regex(/^(\/|#|https?:\/\/|mailto:|$)/, "Start the link with /, #, https:// or mailto:");

type Tone = "paper" | "well" | "primary" | "accent";
const toneLabels: Record<Tone, string> = {
  paper: "Paper",
  well: "Well",
  primary: "Primary wash",
  accent: "Accent wash",
};

type Columns = "2" | "3" | "4";
const columnLabels: Record<Columns, string> = { "2": "Two", "3": "Three", "4": "Four" };

export const field = {
  text: (title: string, options: { max?: number; inline?: boolean; placeholder?: string } = {}) =>
    z
      .string()
      .max(options.max ?? 160)
      .meta(
        meta({ title, widget: "text", inline: options.inline, placeholder: options.placeholder }),
      ),

  textarea: (title: string, options: { max?: number; inline?: boolean } = {}) =>
    z
      .string()
      .max(options.max ?? 600)
      .meta(meta({ title, widget: "textarea", inline: options.inline })),

  select: <const T extends readonly [string, ...string[]]>(
    title: string,
    options: T,
    optionLabels: Record<T[number], string>,
  ) => z.enum(options).meta(meta({ title, widget: "select", optionLabels })),

  /** A choice of icon, by name: the panel shows the icons themselves. */
  icon: <const T extends readonly [string, ...string[]]>(
    title: string,
    options: T,
    optionLabels: Record<T[number], string>,
  ) => z.enum(options).meta(meta({ title, widget: "icon", optionLabels })),

  /**
   * The band behind a block, from the FTDS tones it takes; the first is the
   * default. "primary" is the primary wash, never a solid band; "accent" is the
   * accent's wash, or primary's on a site without an accent.
   */
  tone: <const T extends readonly [Tone, ...Tone[]] = readonly ["paper", "well"]>(
    tones: T = ["paper", "well"] as unknown as T,
  ) =>
    z
      .enum(tones)
      .meta(meta({ title: "Background", widget: "select", optionLabels: toneLabels }))
      .default(tones[0] as T[number]),

  /** Columns of cards on desktop; the renderer passes `Number(value)` to FTDS. */
  columns: <const T extends readonly [Columns, ...Columns[]]>(counts: T, fallback: T[number]) =>
    z
      .enum(counts)
      .meta(meta({ title: "Columns", widget: "select", optionLabels: columnLabels }))
      .default(fallback),

  /** Rows or a grid of cards, for FTDS list blocks. */
  style: () =>
    z
      .enum(["list", "cards"])
      .meta(
        meta({ title: "Style", widget: "select", optionLabels: { list: "List", cards: "Cards" } }),
      )
      .default("list"),

  /** A link: a site path, an anchor, a web or mail address (`Href`). */
  href: (title = "Link") => Href.meta(meta({ title, widget: "text" })),

  /** A map of a place: a web address on https. */
  mapLink: (title = "Map link") =>
    z
      .string()
      .max(500)
      .regex(/^https:\/\//, "Enter a web address starting with https://")
      .meta(meta({ title, widget: "text" })),

  /** Which side a block's picture sits on, on desktop; `when` limits it to some layouts. */
  mediaPosition: (when?: When) => {
    const select = z.enum(["right", "left"]).meta(
      meta({
        title: "Picture side",
        widget: "select",
        optionLabels: { right: "Right", left: "Left" },
      }),
    );
    return (when ? panel(select, { when }) : select).default("right");
  },

  /** A link styled as a button. Rendered only when both parts are filled in. */
  action: (title: string) =>
    z
      .object({
        label: z
          .string()
          .max(60)
          .meta(meta({ title: "Label", widget: "text" })),
        href: Href.meta(meta({ title: "Link", widget: "text" })),
      })
      .meta(meta({ title, widget: "link" })),

  /**
   * A file from the media library, by id, so replacing the file updates every
   * use. `alt` overrides the library's alt text for this use.
   */
  media: (title: string, options: { kind?: MediaKind } = {}) =>
    z
      .object({ mediaId: z.uuid(), alt: z.string().max(250).optional() })
      .meta(meta({ title, widget: "media", mediaKind: options.kind ?? "image" })),

  /**
   * The column a block sits in. "Follow page" takes the page's column: an
   * entry's article column, or elsewhere the width of the page's intro. So a
   * page's text, lists and pictures start where its title does.
   */
  column: () =>
    panel(
      field.select("Width", ["page", "article", "wide"], {
        page: "Follow page",
        article: "Text column",
        wide: "Wide",
      }),
      { help: "Follow page lines the block up with the page's title." },
    ).default("page"),

  /** The page intro's column, which blocks set to "Follow page" take too. */
  pageColumn: () =>
    panel(field.select("Width", ["wide", "article"], { wide: "Wide", article: "Text column" }), {
      help: "Text column sets the page like an article: blocks that follow the page take it too.",
    }).default("wide"),

  /** On or off. */
  toggle: (title: string) => z.boolean().meta(meta({ title, widget: "toggle" })),

  /** A page from the tree, by id. */
  page: (title: string, options: { kind?: "any" | "listing" } = {}) =>
    z.uuid().meta(meta({ title, widget: "page", pageKind: options.kind ?? "any" })),

  list: <T extends z.ZodType>(title: string, item: T, limits: { min?: number; max: number }) =>
    z
      .array(item)
      .min(limits.min ?? 0)
      .max(limits.max)
      .meta(meta({ title, widget: "list" })),

  group: <T extends z.ZodRawShape>(title: string, shape: T) =>
    z.object(shape).meta(meta({ title, widget: "group" })),
};

/** What the property panel needs to know about one field. */
export type FieldSpec = {
  name: string;
  title: string;
  widget: Widget;
  required: boolean;
  inline: boolean;
  maxLength?: number;
  options?: { value: string; label: string }[];
  /** Sub-fields of a link, group or list item. */
  fields?: FieldSpec[];
  minItems?: number;
  maxItems?: number;
  mediaKind?: MediaKind;
  pageKind?: "any" | "listing";
  when?: When;
  kinds?: readonly PageKind[];
  needs?: SiteFeature;
  help?: string;
  placeholder?: string;
  /** The schema's default, which `when` reads when the sibling is unset. */
  defaultValue?: unknown;
};

type JsonSchema = {
  type?: string;
  title?: string;
  widget?: Widget;
  inline?: boolean;
  optionLabels?: Record<string, string>;
  mediaKind?: MediaKind;
  pageKind?: "any" | "listing";
  when?: When;
  kinds?: readonly PageKind[];
  needs?: SiteFeature;
  help?: string;
  placeholder?: string;
  default?: unknown;
  enum?: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

function specsOf(object: JsonSchema): FieldSpec[] {
  const required = new Set(object.required ?? []);
  return Object.entries(object.properties ?? {}).flatMap(([name, s]) => {
    if (!s.widget) return [];
    const spec: FieldSpec = {
      name,
      title: s.title ?? name,
      widget: s.widget,
      required: required.has(name),
      inline: s.inline ?? false,
    };
    if (s.maxLength !== undefined) spec.maxLength = s.maxLength;
    if (s.mediaKind) spec.mediaKind = s.mediaKind;
    if (s.pageKind) spec.pageKind = s.pageKind;
    if (s.when) spec.when = s.when;
    if (s.kinds) spec.kinds = s.kinds;
    if (s.needs) spec.needs = s.needs;
    if (s.help) spec.help = s.help;
    if (s.placeholder) spec.placeholder = s.placeholder;
    if (s.default !== undefined) spec.defaultValue = s.default;
    if (s.enum)
      spec.options = s.enum.map((value) => ({ value, label: s.optionLabels?.[value] ?? value }));
    if (s.widget === "link" || s.widget === "group") spec.fields = specsOf(s);
    if (s.widget === "list" && s.items) {
      spec.fields = specsOf(s.items);
      if (s.minItems !== undefined) spec.minItems = s.minItems;
      if (s.maxItems !== undefined) spec.maxItems = s.maxItems;
    }
    return [spec];
  });
}

/** The property panel's fields for a block's props schema. */
export function fieldsOf(props: z.ZodObject): FieldSpec[] {
  // "input" so fields with defaults are optional, as an editor sees them.
  const json = z.toJSONSchema(props, { io: "input", unrepresentable: "any" }) as JsonSchema;
  return specsOf(json);
}
