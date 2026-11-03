import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";
import { featureIcon } from "./feature-grid.js";

const Option = z.object({
  icon: featureIcon.optional(),
  title: field.text("Way", { max: 80 }),
  description: field.textarea("Who it suits", { max: 200 }).optional(),
  action: field.action("Action"),
  recommended: field.toggle("Recommended: the one most people should take").default(false),
});

/** Two or three ways to do the same thing, each with its own action. */
export const ctaCards = defineBlock({
  type: "ctaCards",
  label: "Ways to do it",
  description: "Two or three ways to do the same thing, such as online, at a counter or by post.",
  group: "action",
  icon: "swap",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    options: field
      .list("Ways", Option, { min: 2, max: 3 })
      .refine((options) => options.filter((o) => o.recommended).length <= 1, {
        message: "Recommend one way at most: it gets the page's one filled button",
      }),
    tone: field.tone(["well", "paper"]),
  }),
  defaults: {
    title: "Pilih cara memohon",
    options: [
      {
        icon: "globe",
        title: "Dalam talian",
        description: "Paling cepat. Anda perlukan MyDigital ID.",
        action: { label: "Mohon dalam talian", href: "/" },
        recommended: true,
      },
      {
        icon: "govt-office",
        title: "Di kaunter",
        description: "Bawa MyKad dan dokumen sokongan anda.",
        action: { label: "Cari pejabat", href: "/" },
      },
    ],
  },
});
