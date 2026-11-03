import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/** A passage set apart from the text around it: a deadline, a requirement, a quote. */
export const insetText = defineBlock({
  type: "insetText",
  label: "Inset text",
  description: "A deadline, requirement or quote set apart from the text around it.",
  group: "content",
  icon: "chat-bubble",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    text: field.textarea("Text", { max: 600, inline: true }),
    author: field.text("Who said it (makes it a quote)", { max: 120, inline: true }).optional(),
  }),
  defaults: {
    text: "Hantar permohonan anda sebelum 30 April 2027 untuk mengelakkan penalti lewat.",
  },
});
