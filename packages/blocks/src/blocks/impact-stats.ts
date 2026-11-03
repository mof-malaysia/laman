import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Stat = z.object({
  value: field.text("Figure", { max: 16 }),
  label: field.text("What it counts", { max: 120 }),
  period: field.text("Period it covers", { max: 80 }).optional(),
  sourceLabel: field.text("Source", { max: 120 }).optional(),
  sourceHref: field.href("Link to the source").optional(),
});

/** What a programme has achieved, each figure with its period and source. */
export const impactStats = defineBlock({
  type: "impactStats",
  label: "Impact figures",
  description: "What a programme has achieved: each figure with its period and source.",
  group: "content",
  icon: "check-shield",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    stats: field.list("Figures", Stat, { min: 1, max: 8 }),
    columns: field.columns(["2", "3", "4"], "3"),
    tone: field.tone(["well", "paper"]),
  }),
  defaults: {
    title: "Kesan program",
    stats: [
      {
        value: "5.4 juta",
        label: "isi rumah menerima bantuan",
        period: "Januari hingga September 2026",
        sourceLabel: "Kementerian Kewangan",
      },
      {
        value: "RM 2.1 bil",
        label: "disalurkan terus ke akaun penerima",
        period: "2026",
        sourceLabel: "Kementerian Kewangan",
      },
      {
        value: "14 hari",
        label: "purata masa memproses permohonan",
        period: "Suku ketiga 2026",
        sourceLabel: "Data dalaman",
      },
    ],
  },
});
