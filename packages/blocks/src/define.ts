import type { z } from "zod";

/** Where a block sits in the editor's Insert palette. */
export type BlockGroup = "opening" | "content" | "action" | "contact" | "listing";

export type BlockDefinition<T extends string = string, P extends z.ZodObject = z.ZodObject> = {
  type: T;
  /** Shown in the block palette and the layers list. */
  label: string;
  description: string;
  group: BlockGroup;
  /** An FTDS icon name, e.g. "document"; the admin maps it to the icon. */
  icon: string;
  /** The kinds of page it may be placed on. */
  kinds: readonly ("page" | "listing" | "entry")[];
  props: P;
  /** Starting content when an editor adds the block. Must pass `props`. */
  defaults: z.input<P>;
};

export const defineBlock = <T extends string, P extends z.ZodObject>(
  definition: BlockDefinition<T, P>,
) => definition;
