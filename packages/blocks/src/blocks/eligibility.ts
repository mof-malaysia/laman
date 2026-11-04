import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Criterion = z.object({ text: field.text("Criterion", { max: 200 }) });

/** Who can apply, and who can't, before they start. */
export const eligibility = defineBlock({
  type: "eligibility",
  label: "Eligibility",
  description: "Who can apply, as a checklist, and optionally who can't.",
  group: "content",
  icon: "check-circle",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    criteriaTitle: field.text("Heading of who can apply", { max: 80 }).optional(),
    criteria: field.list("Who can apply (finish the heading's sentence)", Criterion, {
      min: 1,
      max: 12,
    }),
    exclusionsTitle: field.text("Heading of who can't", { max: 80 }).optional(),
    exclusions: field.list("Who can't apply", Criterion, { max: 12 }).optional(),
    note: field
      .textarea("Note: exceptions, or where to ask", { max: 300, inline: true })
      .optional(),
    tone: field.tone(),
    width: field.column(),
  }),
  defaults: {
    criteria: [
      { text: "warganegara Malaysia" },
      { text: "berumur 18 tahun ke atas" },
      { text: "berpendapatan RM5,000 sebulan atau kurang" },
    ],
    note: "Tidak pasti? Hubungi kami sebelum memohon.",
  },
});
