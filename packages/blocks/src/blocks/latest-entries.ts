import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

/** Entries a latest-entries block can reach, "Show more" included. */
export const LATEST_MAX = 24;

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
      .select("How many", ["3", "4", "5", "6", "8", "9", "12"], {
        "3": "3",
        "4": "4",
        "5": "5",
        "6": "6",
        "8": "8",
        "9": "9",
        "12": "12",
      })
      .default("3"),
    /** Reveals that many more at a time, up to LATEST_MAX, without leaving the page. */
    showMore: field.toggle("Show a “Show more” button").default(false),
    showMoreText: panel(field.text("Show more button text", { max: 40 }), {
      help: "Used when Show more is on. “Lihat lagi” if left empty.",
    }).optional(),
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
  defaults: {
    title: "Berita terkini",
    count: "3",
    style: "grid",
    seeAll: "Semua berita",
    showMore: false,
  },
});
