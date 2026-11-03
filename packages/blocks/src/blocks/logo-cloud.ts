import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Logo = z.object({
  logo: field.media("Logo"),
  name: field.text("Organisation (the logo's alt text)", { max: 120 }),
  href: field.href().optional(),
});

/** A quiet row of the logos of agencies or partners that use a service. */
export const logoCloud = defineBlock({
  type: "logoCloud",
  label: "Logos",
  description: "A quiet row of the logos of agencies or partners that use a service.",
  group: "content",
  icon: "globe",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    logos: field.list("Logos", Logo, { max: 12 }),
    muted: field.toggle("Grey until hovered").default(true),
  }),
  defaults: { title: "Agensi yang menggunakan perkhidmatan ini", logos: [] },
});
