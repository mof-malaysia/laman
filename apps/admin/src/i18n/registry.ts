/**
 * The block registry and page templates in the admin's language. The
 * registry is written in English (`packages/blocks`); read its text through
 * these helpers, never `.label`, `.description` or `.name` directly, so a new
 * screen can't show English in the BM admin by accident. See `rt` in `./index.ts`.
 */
import {
  type BlockType,
  type FieldSpec,
  type TemplateId,
  blockFields,
  blocks,
  templates,
} from "@laman/blocks";
import { rt } from "./index";

const definitionOf = (type: string) => blocks.find((b) => b.type === type);

/** A block's name, as the palette, layers and panel show it; the type itself if it's no longer registered. */
export const blockLabel = (type: string) => {
  const definition = definitionOf(type);
  return definition ? rt(definition.label) : type;
};

/** A block's one-line description. */
export const blockDescription = (type: string) => {
  const definition = definitionOf(type);
  return definition ? rt(definition.description) : "";
};

/** A page template's name. */
export const templateName = (id: TemplateId) => rt(templates[id].name);

/** A page template's one-line description. */
export const templateDescription = (id: TemplateId) => rt(templates[id].description);

/** Field specs with every label, help line and option in the admin's language. */
export const localFields = (specs: FieldSpec[]): FieldSpec[] =>
  specs.map((spec) => ({
    ...spec,
    title: rt(spec.title),
    ...(spec.help && { help: rt(spec.help) }),
    ...(spec.options && { options: spec.options.map((o) => ({ ...o, label: rt(o.label) })) }),
    ...(spec.fields && { fields: localFields(spec.fields) }),
  }));

/** `blockFields` in the admin's language. */
export const localBlockFields = (type: BlockType) => localFields(blockFields(type));

/** Every translatable string in field specs, nested fields included: what `localFields` translates. */
export function* specStrings(specs: FieldSpec[]): Generator<string> {
  for (const spec of specs) {
    yield spec.title;
    if (spec.help) yield spec.help;
    for (const option of spec.options ?? []) yield option.label;
    if (spec.fields) yield* specStrings(spec.fields);
  }
}

/**
 * The spec of the field a prop path points at (`title`, `items.0.label`), in
 * the admin's language: list indices are skipped.
 */
function fieldSpecAt(type: BlockType, path: string): FieldSpec | undefined {
  let specs: FieldSpec[] | undefined = localBlockFields(type);
  let spec: FieldSpec | undefined;
  for (const part of path.split(".")) {
    if (/^\d+$/.test(part)) continue;
    spec = specs?.find((s) => s.name === part);
    specs = spec?.fields;
  }
  return spec;
}

/** The label of the field a prop path points at, in the admin's language. */
export const fieldLabelAt = (type: BlockType, path: string): string | undefined =>
  fieldSpecAt(type, path)?.title;
