import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/**
 * A listing's events by month: the month as a calendar, with its events
 * listed day by day under it, links to the months either side, and filters by
 * category and location. Every month and filter is its own published page, so
 * it needs no script. Takes the Entry list's place on a listing.
 */
export const eventCalendar = defineBlock({
  type: "eventCalendar",
  label: "Event calendar",
  description:
    "This listing's events by month: a calendar with the month's events listed under it, filtered by category and location.",
  group: "listing",
  icon: "calendar",
  kinds: ["listing"],
  props: z.object({
    categoryFilter: field.toggle("Show the category filter").default(true),
    locationFilter: field.toggle("Show the location filter").default(true),
    emptyText: field
      .text("Text when a month has no events", { max: 200 })
      .default("Tiada acara pada bulan ini."),
    tone: field.tone(),
  }),
  defaults: {
    categoryFilter: true,
    locationFilter: true,
    emptyText: "Tiada acara pada bulan ini.",
  },
});
