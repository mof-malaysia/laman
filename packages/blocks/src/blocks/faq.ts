import { z } from "zod";
import { field } from "../fields.js";
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
    items: field.list("Questions", Question, { min: 1, max: 30 }),
    tone: field
      .select("Background", ["paper", "well"], { paper: "Paper", well: "Well" })
      .default("paper"),
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
