/**
 * Analytics: how the published site is used, counted without cookies or
 * anything that follows a visitor (docs/analytics.md). The range lives in the
 * address, so a report can be linked to.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { t } from "@/i18n";
import type { RangeSearch } from "./range";
import { AnalyticsReport, RangeControl, useAnalyticsStatus } from "./report";

export function AnalyticsScreen() {
  const range = useSearch({ strict: false }) as RangeSearch;
  const navigate = useNavigate();
  const status = useAnalyticsStatus();
  return (
    <div className="p-surface gap-stack-lg mx-auto flex max-w-6xl flex-col">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.analytics")}</PageHeaderTitle>
          <PageHeaderDescription>{t("analytics.intro")}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <RangeControl
            value={range}
            timeZone={status.data?.timeZone}
            onChange={(next) => void navigate({ to: "/analytics", search: next, replace: true })}
          />
        </PageHeaderActions>
      </PageHeader>
      <AnalyticsReport range={range} />
    </div>
  );
}
