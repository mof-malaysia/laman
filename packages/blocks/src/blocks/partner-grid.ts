import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

const Partner = z.object({
  name: field.text("Name", { max: 120 }),
  kind: field.text("Tag line above the name, e.g. an acronym", { max: 40 }).optional(),
  description: field.textarea("What it does here", { max: 200 }).optional(),
  logo: field.media("Logo").optional(),
  href: field.href().optional(),
});

/** The agencies or partners behind a service, and who does what. */
export const partnerGrid = defineBlock({
  type: "partnerGrid",
  label: "Partners",
  description: "The agencies or partners behind a service: logo, name, what each does, and a link.",
  group: "content",
  icon: "govt-office",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    partners: field.list("Partners", Partner, { min: 1, max: 12 }),
    columns: field.columns(["3", "4"], "3"),
    tone: field.tone(),
  }),
  defaults: {
    title: "Agensi yang terlibat",
    partners: [
      { name: "Lembaga Hasil Dalam Negeri", kind: "LHDN", description: "Cukai pendapatan." },
      {
        name: "Jabatan Kastam Diraja Malaysia",
        kind: "JKDM",
        description: "Cukai jualan dan perkhidmatan.",
      },
      { name: "Jabatan Akauntan Negara", kind: "JANM", description: "Pembayaran kerajaan." },
    ],
  },
});
