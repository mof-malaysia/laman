import { z } from "zod";
import { Href, field } from "../fields.js";
import { defineBlock } from "../define.js";

/** Icons a feature may use; the renderer maps each to its FTDS icon. */
export const featureIcons = [
  "money",
  "document",
  "calendar",
  "user-group",
  "govt-office",
  "globe",
  "check-shield",
  "bell",
] as const;

const Feature = z.object({
  icon: field
    .select("Icon", featureIcons, {
      money: "Money",
      document: "Document",
      calendar: "Calendar",
      "user-group": "People",
      "govt-office": "Government office",
      globe: "Globe",
      "check-shield": "Shield",
      bell: "Bell",
    })
    .optional(),
  title: field.text("Title", { max: 80 }),
  description: field.textarea("Description", { max: 240 }).optional(),
  href: Href.meta({ title: "Link", widget: "text" }).optional(),
});

export const featureGrid = defineBlock({
  type: "featureGrid",
  label: "Feature grid",
  description: "A section title and a grid of features, each with an icon, text and a link.",
  group: "content",
  icon: "grid",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Title", { max: 120, inline: true }).optional(),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    columns: field.select("Columns", ["2", "3"], { "2": "Two", "3": "Three" }).default("3"),
    surface: field
      .select("Cards", ["none", "sheet"], { none: "No card", sheet: "Card" })
      .default("none"),
    tone: field
      .select("Background", ["paper", "well"], { paper: "Paper", well: "Well" })
      .default("paper"),
    features: field.list("Features", Feature, { min: 1, max: 9 }),
  }),
  defaults: {
    title: "Perkhidmatan kami",
    description: "Apa yang boleh anda lakukan dalam talian.",
    columns: "3",
    surface: "none",
    tone: "paper",
    features: [
      { icon: "money", title: "Bayar dalam talian", description: "FPX, kad dan e-dompet." },
      {
        icon: "document",
        title: "Mohon permit",
        description: "Hantar permohonan tanpa ke kaunter.",
      },
      {
        icon: "calendar",
        title: "Tempah janji temu",
        description: "Pilih tarikh dan masa yang sesuai.",
      },
    ],
  },
});
