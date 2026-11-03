/** The dashboard's line on analytics: visitors and views over the last 7 days. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { linkClass } from "@/components/text-link";
import { Stat, StatGroup, StatLabel, StatValue } from "@/components/ui/stat";
import { t } from "@/i18n";
import { analyticsApi } from "@/lib/api";
import { formatCount, rangeDays, todayIn } from "./range";
import { useAnalyticsStatus } from "./report";

export function WeekFigures() {
  const status = useAnalyticsStatus();
  const query = rangeDays({ range: "7d" }, todayIn(status.data?.timeZone));
  const summary = useQuery({
    queryKey: ["analytics", "summary", query],
    queryFn: () => analyticsApi.summary(query),
    enabled: Boolean(status.data?.since),
  });
  // Nothing counted yet: the Analytics screen explains why; the dashboard stays quiet.
  if (!status.data?.since || !summary.data) return null;
  const { visitors, views } = summary.data.current;
  return (
    <section aria-labelledby="week-figures" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week-figures" className="text-title text-txt-black-900 font-semibold">
          {t("dashboard.analytics.title")}
        </h2>
        <Link to="/analytics" search={{ range: "7d" }} className={linkClass}>
          {t("dashboard.analytics.more")}
        </Link>
      </div>
      <StatGroup minItemWidth="8rem">
        <Stat surface="well">
          <StatLabel>{t("analytics.visitors")}</StatLabel>
          <StatValue>{formatCount(visitors)}</StatValue>
        </Stat>
        <Stat surface="well">
          <StatLabel>{t("analytics.views")}</StatLabel>
          <StatValue>{formatCount(views)}</StatValue>
        </Stat>
      </StatGroup>
    </section>
  );
}
