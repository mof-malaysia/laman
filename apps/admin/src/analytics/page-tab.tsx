/** A page's Analytics tab: the site report for this page alone, following it through renames. */
import { useState } from "react";
import { t } from "@/i18n";
import type { RangeSearch } from "./range";
import { AnalyticsReport, RangeControl, useAnalyticsStatus } from "./report";

export function PageAnalyticsTab({ pageId }: { pageId: string }) {
  const [range, setRange] = useState<RangeSearch>({});
  const status = useAnalyticsStatus();
  return (
    <div className="gap-stack-md flex max-w-6xl flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body-sm text-txt-black-700 max-w-prose">{t("analytics.pageIntro")}</p>
        <RangeControl value={range} onChange={setRange} timeZone={status.data?.timeZone} />
      </div>
      <AnalyticsReport range={range} pageId={pageId} />
    </div>
  );
}
