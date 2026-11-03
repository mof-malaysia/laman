import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

export const image = defineBlock({
  type: "image",
  label: "Image",
  description: "A picture from the media library, with a caption and its credit.",
  group: "content",
  icon: "gallery",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    image: field.media("Image").optional(),
    caption: field.text("Caption", { max: 200, inline: true }).optional(),
    width: field
      .select("Width", ["content", "wide", "full"], {
        content: "Text width",
        wide: "Wide",
        full: "Full width",
      })
      .default("content"),
    tone: field.tone(),
  }),
  defaults: { width: "content" },
});
