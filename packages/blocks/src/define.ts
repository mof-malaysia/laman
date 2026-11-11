import type { z } from "zod";

/** The FTDS icons blocks may use in the palette; the admin maps each one, and the type checker holds it to that. */
export const blockIcons = [
  "star",
  "document",
  "text",
  "chat-bubble",
  "eye-show",
  "gallery",
  "grid",
  "direction",
  "numbered-list",
  "check-circle",
  "link",
  "pdf",
  "user-group",
  "table",
  "check-shield",
  "question",
  "info",
  "phone",
  "megaphone",
  "swap",
  "list",
  "rss",
  "check",
  "govt-office",
  "globe",
  "calendar",
  "desktop",
] as const;
export type BlockIcon = (typeof blockIcons)[number];

/** Where a block sits in the editor's Insert palette. */
export type BlockGroup = "opening" | "content" | "action" | "contact" | "listing";

export type BlockDefinition<T extends string = string, P extends z.ZodObject = z.ZodObject> = {
  type: T;
  /** Shown in the block palette and the layers list. */
  label: string;
  description: string;
  group: BlockGroup;
  /** An FTDS icon name from `blockIcons`; the admin maps it to the icon. */
  icon: BlockIcon;
  /** The kinds of page it may be placed on. */
  kinds: readonly ("page" | "listing" | "entry")[];
  props: P;
  /** Starting content when an editor adds the block. Must pass `props`. */
  defaults: z.input<P>;
};

export const defineBlock = <T extends string, P extends z.ZodObject>(
  definition: BlockDefinition<T, P>,
) => definition;
