import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/** A listing page's entries, newest first, pinned ones on top. Required, once, on a listing page. */
export const entryList = defineBlock({
  type: "entryList",
  label: "Entry list",
  description: "This listing's entries, newest first, in pages, with a category filter.",
  group: "listing",
  icon: "list",
  kinds: ["listing"],
  props: z.object({
    style: field
      .select("Style", ["cards", "list"], {
        cards: "Cards with a cover image",
        list: "Compact list",
      })
      .default("list"),
    perPage: field
      .select("Entries per page", ["6", "12", "24"], { "6": "6", "12": "12", "24": "24" })
      .default("12"),
    categoryFilter: field.toggle("Show the category filter").default(true),
    showSummary: field.toggle("Show the summary").default(true),
    showDate: field.toggle("Show the date").default(true),
    emptyText: field
      .text("Text when there are no entries yet", { max: 200 })
      .default("Belum ada kandungan lagi."),
  }),
  defaults: {
    style: "list",
    perPage: "12",
    categoryFilter: true,
    showSummary: true,
    showDate: true,
    emptyText: "Belum ada kandungan lagi.",
  },
});
