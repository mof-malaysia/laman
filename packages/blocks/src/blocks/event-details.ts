import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";
import { RichText, paragraphs } from "../rich-text.js";

const Session = z.object({
  time: field.text("Time, e.g. 9.00 pagi", { max: 30 }),
  title: field.text("Session", { max: 120 }),
  detail: field.text("Speaker or detail", { max: 160 }).optional(),
});

/** An event's facts, registration and programme, beside what it's about. */
export const eventDetails = defineBlock({
  type: "eventDetails",
  label: "Event details",
  description:
    "An event's date, time, venue, fee and registration, beside what it's about and its programme.",
  group: "content",
  icon: "calendar",
  kinds: ["page", "entry"],
  props: z.object({
    date: field.text("Date as people read it, e.g. Khamis, 12 November 2026", { max: 60 }),
    time: field.text("Time", { max: 60 }).optional(),
    venue: field.textarea("Venue", { max: 200 }).optional(),
    fee: field.text("Fee", { max: 60 }).optional(),
    mapUrl: field.mapLink().optional(),
    registerAction: field.action("Registration").optional(),
    registerNote: field
      .text("Line under registration, e.g. when it closes", { max: 120 })
      .optional(),
    about: RichText.meta({ title: "About the event", widget: "richtext" }),
    programme: field.list("Programme", Session, { max: 20 }).optional(),
    width: field.column(),
  }),
  defaults: {
    date: "Khamis, 12 November 2026",
    time: "9.00 pagi hingga 1.00 petang",
    venue: "Dewan Perdana, Putrajaya",
    fee: "Percuma",
    about: paragraphs("Terangkan acara ini: untuk siapa, dan apa yang mereka dapat."),
    programme: [
      { time: "9.00 pagi", title: "Pendaftaran" },
      { time: "9.30 pagi", title: "Ucapan alu-aluan" },
    ],
  },
});
