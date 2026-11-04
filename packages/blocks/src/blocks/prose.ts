import { z } from "zod";
import { defineBlock } from "../define.js";
import { field } from "../fields.js";
import { RichText, paragraphs } from "../rich-text.js";

export const prose = defineBlock({
  type: "prose",
  label: "Text",
  description: "Long-form text: headings, paragraphs, lists, links and quotes.",
  group: "content",
  icon: "text",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    body: RichText.meta({ title: "Text", widget: "richtext" }),
    width: field.column(),
  }),
  defaults: {
    body: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Tajuk bahagian" }],
        },
        ...paragraphs("Tulis kandungan anda di sini.").content,
      ],
    },
  },
});
