/** How the editor shows a block: its registry icon, and a one-line excerpt of its main text. */
import {
  type Block,
  type BlockGroup,
  type RichNode,
  type RichText,
  blockFields,
} from "@fiscal-sb/blocks";
import { type ComponentType, type SVGProps, createElement } from "react";
import { DocumentIcon } from "@/components/ui/icons/document";
import { EmailIcon } from "@/components/ui/icons/email";
import { GalleryIcon } from "@/components/ui/icons/gallery";
import { GridIcon } from "@/components/ui/icons/grid";
import { InfoIcon } from "@/components/ui/icons/info";
import { LinkIcon } from "@/components/ui/icons/link";
import { ListIcon } from "@/components/ui/icons/list";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { PhoneIcon } from "@/components/ui/icons/phone";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import { RSSIcon } from "@/components/ui/icons/rss";
import { StarIcon } from "@/components/ui/icons/star";
import { TextIcon } from "@/components/ui/icons/text";
import type { MessageKey } from "@/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const icons: Record<string, Icon> = {
  star: StarIcon,
  text: TextIcon,
  grid: GridIcon,
  megaphone: MegaphoneIcon,
  info: InfoIcon,
  gallery: GalleryIcon,
  phone: PhoneIcon,
  email: EmailIcon,
  link: LinkIcon,
  list: ListIcon,
  question: QuestionCircleIcon,
  rss: RSSIcon,
};

/** A block's registry icon, by name. */
export function BlockIcon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  return createElement(icons[name] ?? DocumentIcon, props);
}

export const groupLabels: Record<BlockGroup, MessageKey> = {
  opening: "editor.group.opening",
  content: "editor.group.content",
  action: "editor.group.action",
  contact: "editor.group.contact",
  listing: "editor.group.listing",
};

/** All of a node's text, run together as it reads: bold and links split it, not spaces. */
const textOf = (node: RichNode): string => node.text ?? (node.content ?? []).map(textOf).join("");

/** The first heading or paragraph with words in it, not the whole text run together. */
function richTextExcerpt(doc: RichText): string {
  for (const node of doc.content) {
    const text = textOf(node).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

/** The block's first filled-in text field, in schema order: what a reader sees first. */
export function excerptOf(block: Block): string {
  const props = block.props as Record<string, unknown>;
  for (const field of blockFields(block.type)) {
    const value = props[field.name];
    if (
      (field.widget === "text" || field.widget === "textarea") &&
      typeof value === "string" &&
      value
    )
      return value;
    if (field.widget === "richtext" && value) return richTextExcerpt(value as RichText);
    if (field.widget === "list" && Array.isArray(value)) {
      const first = value.find((item) => item && typeof item === "object");
      const title = first && (first as Record<string, unknown>).title;
      if (typeof title === "string" && title) return title;
    }
  }
  return "";
}
