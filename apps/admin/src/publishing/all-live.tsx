/**
 * Ready to publish with nothing waiting: say plainly that the site is up to
 * date, name the last publish and who made it, and offer the two useful next
 * steps (see the site, see the history).
 */
import { useNavigate } from "@tanstack/react-router";
import { card } from "@/components/card";
import { StatusDot } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, formatDateTime, usePages, useSummary } from "@/lib/pages";
import { useSiteHref } from "@/lib/publish";
import { byId, lineOf, toneOf } from "./history";

export function AllLive() {
  const navigate = useNavigate();
  const summary = useSummary();
  const pages = usePages();
  const siteHref = useSiteHref("/");
  const last = summary.data?.publishes.find((job) => job.status === "done");
  const history = () => void navigate({ to: "/publishing", search: { tab: "history" } });

  return (
    <EmptyState className={clx(card, "border-otl-gray-200 flex-1 justify-center rounded-xl py-16")}>
      <EmptyStateIcon className="bg-bg-success-50 text-txt-success size-14 [&_svg]:size-7">
        <CheckCircleIcon />
      </EmptyStateIcon>
      <EmptyStateTitle as="h2">{t("home.status.live")}</EmptyStateTitle>
      <EmptyStateDescription>{t("publishing.empty.body")}</EmptyStateDescription>

      {last && (
        // The last publish, as the log names it: the way into what it did.
        <button
          type="button"
          onClick={history}
          className="border-otl-gray-200 hover:border-otl-gray-300 hover:bg-bg-washed focus-ring mt-5 flex w-full max-w-md items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 ease-out motion-reduce:transition-none"
        >
          <StatusDot tone={toneOf(last)} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-label-compact text-txt-black-500">
              {t("publishing.empty.last")}
            </span>
            <span className="text-body-sm text-txt-black-900 truncate font-medium">
              {lineOf(last, byId(pages.data))}
            </span>
            <span
              className="text-label-compact text-txt-black-500 truncate"
              title={formatDateTime(last.finishedAt ?? last.createdAt)}
            >
              {[formatAgo(last.finishedAt ?? last.createdAt), last.createdBy]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronRightIcon aria-hidden className="text-txt-black-400 size-4 shrink-0" />
        </button>
      )}

      <EmptyStateActions>
        <Button
          variant="default-outline"
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
          render={<a href={siteHref} target="_blank" rel="noopener" />}
        >
          {t("publish.view")}
          <span className="sr-only"> {t("publish.newTab")}</span>
        </Button>
        <Button variant="default-ghost" onClick={history}>
          {t("publishing.empty.history")}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}
