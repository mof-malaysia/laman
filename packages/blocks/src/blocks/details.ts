import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";
import { RichText, paragraphs } from "../rich-text.js";

/** Short help behind a link, for what only some people need. */
export const details = defineBlock({
  type: "details",
  label: "Details",
  description: "Short help behind a link, for what only some people need.",
  group: "content",
  icon: "eye-show",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    summary: field.text("Link text, as the reader's question", { max: 120, inline: true }),
    body: RichText.meta({ title: "Help", widget: "richtext" }),
    width: field.column(),
  }),
  defaults: {
    summary: "Saya tidak menjumpai nombor rujukan saya",
    body: paragraphs("Nombor rujukan anda ada pada surat yang kami hantar, di bawah nama anda."),
  },
});
