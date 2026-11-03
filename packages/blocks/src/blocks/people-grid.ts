import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Person = z.object({
  name: field.text("Name", { max: 120 }),
  role: field.text("Position", { max: 160 }),
  photo: field.media("Photo").optional(),
  bio: field.textarea("Short bio", { max: 300 }).optional(),
  href: field.href("Profile page").optional(),
});

/** Leadership or a team: photo, name and position. */
export const peopleGrid = defineBlock({
  type: "peopleGrid",
  label: "People",
  description: "Leadership or a team: a photo, name and position for each person.",
  group: "content",
  icon: "user-group",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    people: field.list("People", Person, { min: 1, max: 24 }),
    featured: field
      .select("Larger cards", ["0", "1", "2"], {
        "0": "None",
        "1": "The first person",
        "2": "The first two",
      })
      .default("0"),
    tone: field.tone(),
  }),
  defaults: {
    title: "Pengurusan tertinggi",
    featured: "1",
    people: [
      { name: "Nama Ketua Pengarah", role: "Ketua Pengarah" },
      { name: "Nama Timbalan", role: "Timbalan Ketua Pengarah (Operasi)" },
      { name: "Nama Timbalan", role: "Timbalan Ketua Pengarah (Dasar)" },
    ],
  },
});
