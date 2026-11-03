import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";
import { RichText, paragraphs } from "../rich-text.js";

const Question = z.object({
  question: field.text("Question", { max: 200 }),
  answer: RichText.meta({ title: "Answer", widget: "richtext" }),
});

export const faq = defineBlock({
  type: "faq",
  label: "FAQ",
  description: "Common questions with answers that open one at a time.",
  group: "content",
  icon: "question",
  kinds: ["page", "listing", "entry"],
  props: z.object({
    title: field.text("Heading", { max: 120, inline: true }).optional(),
    description: field.textarea("Introduction", { max: 300, inline: true }).optional(),
    contactText: panel(field.text("Still need help? line", { max: 120, inline: true }), {
      help: "Under the introduction, with the link after it, e.g. Masih perlukan bantuan?",
    }).optional(),
    contactLink: field.action("Still need help? link").optional(),
    items: field.list("Questions", Question, { min: 1, max: 30 }),
    openFirst: field.toggle("Open the first answer").default(false),
    multiple: field.toggle("Let several answers stay open").default(false),
    tone: field.tone(),
  }),
  defaults: {
    title: "Soalan lazim",
    tone: "paper",
    items: [
      {
        question: "Siapa yang layak memohon?",
        answer: paragraphs("Semua warganegara Malaysia berumur 18 tahun ke atas."),
      },
      {
        question: "Berapa lama permohonan diproses?",
        answer: paragraphs("Kebanyakan permohonan diproses dalam 14 hari bekerja."),
      },
    ],
  },
});
