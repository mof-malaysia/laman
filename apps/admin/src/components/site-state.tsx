/**
 * The answer to "is my site up to date?", the same on the dashboard and on
 * the Publishing screen: one state, and a heading that says it in words with
 * an icon. Each screen adds its own line under it.
 */
import type { ReactNode } from "react";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { ClockIcon } from "@/components/ui/icons/clock";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { isActive } from "@/lib/api";
import { useSummary } from "@/lib/pages";
import { useWaiting } from "@/lib/publish";

export type SiteState =
  | "publishing"
  | "failed"
  | "notPublished"
  | "waiting"
  /** Everything published is live, but some new pages never were. */
  | "publishedLive"
  | "live";

/** `live`: whether the home page is published, when the screen knows. */
export function useSiteState(live?: boolean) {
  const summary = useSummary();
  const waiting = useWaiting();
  const latest = summary.data?.publishes[0];
  const lastDone = summary.data?.publishes.find((j) => j.status === "done");
  const state: SiteState =
    latest && isActive(latest)
      ? "publishing"
      : // The one state an occasional officer must not miss: it leads, whatever else is true.
        latest?.status === "failed"
        ? "failed"
        : live === false
          ? "notPublished"
          : waiting.count > 0
            ? "waiting"
            : waiting.fresh > 0
              ? "publishedLive"
              : "live";
  return {
    state,
    waiting,
    /** When the site last changed: after a failure, still the version visitors see. */
    lastAt: lastDone && (lastDone.finishedAt ?? lastDone.createdAt),
    loaded: summary.data !== undefined,
  };
}

export const siteStateIcons: Record<SiteState, ReactNode> = {
  publishing: <Spinner size="small" />,
  failed: <WarningCircleIcon className="text-txt-danger" />,
  notPublished: <ClockIcon className="text-txt-warning" />,
  waiting: <ClockIcon className="text-txt-warning" />,
  publishedLive: <CheckCircleIcon className="text-txt-success" />,
  live: <CheckCircleIcon className="text-txt-success" />,
};

export function sentenceOf(state: SiteState, count: number) {
  switch (state) {
    case "publishing":
      return t("home.status.publishing");
    case "failed":
      return t("home.status.failed");
    case "notPublished":
      return t("home.status.notPublished");
    case "waiting":
      return t("home.status.waiting", { count });
    case "publishedLive":
      return t("home.status.publishedLive");
    case "live":
      return t("home.status.live");
  }
}

/** The wash behind each state's icon: the state's colour, quietly, before the words are read. */
const washes: Record<SiteState, string> = {
  publishing: "bg-bg-washed",
  failed: "bg-bg-danger-50",
  notPublished: "bg-bg-warning-50",
  waiting: "bg-bg-warning-50",
  publishedLive: "bg-bg-success-50",
  live: "bg-bg-success-50",
};

/** The state as a section heading, read out when it changes, with the screen's own line under it. */
export function SiteStateHeading({
  state,
  count,
  children,
}: {
  state: SiteState;
  /** Changes waiting, for "3 changes aren't on the site yet". */
  count: number;
  children?: ReactNode;
}) {
  return (
    <div aria-live="polite" className="flex items-start gap-3">
      <span
        aria-hidden
        className={clx(
          "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
          washes[state],
        )}
      >
        {siteStateIcons[state]}
      </span>
      {/* One line sits level with the icon; with a second, the pair does. */}
      <div className="flex min-h-10 min-w-0 flex-col justify-center gap-0.5">
        <h2 id="status-heading" className="text-title font-semibold text-balance">
          {sentenceOf(state, count)}
        </h2>
        {children && <p className="text-txt-black-700">{children}</p>}
      </div>
    </div>
  );
}
