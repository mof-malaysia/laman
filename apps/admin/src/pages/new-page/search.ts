import { type TemplateId, type TemplateKind, templateIds, templateKinds } from "@fiscal-sb/blocks";

export const newPageSteps = ["kind", "start", "place", "name", "check"] as const;
export type NewPageStep = (typeof newPageSteps)[number];

/** The flow's state lives in the address, so Back, refresh and links keep the place. */
export type NewPageSearch = {
  step?: NewPageStep;
  /** An ordinary page, or a collection of dated entries. */
  kind?: TemplateKind;
  template?: TemplateId;
  parent?: string;
  title?: string;
  slug?: string;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" && value ? value.slice(0, max) : undefined;

export function newPageSearch(search: Record<string, unknown>): NewPageSearch {
  const step = newPageSteps.find((s) => s === search.step);
  const template = templateIds.find((id) => id === search.template);
  const parent = text(search.parent, 40);
  const title = text(search.title, 160);
  const slug = text(search.slug, 80);
  const kind = templateKinds.find((k) => k === search.kind);
  return {
    ...(step && { step }),
    ...(kind && { kind }),
    ...(template && { template }),
    ...(parent && { parent }),
    ...(title && { title }),
    ...(slug && { slug }),
  };
}
