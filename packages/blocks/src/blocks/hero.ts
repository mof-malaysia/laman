import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

export const hero = defineBlock({
  type: "hero",
  label: "Hero",
  description: "The page's opening section, with its only h1 and up to two actions.",
  group: "opening",
  icon: "star",
  kinds: ["page", "listing"],
  props: z.object({
    eyebrow: field.text("Eyebrow", { max: 40, inline: true }).optional(),
    title: field.text("Title", { max: 120, inline: true }),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    primaryAction: field.action("Primary action").optional(),
    secondaryAction: field.action("Secondary action").optional(),
  }),
  defaults: {
    title: "Tajuk halaman",
    description: "Terangkan dalam satu atau dua ayat apa yang boleh dilakukan di halaman ini.",
    primaryAction: { label: "Mula", href: "/" },
  },
});
