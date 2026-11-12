import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

/**
 * A listing's events by month, in one of two layouts. Calendar: the
 * month as a large grid, events in their days, multi-day events as bars,
 * colour by location. Planner: a small calendar and the filters beside the
 * month's events, listed day by day. Every month and filter is its own
 * published page, so both work without a script. Takes the Entry list's place
 * on a listing.
 */
export const eventCalendar = defineBlock({
  type: "eventCalendar",
  label: "Event calendar",
  description:
    "This listing's events by month, as a calendar or a planner, filtered by category and location.",
  group: "listing",
  icon: "calendar",
  kinds: ["listing"],
  props: z.object({
    layout: field
      .select("Layout", ["wall", "planner"], {
        wall: "Calendar",
        planner: "Planner",
      })
      .default("wall"),
    categoryFilter: field.toggle("Show the category filter").default(true),
    categoryLabel: panel(field.text("What the categories are called", { max: 40 }), {
      help: "Shown over the category filter, e.g. Pasukan. “Kategori” if left empty.",
    }).optional(),
    locationFilter: field.toggle("Show the location filter").default(true),
    emptyText: field
      .text("Text when a month has no events", { max: 200 })
      .default("Tiada acara pada bulan ini."),
    tone: field.tone(),
  }),
  defaults: {
    layout: "wall",
    categoryFilter: true,
    locationFilter: true,
    emptyText: "Tiada acara pada bulan ini.",
  },
});
