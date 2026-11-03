import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/** The newest few entries of a listing page, such as "Berita terkini" on the home page. */
export const latestEntries = defineBlock({
  type: "latestEntries",
  label: "Latest entries",
  description: "The newest entries of a listing page, with a link to see them all.",
  group: "listing",
  icon: "rss",
  kinds: ["page"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    listing: field.page("Listing page", { kind: "listing" }).optional(),
    count: field
      .select("How many", ["3", "4", "5", "6"], { "3": "3", "4": "4", "5": "5", "6": "6" })
      .default("3"),
    style: field
      .select("Style", ["grid", "list", "compact"], {
        grid: "Cards",
        list: "List",
        compact: "Headlines only",
      })
      .default("grid"),
    category: field
      .text("Only this category (its address, e.g. siaran-media)", { max: 80 })
      .optional(),
    seeAll: field.text("See all link text", { max: 40 }).optional(),
    tone: field.tone(),
  }),
  defaults: { title: "Berita terkini", count: "3", style: "grid", seeAll: "Semua berita" },
});
