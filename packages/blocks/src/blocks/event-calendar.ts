import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/**
 * A listing's events by date: coming events day by day, and a page per month,
 * with filters by category and location. Every view is its own published
 * page, so it needs no script. Takes the Entry list's place on a listing.
 */
export const eventCalendar = defineBlock({
  type: "eventCalendar",
  label: "Event calendar",
  description:
    "This listing's events by date: what's coming, day by day, and a month view, filtered by category and location.",
  group: "listing",
  icon: "calendar",
  kinds: ["listing"],
  props: z.object({
    monthView: field.toggle("Offer a month view").default(true),
    categoryFilter: field.toggle("Show the category filter").default(true),
    locationFilter: field.toggle("Show the location filter").default(true),
    emptyText: field
      .text("Text when there are no coming events", { max: 200 })
      .default("Tiada acara akan datang."),
    tone: field.tone(),
  }),
  defaults: {
    monthView: true,
    categoryFilter: true,
    locationFilter: true,
    emptyText: "Tiada acara akan datang.",
  },
});
