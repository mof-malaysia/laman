import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";
import { featureIcon } from "./feature-grid.js";

const Service = z.object({
  icon: featureIcon.optional(),
  title: field.text("Service", { max: 80 }),
  description: field.textarea("One sentence", { max: 200 }).optional(),
  href: field.href().min(1),
  facts: field
    .list(
      "Facts, e.g. Dalam talian, 10 minit, Percuma",
      z.object({ text: field.text("Fact", { max: 40 }) }),
      {
        max: 4,
      },
    )
    .optional(),
  tag: field.text("Tag beside the name, e.g. Baharu", { max: 20 }).optional(),
});

/** Cards that each lead to a service: the way in to an agency's top tasks. */
export const serviceHighlights = defineBlock({
  type: "serviceHighlights",
  label: "Services",
  description: "Cards that each lead to a service, with one sentence and short facts.",
  group: "content",
  icon: "direction",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    services: field.list("Services", Service, { min: 1, max: 9 }),
    columns: field.columns(["2", "3"], "3"),
    tone: field.tone(),
  }),
  defaults: {
    title: "Perkhidmatan popular",
    services: [
      {
        icon: "money",
        title: "Bayar bil",
        description: "Yuran, kompaun dan cukai taksiran.",
        href: "/",
        facts: [{ text: "Dalam talian" }, { text: "3 minit" }],
      },
      {
        icon: "document",
        title: "Mohon permit",
        description: "Hantar permohonan tanpa ke kaunter.",
        href: "/",
        facts: [{ text: "Dalam talian" }, { text: "14 hari bekerja" }],
      },
      {
        icon: "calendar",
        title: "Tempah janji temu",
        description: "Pilih tarikh dan masa yang sesuai.",
        href: "/",
        facts: [{ text: "Percuma" }],
      },
    ],
  },
});
