import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Link = z.object({
  label: field.text("Label", { max: 120 }),
  description: field.textarea("Description", { max: 200 }).optional(),
  href: field.href().min(1),
});

/**
 * Related pages, services and other websites. A link to another website gets
 * an outgoing arrow and says so, worked out from its address. Files go in a
 * Downloads block, so people see their type and size.
 */
export const linkList = defineBlock({
  type: "linkList",
  label: "Links",
  description: "A heading and links to related pages, services and other websites.",
  group: "content",
  icon: "link",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    items: field.list("Links", Link, { min: 1, max: 30 }),
    layout: field
      .select("Style", ["list", "cards"], { list: "List", cards: "Cards" })
      .default("list"),
    tone: field.tone(),
  }),
  defaults: {
    title: "Pautan berkaitan",
    items: [
      { label: "Semak status permohonan", description: "Dengan nombor rujukan anda.", href: "/" },
      { label: "Soalan lazim", href: "/" },
    ],
  },
});
