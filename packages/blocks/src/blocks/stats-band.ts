import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Stat = z.object({
  value: field.text("Figure, e.g. RM 4.2 bil", { max: 16 }),
  label: field.text("What it counts", { max: 80 }),
  footnote: field.text("Footnote", { max: 120 }).optional(),
});

/** Two to four headline figures that share one source. */
export const statsBand = defineBlock({
  type: "statsBand",
  label: "Figures",
  description: "Two to four headline figures, with the source they share.",
  group: "content",
  icon: "table",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    stats: field.list("Figures", Stat, { min: 2, max: 4 }),
    source: field.text("Source and date", { max: 160, inline: true }).optional(),
  }),
  defaults: {
    title: "Perkhidmatan dalam angka",
    stats: [
      { value: "1.8 juta", label: "Bayaran dalam talian sebulan" },
      { value: "98%", label: "Permohonan diproses dalam 14 hari" },
      { value: "30", label: "Agensi menggunakan perkhidmatan ini" },
    ],
    source: "Sumber: data dalaman, September 2026",
  },
});
