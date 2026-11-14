/** How the editor shows a block: its registry icon, and a one-line excerpt of its main text. */
import {
  type Block,
  type BlockGroup,
  type BlockIcon as BlockIconName,
  richTextToText,
  type RichText,
  blockFields,
} from "@laman/blocks";
import { type ComponentType, type SVGProps, createElement } from "react";
import { CalendarIcon } from "@/components/ui/icons/calendar";
import { ChatBubbleIcon } from "@/components/ui/icons/chat-bubble";
import { CheckIcon } from "@/components/ui/icons/check";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CheckShieldIcon } from "@/components/ui/icons/check-shield";
import { DesktopIcon } from "@/components/ui/icons/desktop";
import { DirectionIcon } from "@/components/ui/icons/direction";
import { DocumentIcon } from "@/components/ui/icons/document";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { GlobeIcon } from "@/components/ui/icons/globe";
import { GovtOfficeIcon } from "@/components/ui/icons/govt-office";
import { GalleryIcon } from "@/components/ui/icons/gallery";
import { GridIcon } from "@/components/ui/icons/grid";
import { InfoIcon } from "@/components/ui/icons/info";
import { LinkIcon } from "@/components/ui/icons/link";
import { ListIcon } from "@/components/ui/icons/list";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { NumberedListIcon } from "@/components/ui/icons/numbered-list";
import { PdfIcon } from "@/components/ui/icons/pdf";
import { PhoneIcon } from "@/components/ui/icons/phone";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import { RSSIcon } from "@/components/ui/icons/rss";
import { StarIcon } from "@/components/ui/icons/star";
import { SwapIcon } from "@/components/ui/icons/swap";
import { TableIcon } from "@/components/ui/icons/table";
import { TextIcon } from "@/components/ui/icons/text";
import { UserGroupIcon } from "@/components/ui/icons/user-group";
import type { MessageKey } from "@/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const icons: Record<BlockIconName, Icon> = {
  star: StarIcon,
  text: TextIcon,
  grid: GridIcon,
  megaphone: MegaphoneIcon,
  info: InfoIcon,
  gallery: GalleryIcon,
  phone: PhoneIcon,
  link: LinkIcon,
  list: ListIcon,
  question: QuestionCircleIcon,
  rss: RSSIcon,
  document: DocumentIcon,
  pdf: PdfIcon,
  "numbered-list": NumberedListIcon,
  "check-circle": CheckCircleIcon,
  direction: DirectionIcon,
  "user-group": UserGroupIcon,
  "chat-bubble": ChatBubbleIcon,
  "eye-show": EyeShowIcon,
  table: TableIcon,
  "check-shield": CheckShieldIcon,
  swap: SwapIcon,
  check: CheckIcon,
  "govt-office": GovtOfficeIcon,
  globe: GlobeIcon,
  calendar: CalendarIcon,
  desktop: DesktopIcon,
};

/** A block's registry icon, by name. */
export function BlockIcon({ name, ...props }: { name: BlockIconName } & SVGProps<SVGSVGElement>) {
  return createElement(icons[name], props);
}

export const groupLabels: Record<BlockGroup, MessageKey> = {
  opening: "editor.group.opening",
  content: "editor.group.content",
  action: "editor.group.action",
  contact: "editor.group.contact",
  listing: "editor.group.listing",
};

/** The first heading or paragraph with words in it, not the whole text run together. */
function richTextExcerpt(doc: RichText): string {
  for (const node of doc.content) {
    const text = richTextToText(node).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

/** A list item's own title, for its row in the panel and the block's excerpt. */
export const itemTitle = (item: unknown) => {
  const value = (item as Record<string, unknown> | undefined) ?? {};
  const title = value.title ?? value.label ?? value.question ?? value.name ?? value.text;
  return typeof title === "string" ? title : "";
};

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
      const title = itemTitle(first);
      if (title) return title;
    }
  }
  return "";
}
