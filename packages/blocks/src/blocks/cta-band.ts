import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

export const ctaBand = defineBlock({
  type: "ctaBand",
  label: "Call to action",
  description: "The closing call to action of a page: a title, short text and one or two actions.",
  group: "action",
  icon: "megaphone",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Title", { max: 120, inline: true }),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    primaryAction: field.action("Primary action"),
    secondaryAction: field.action("Secondary action").optional(),
    tone: field.tone(["well", "primary"]),
  }),
  defaults: {
    title: "Sedia untuk bermula?",
    description: "Ia mengambil masa kira-kira tiga minit.",
    primaryAction: { label: "Mula sekarang", href: "/" },
    tone: "well",
  },
});
