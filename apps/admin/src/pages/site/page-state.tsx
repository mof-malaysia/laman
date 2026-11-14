/** A page's state as the Pages screens show it: a small dot and a word, never a coloured pill. */
import type { PageSummary } from "@laman/contracts";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

export type PageState = "draft" | "changed" | "scheduled" | "live";

export const stateOf = (page: Pick<PageSummary, "status">): PageState =>
  page.status === "published" ? "live" : page.status;

export const stateWord = (state: PageState) =>
  state === "live" ? t("page.status.published") : t(`pages.index.state.${state}`);

/** Hollow: never published. Amber: edited since. Primary ring: scheduled. Green: live. */
export function StateDot({ state }: { state: PageState }) {
  return (
    <span
      aria-hidden
      className={clx(
        "size-2 shrink-0 rounded-full",
        state === "draft" && "border-txt-black-400 border-[1.5px]",
        state === "changed" && "bg-bg-warning-600",
        state === "scheduled" && "border-txt-primary border-[1.5px]",
        state === "live" && "bg-bg-success-600",
      )}
    />
  );
}

/** The dot and its word. */
export function StateLabel({ state, className }: { state: PageState; className?: string }) {
  return (
    <span
      className={clx(
        "text-body-sm text-txt-black-500 flex shrink-0 items-center gap-1.5",
        className,
      )}
    >
      <StateDot state={state} />
      {stateWord(state)}
    </span>
  );
}
