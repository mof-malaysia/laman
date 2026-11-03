/**
 * What the check before publishing found on a page (`GET /pages/checks`),
 * each with what to do about it. A missing main heading stops the page going
 * live; everything else is a warning the officer can publish past.
 */
import type { PageCheck } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { toneDot } from "@/components/page-status";
import { linkClass } from "@/components/text-link";
import { t } from "@/i18n";
import { pagesApi } from "@/lib/api";

/** The checks' query keys: a page's own, and every list that includes pages (`["checks"]`). */
export const checksKey = (id: string) => ["checks", id];

/** One page's checks, kept fresh by the editor's saves. */
export const usePageChecks = (id: string) =>
  useQuery({
    queryKey: checksKey(id),
    queryFn: () => pagesApi.checks([id]).then((checks) => checks[id] ?? []),
  });

/** Several pages' checks in one request, by id: for the list of what's waiting. */
export const useChecksOf = (ids: string[]) =>
  useQuery({
    queryKey: ["checks", "pages", ...ids],
    queryFn: () => pagesApi.checks(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });

/** Whether any check stops the page going live. */
export const stops = (checks: PageCheck[] | undefined) =>
  Boolean(checks?.some((check) => check.severity === "block"));

/** The list, with "Show" beside a check in a block when there's somewhere to show it. */
export function PageCheckList({
  checks,
  onShow,
}: {
  checks: PageCheck[];
  onShow?: (blockId: string) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {checks.map((check, i) => (
        <li key={`${check.code}-${check.blockId}-${i}`} className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              toneDot[check.severity === "block" ? "danger" : "warning"]
            }`}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-body-sm text-txt-black-900 font-medium">
              {check.severity === "block" && <span className="sr-only">{t("checks.stops")} </span>}
              {t(`checks.${check.code}`, { subject: check.subject ?? "" })}
            </span>
            <span className="text-body-sm text-txt-black-700">{t(`checks.${check.code}.fix`)}</span>
          </span>
          {onShow && check.blockId && (
            <button
              type="button"
              className={`text-body-sm shrink-0 ${linkClass}`}
              onClick={() => onShow(check.blockId!)}
            >
              {t("checks.show")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
