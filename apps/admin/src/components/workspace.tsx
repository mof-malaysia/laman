/**
 * The frame of a screen that works on one site document full-bleed (Navigation,
 * Announcement, Search, Colours): a white strip with the document's icon, title
 * and state and its actions, over washed panes. Loading and failing use the same
 * strip, so the screen doesn't jump when the document arrives.
 */
import type { CSSProperties, ReactNode } from "react";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Skeleton } from "@/components/ui/skeleton";
import { clx } from "@/lib/ftds/utils";

export function WorkspaceHeader({
  icon,
  title,
  subtitle,
  status,
  actions,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** A line under the subtitle: what's live now. */
  status?: ReactNode;
  actions?: ReactNode;
  /** Under the title row, such as tabs; they bring their own hairline. */
  children?: ReactNode;
}) {
  return (
    <header
      className={clx(
        "bg-bg-white px-surface flex shrink-0 flex-col gap-4 pt-5",
        !children && "border-otl-gray-200 border-b pb-4",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
          <span
            aria-hidden
            className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
          >
            {icon}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-title text-txt-black-900 truncate font-semibold">{title}</h1>
            <p className="text-body-sm text-txt-black-500">{subtitle}</p>
            {status && (
              <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-2 pt-1">
                {status}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}

/** The screen before its document is here: the same strip, then a skeleton or what went wrong. */
export function WorkspaceFallback({
  icon,
  title,
  subtitle,
  error,
  paneWidth,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** Set when the document couldn't be loaded. */
  error?: ReactNode;
  /** The editing pane's starting width, as the screen's SplitPane has it. */
  paneWidth: number;
}) {
  return (
    <div className="flex h-full flex-col" aria-busy={!error}>
      <WorkspaceHeader icon={icon} title={title} subtitle={subtitle} />
      <div
        className="bg-bg-washed flex flex-1 flex-col gap-4 p-4 md:max-w-(--pane)"
        style={{ "--pane": `${paneWidth}px` } as CSSProperties}
      >
        {error ? (
          <Callout variant="danger">
            <CalloutTitle>{error}</CalloutTitle>
          </Callout>
        ) : (
          <>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </>
        )}
      </div>
    </div>
  );
}
