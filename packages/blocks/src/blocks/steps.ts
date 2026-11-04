import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Step = z.object({
  title: field.text("Title", { max: 120 }),
  description: field.textarea("What to do", { max: 400 }).optional(),
  link: field.action("Link").optional(),
});

/** How to apply, register or claim, as a numbered list. */
export const steps = defineBlock({
  type: "steps",
  label: "Steps",
  description: "How to apply, register or claim, in numbered steps, with a link on each.",
  group: "content",
  icon: "numbered-list",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    steps: field.list("Steps", Step, { min: 1, max: 12 }),
    action: field.action("Action under the steps").optional(),
    tone: field.tone(),
    width: field.column(),
  }),
  defaults: {
    title: "Cara memohon",
    steps: [
      { title: "Semak kelayakan anda", description: "Pastikan anda memenuhi semua syarat." },
      { title: "Sediakan dokumen", description: "Salinan MyKad dan slip gaji terkini." },
      { title: "Hantar permohonan", description: "Ia mengambil masa kira-kira 15 minit." },
    ],
  },
});
