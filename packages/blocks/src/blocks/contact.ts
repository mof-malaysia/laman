import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/**
 * How to reach the agency. The details come from the site settings, so
 * they're the same everywhere; each can be overridden for this block.
 */
export const contact = defineBlock({
  type: "contact",
  label: "Contact",
  description: "Phone, email, office hours and the office address, from the site settings.",
  group: "contact",
  icon: "phone",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    officeName: field.text("Office name", { max: 120 }).optional(),
    mapUrl: field.mapLink().optional(),
    overrides: field
      .group("Instead of the site settings", {
        address: field.textarea("Address", { max: 300 }).optional(),
        phone: field.text("Phone", { max: 40 }).optional(),
        email: field.text("Email", { max: 200 }).optional(),
        hours: field.textarea("Office hours", { max: 200 }).optional(),
      })
      .optional(),
  }),
  defaults: { title: "Hubungi kami" },
});
