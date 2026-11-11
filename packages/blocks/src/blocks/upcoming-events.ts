import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/** Coming events an upcoming events block can reach. */
export const UPCOMING_MAX = 12;

/** The next few events of a listing, such as "Acara akan datang" on the home page. */
export const upcomingEvents = defineBlock({
  type: "upcomingEvents",
  label: "Upcoming events",
  description:
    "The next events of a listing page, soonest first, with how many days are left and a link to the calendar.",
  group: "listing",
  icon: "calendar",
  kinds: ["page"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    listing: field.page("Listing page", { kind: "listing" }).optional(),
    count: field
      .select("How many", ["2", "3", "4", "6"], { "2": "2", "3": "3", "4": "4", "6": "6" })
      .default("3"),
    featuredOnly: field.toggle("Only pinned events").default(false),
    countdown: field.toggle("Show how many days are left").default(true),
    seeAll: field.text("See all link text", { max: 40 }).optional(),
    tone: field.tone(),
  }),
  defaults: {
    title: "Acara akan datang",
    count: "3",
    featuredOnly: false,
    countdown: true,
    seeAll: "Lihat semua acara",
  },
});
