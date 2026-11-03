import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const File = z.object({
  file: field.media("File", { kind: "document" }),
  title: field.text("Title (the file's name if empty)", { max: 120 }).optional(),
  description: field.textarea("Description", { max: 200 }).optional(),
});

/** Forms, guides and reports to download, each with its type and size in the link. */
export const downloadList = defineBlock({
  type: "downloadList",
  label: "Downloads",
  description: "Forms, guides and reports to download, with each file's type and size.",
  group: "content",
  icon: "pdf",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    files: field.list("Files", File, { max: 30 }),
    layout: field
      .select("Style", ["list", "cards"], { list: "List", cards: "Cards" })
      .default("list"),
    tone: field.tone(),
  }),
  defaults: { title: "Muat turun", files: [] },
});
