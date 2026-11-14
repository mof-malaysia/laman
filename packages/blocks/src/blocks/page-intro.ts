import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

/** The quieter opening of an inner page: breadcrumb, h1 and a short description. */
export const pageIntro = defineBlock({
  type: "pageIntro",
  label: "Page intro",
  description:
    "The opening of an inner page: the breadcrumb, the page's only h1 and a short description.",
  group: "opening",
  icon: "document",
  kinds: ["page", "listing"],
  props: z.object({
    eyebrow: field.text("Eyebrow", { max: 40, inline: true }).optional(),
    title: field.text("Title", { max: 120, inline: true }),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    // Primary first: a new intro carries the site's colour (docs/laman.md § Blocks).
    tone: field.tone(["primary", "accent", "well", "paper"]),
    width: field.pageColumn(),
    // A listing's own search: its entries, filtered as visitors type (docs/laman.md § Site search).
    search: panel(field.toggle("Search this listing"), { kinds: ["listing"] }).default(false),
    searchPlaceholder: panel(
      field.text("Search hint", { max: 60, placeholder: "Contoh: belanjawan, cukai" }),
      {
        kinds: ["listing"],
        when: { search: ["true"] },
      },
    ).optional(),
  }),
  defaults: {
    title: "Tajuk halaman",
    description: "Terangkan dalam satu atau dua ayat apa yang ada di halaman ini.",
  },
});
