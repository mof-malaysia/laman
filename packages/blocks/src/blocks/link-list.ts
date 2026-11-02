import { z } from "zod";
import { Href, field } from "../fields.js";
import { defineBlock } from "../define.js";

const Item = z.object({
  label: field.text("Label", { max: 120 }),
  description: field.textarea("Description", { max: 200 }).optional(),
  href: Href.meta({ title: "Link", widget: "text" }).optional(),
  file: field.media("File to download", { kind: "any" }).optional(),
});

export const linkList = defineBlock({
  type: "linkList",
  label: "Link list",
  description:
    "A heading and a list of links or files to download: services, forms, related pages.",
  group: "content",
  icon: "list",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    items: field.list("Links", Item, { min: 1, max: 30 }),
  }),
  defaults: {
    title: "Perkhidmatan berkaitan",
    items: [
      { label: "Semak status permohonan", description: "Dengan nombor rujukan anda.", href: "/" },
      { label: "Soalan lazim", href: "/" },
    ],
  },
});
