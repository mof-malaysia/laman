import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

/** A call to action with a picture and reasons, for the middle of a campaign page. */
export const ctaSplit = defineBlock({
  type: "ctaSplit",
  label: "Call to action with picture",
  description: "A call to action with a picture and up to four reasons, for the middle of a page.",
  group: "action",
  icon: "check",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Title", { max: 120, inline: true }),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    points: field
      .list("Reasons", z.object({ text: field.text("Reason", { max: 80 }) }), { max: 4 })
      .optional(),
    media: panel(field.media("Picture"), {
      help: "Leave the alt text empty if the picture is only decoration.",
    }).optional(),
    primaryAction: field.action("Primary action"),
    secondaryAction: field.action("Secondary action").optional(),
    mediaPosition: field.mediaPosition(),
    tone: field.tone(),
  }),
  defaults: {
    title: "Daftar sebelum 31 Disember",
    description: "Pendaftaran mengambil masa lima minit.",
    points: [{ text: "Tiada yuran" }, { text: "Guna MyDigital ID" }],
    primaryAction: { label: "Daftar sekarang", href: "/" },
  },
});
