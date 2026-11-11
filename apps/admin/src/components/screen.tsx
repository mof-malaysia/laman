/**
 * The frame an index screen sits in (Dashboard, Pages, Media, Publishing,
 * Analytics, Settings, Users, Account): the surface padding, one centred width
 * and the gap between sections, so every title starts in the same place. Screens
 * that work on one thing full-bleed (Navigation, Colours, the editor) draw their own.
 */
import type { ComponentProps } from "react";
import { clx } from "@/lib/ftds/utils";

export function Screen({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clx("p-surface gap-stack-lg mx-auto flex w-full max-w-6xl flex-col", className)}
      {...props}
    />
  );
}
