import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

export const callout = defineBlock({
  type: "callout",
  label: "Callout",
  description: "A short message with an icon: information, success, a warning or a problem.",
  group: "content",
  icon: "info",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    variant: field
      .select("Kind", ["info", "success", "warning", "danger"], {
        info: "Information",
        success: "Success",
        warning: "Warning",
        danger: "Problem",
      })
      .default("info"),
    title: field.text("Title", { max: 120, inline: true }),
    body: field.textarea("Text", { max: 600, inline: true }).optional(),
    action: field.action("Link under the message").optional(),
    width: field.column(),
  }),
  defaults: {
    variant: "info",
    title: "Makluman",
    body: "Kaunter ditutup pada cuti umum.",
  },
});
