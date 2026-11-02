/**
 * Rich text is stored as Tiptap JSON, never as HTML from editors. The schema
 * keeps only the nodes and marks below (unknown attributes are stripped), and
 * `richTextToHtml` writes HTML from that allow-list with every string escaped.
 */
import { z } from "zod";
import { Href } from "./fields.js";

const Mark = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("link"), attrs: z.object({ href: Href }) }),
]);

const NodeType = z.enum([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "text",
]);

export type RichNode = {
  type: z.infer<typeof NodeType>;
  attrs?: { level?: number; start?: number } | undefined;
  text?: string | undefined;
  marks?: z.infer<typeof Mark>[] | undefined;
  content?: RichNode[] | undefined;
};

export const RichNode: z.ZodType<RichNode> = z.object({
  type: NodeType,
  attrs: z
    .object({
      // Headings start at h2: the page's h1 is the hero or page intro.
      level: z.number().int().min(2).max(4).optional(),
      start: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
  text: z.string().max(20_000).optional(),
  marks: z.array(Mark).max(8).optional(),
  get content() {
    return z.array(RichNode).max(500).optional();
  },
});

export const RichText = z.object({
  type: z.literal("doc"),
  content: z.array(RichNode).max(500),
});
export type RichText = z.infer<typeof RichText>;

/** A document with one paragraph per string. */
export function paragraphs(...texts: string[]): RichText {
  return {
    type: "doc",
    content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function textToHtml(node: RichNode): string {
  let html = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    else if (mark.type === "italic") html = `<em>${html}</em>`;
    else if (mark.attrs.href) html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
  }
  return html;
}

function nodeToHtml(node: RichNode): string {
  const inner = () => (node.content ?? []).map(nodeToHtml).join("");
  switch (node.type) {
    case "text":
      return textToHtml(node);
    case "hardBreak":
      return "<br>";
    case "paragraph":
      return `<p>${inner()}</p>`;
    case "heading": {
      const level = node.attrs?.level ?? 2;
      return `<h${level}>${inner()}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${inner()}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start;
      return start && start !== 1 ? `<ol start="${start}">${inner()}</ol>` : `<ol>${inner()}</ol>`;
    }
    case "listItem":
      return `<li>${inner()}</li>`;
    case "blockquote":
      return `<blockquote>${inner()}</blockquote>`;
  }
}

export function richTextToHtml(doc: RichText): string {
  return doc.content.map(nodeToHtml).join("");
}
