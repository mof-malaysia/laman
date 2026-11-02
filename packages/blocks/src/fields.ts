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
  | "link"
  | "list"
  | "group"
  | "media"
  | "toggle"
  | "page";

type Meta = {
  /** Shown in the property panel. */
  title: string;
  widget: Widget;
  /** Edited in place on the canvas as well as in the panel. */
  inline?: boolean;
  /** Option labels for a select, keyed by value. */
  optionLabels?: Record<string, string>;
  /** What a media field accepts: images, or any file in the library. */
  mediaKind?: "image" | "any";
  /** What a page field offers: any page, or listing pages only. */
  pageKind?: "any" | "listing";
};

const meta = (m: Meta) => m;

/**
 * Links editors may write: site paths, anchors, web and mail addresses.
 * Anything else (`javascript:`, `data:`) is rejected.
 */
export const Href = z
  .string()
  .max(500)
  .regex(/^(\/|#|https?:\/\/|mailto:|$)/, "Start the link with /, #, https:// or mailto:");

export const field = {
  text: (title: string, options: { max?: number; inline?: boolean } = {}) =>
    z
      .string()
      .max(options.max ?? 160)
      .meta(meta({ title, widget: "text", inline: options.inline })),

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
  media: (title: string, options: { kind?: "image" | "any" } = {}) =>
    z
      .object({ mediaId: z.uuid(), alt: z.string().max(250).optional() })
      .meta(meta({ title, widget: "media", mediaKind: options.kind ?? "image" })),

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
  mediaKind?: "image" | "any";
  pageKind?: "any" | "listing";
};

type JsonSchema = {
  type?: string;
  title?: string;
  widget?: Widget;
  inline?: boolean;
  optionLabels?: Record<string, string>;
  mediaKind?: "image" | "any";
  pageKind?: "any" | "listing";
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
