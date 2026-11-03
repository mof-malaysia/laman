import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

/** The layouts that show a picture. */
const withPicture = { layout: ["split", "image"] } as const;

export const hero = defineBlock({
  type: "hero",
  label: "Hero",
  description:
    "The opening of a home or campaign page, with its only h1, up to two actions and an optional picture.",
  group: "opening",
  icon: "star",
  kinds: ["page", "listing"],
  props: z.object({
    eyebrow: field.text("Eyebrow", { max: 40, inline: true }).optional(),
    title: field.text("Title", { max: 120, inline: true }),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    footnote: field.text("Line under the actions", { max: 120, inline: true }).optional(),
    media: panel(field.media("Picture"), {
      when: withPicture,
      help: "The text sits on a panel, so it stays readable on any photo. Leave the alt text empty if the picture is only decoration.",
    }).optional(),
    primaryAction: field.action("Primary action").optional(),
    secondaryAction: field.action("Secondary action").optional(),
    layout: field
      .select("Layout", ["stacked", "split", "image"], {
        stacked: "Text only",
        split: "Text beside a picture",
        image: "Picture behind the text",
      })
      .default("stacked"),
    align: panel(
      field.select("Alignment", ["start", "center"], { start: "Left", center: "Centred" }),
      { when: { layout: ["stacked"] } },
    ).default("start"),
    mediaPosition: field.mediaPosition({ layout: ["split"] }),
    tone: field.tone(["paper", "well", "primary"]),
  }),
  defaults: {
    title: "Tajuk halaman",
    description: "Terangkan dalam satu atau dua ayat apa yang boleh dilakukan di halaman ini.",
    primaryAction: { label: "Mula", href: "/" },
  },
});
