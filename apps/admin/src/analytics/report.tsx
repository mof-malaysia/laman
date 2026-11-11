/**
 * An analytics report for a range of days: five figures against the period
 * before, the traffic chart, and top lists. For the whole site, or with
 * `pageId` for one page (its tab on the page's detail). See docs/analytics.md.
 */
import type {
  AnalyticsQuery,
  AnalyticsStatus,
  AnalyticsTotals,
  Breakdown,
  BreakdownRow,
} from "@fiscal-sb/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { linkClass } from "@/components/text-link";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatDelta, StatGroup, StatLabel, StatValue } from "@/components/ui/stat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { locale, type MessageKey, t } from "@/i18n";
import { analyticsApi } from "@/lib/api";
import { Panel } from "@/pages/site/tab-layout";
import { TrafficChart } from "./chart";
import {
  type Preset,
  type RangeSearch,
  formatCount,
  formatPercent,
  formatSeconds,
  presets,
  rangeDays,
  rangeLabel,
  todayIn,
} from "./range";

export const useAnalyticsStatus = () =>
  useQuery({ queryKey: ["analytics", "status"], queryFn: analyticsApi.status });

/** Presets, or two dates. */
export function RangeControl({
  value,
  onChange,
  timeZone,
}: {
  value: RangeSearch;
  onChange: (next: RangeSearch) => void;
  timeZone: string | undefined;
}) {
  const today = todayIn(timeZone);
  const current = value.range ?? "30d";
  const { from, to } = rangeDays(value, today);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <ToggleGroup
        aria-label={t("analytics.range")}
        value={[current]}
        onValueChange={(next) => {
          const picked = next[0] as Preset | "custom" | undefined;
          if (!picked) return;
          onChange(picked === "custom" ? { range: "custom", from, to } : { range: picked });
        }}
      >
        {[...presets, "custom" as const].map((p) => (
          <Toggle key={p} value={p}>
            {t(`analytics.range.${p}`)}
          </Toggle>
        ))}
      </ToggleGroup>
      {current === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <Field name="from" className="w-40">
            <FieldLabel>{t("analytics.range.from")}</FieldLabel>
            <Input
              type="date"
              value={from}
              max={today}
              onChange={(e) =>
                e.target.value && onChange({ range: "custom", from: e.target.value, to })
              }
            />
          </Field>
          <Field name="to" className="w-40">
            <FieldLabel>{t("analytics.range.to")}</FieldLabel>
            <Input
              type="date"
              value={to}
              max={today}
              onChange={(e) =>
                e.target.value && onChange({ range: "custom", from, to: e.target.value })
              }
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Why a report is empty, or what it can't show: counting off, nothing yet. */
function StatusNotes({ status }: { status: AnalyticsStatus | undefined }) {
  if (!status) return null;
  if (!status.on)
    return (
      <Callout variant="warning">
        <CalloutTitle>{t("analytics.off.title")}</CalloutTitle>
        <CalloutContent>
          {t("analytics.off.body")}{" "}
          <Link to="/settings" search={{ section: "analytics" }} className={linkClass}>
            {t("analytics.off.link")}
          </Link>
        </CalloutContent>
      </Callout>
    );
  if (!status.since)
    return (
      <Callout>
        <CalloutTitle>{t("analytics.empty.title")}</CalloutTitle>
        <CalloutContent>{t("analytics.empty.body")}</CalloutContent>
      </Callout>
    );
  return null;
}

type Delta = { direction: "up" | "down" | "none"; text: string };

/** The change on the period before: a percentage, or points for the bounce rate. */
function delta(now: number, before: number, kind: "count" | "rate" | "time"): Delta {
  if (kind === "rate") {
    const points = Math.round((now - before) * 100);
    if (!points) return { direction: "none", text: t("analytics.delta.same") };
    return {
      direction: points > 0 ? "up" : "down",
      text: t("analytics.delta.points", { n: Math.abs(points) }),
    };
  }
  if (!before) return { direction: "none", text: t("analytics.delta.noBefore") };
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return { direction: "none", text: t("analytics.delta.same") };
  return {
    direction: change > 0 ? "up" : "down",
    text: t("analytics.delta.percent", { n: formatPercent(Math.abs(change)) }),
  };
}

function Figures({
  current,
  previous,
  page,
  compare,
}: {
  current: AnalyticsTotals;
  previous: AnalyticsTotals;
  page: boolean;
  /** Whether the period before has anything to compare with; said once if not. */
  compare: boolean;
}) {
  const figures: {
    label: MessageKey;
    value: string;
    delta: Delta;
    /** More is better: the arrow is green going up. Bounce and time are neither. */
    good?: boolean;
  }[] = [
    {
      label: "analytics.visitors",
      value: formatCount(current.visitors),
      delta: delta(current.visitors, previous.visitors, "count"),
      good: true,
    },
    {
      label: "analytics.views",
      value: formatCount(current.views),
      delta: delta(current.views, previous.views, "count"),
      good: true,
    },
    {
      label: "analytics.visits",
      value: formatCount(current.visits),
      delta: delta(current.visits, previous.visits, "count"),
      good: true,
    },
    {
      label: page ? "analytics.bounce.page" : "analytics.bounce",
      value: formatPercent(current.bounceRate),
      delta: delta(current.bounceRate, previous.bounceRate, "rate"),
    },
    {
      label: page ? "analytics.duration.page" : "analytics.duration",
      value: formatSeconds(current.duration),
      delta: delta(current.duration, previous.duration, "time"),
    },
  ];
  return (
    <StatGroup minItemWidth="10rem">
      {figures.map((f) => (
        <Stat key={f.label} surface="well">
          <StatLabel>{t(f.label)}</StatLabel>
          <StatValue>{f.value}</StatValue>
          {compare && (
            <StatDelta
              direction={f.delta.direction}
              tone={
                f.good && f.delta.direction !== "none"
                  ? f.delta.direction === "up"
                    ? "success"
                    : "danger"
                  : "neutral"
              }
              directionLabels={{ up: t("analytics.delta.up"), down: t("analytics.delta.down") }}
            >
              {f.delta.text}
            </StatDelta>
          )}
        </Stat>
      ))}
    </StatGroup>
  );
}

const languageNames = new Intl.DisplayNames([locale()], { type: "language" });
const regionNames = new Intl.DisplayNames([locale()], { type: "region" });
const named = (names: Intl.DisplayNames, code: string) => {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

/** What a row is called: a path, a host, a device in words, a language's name. */
function rowLabel(by: Breakdown, row: BreakdownRow): ReactNode {
  if (!row.value) return <span className="text-txt-black-500">{t("analytics.unknown")}</span>;
  switch (by) {
    case "page":
    case "entry":
    case "exit":
      return row.pageId ? (
        <Link
          to="/pages/$id/edit"
          params={{ id: row.pageId }}
          search={{ panel: "analytics" }}
          className={`${linkClass} font-normal`}
        >
          {row.value}
        </Link>
      ) : (
        <span title={t("analytics.pageGone")} className="text-txt-black-700">
          {row.value}
        </span>
      );
    case "device":
      return t(`analytics.device.${row.value}` as MessageKey);
    case "screen":
      return t(`analytics.screen.${row.value}` as MessageKey);
    case "language":
      return named(languageNames, row.value);
    case "country":
      return named(regionNames, row.value);
    case "download":
      return <span title={row.value}>{decodeURIComponent(row.value.split("/").at(-1) ?? "")}</span>;
    default:
      return row.value;
  }
}

/** One top list: each row with its share as a bar behind it. */
function TopList({
  query,
  by,
  countLabel,
  empty,
}: {
  query: AnalyticsQuery;
  by: Breakdown;
  countLabel: string;
  empty?: string;
}) {
  const list = useQuery({
    queryKey: ["analytics", "breakdown", by, query],
    queryFn: () => analyticsApi.breakdown({ ...query, by, limit: 10 }),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) return <Skeleton className="h-48 w-full rounded-md" />;
  if (list.isError) return <p className="text-txt-danger text-body-sm">{t("common.tryAgain")}</p>;
  const { rows, total } = list.data;
  if (!rows.length)
    return <p className="text-body-sm text-txt-black-700 py-4">{empty ?? t("analytics.none")}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="text-body-sm w-full table-fixed border-collapse">
      {/* table-fixed sizes columns from here, not from the (hidden) header row. */}
      <colgroup>
        <col />
        <col className="w-16" />
        <col className="w-14" />
      </colgroup>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t("analytics.item")}</th>
          <th scope="col">{countLabel}</th>
          <th scope="col">{t("analytics.share")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.pageId ?? ""}${row.value}`} className="relative">
            <td className="relative py-1.5 pr-3 pl-2">
              <span
                aria-hidden
                className="bg-bg-primary-50 absolute inset-y-0.5 left-0 rounded-xs"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
              <span className="text-txt-black-900 relative block truncate">
                {rowLabel(by, row)}
              </span>
            </td>
            <td className="text-txt-black-900 py-1.5 text-right font-medium tabular-nums">
              {formatCount(row.count)}
            </td>
            <td className="text-txt-black-500 py-1.5 text-right tabular-nums">
              {formatPercent(total ? row.count / total : 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `unavailable`: why this list can't be shown here at all, said instead of it. */
type Tab = { by: Breakdown; label: MessageKey; empty?: string; unavailable?: string | undefined };

/** A card of related top lists, one tab each. */
function TopCard({
  title,
  tabs,
  query,
  countLabel = t("analytics.views"),
}: {
  title: MessageKey;
  tabs: Tab[];
  query: AnalyticsQuery;
  countLabel?: string;
}) {
  const [tab, setTab] = useState(tabs[0]?.by);
  return (
    <Panel
      title={t(title)}
      aside={<span className="text-label-sm text-txt-black-500">{countLabel}</span>}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Breakdown)}>
        {tabs.length > 1 && (
          <TabsList>
            {tabs.map((tb) => (
              <TabsTrigger key={tb.by} value={tb.by}>
                {t(tb.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {tabs.map((tb) => (
          <TabsContent key={tb.by} value={tb.by} className="pt-2">
            {tb.unavailable ? (
              <p className="text-body-sm text-txt-black-700 py-4">{tb.unavailable}</p>
            ) : (
              <TopList
                query={query}
                by={tb.by}
                countLabel={countLabel}
                {...(tb.empty && { empty: tb.empty })}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

export function AnalyticsReport({ range, pageId }: { range: RangeSearch; pageId?: string }) {
  const status = useAnalyticsStatus();
  const timeZone = status.data?.timeZone;
  const { from, to } = rangeDays(range, todayIn(timeZone));
  const query: AnalyticsQuery = { from, to, ...(pageId && { pageId }) };
  const summary = useQuery({
    queryKey: ["analytics", "summary", query],
    queryFn: () => analyticsApi.summary(query),
    placeholderData: keepPreviousData,
    enabled: status.isSuccess,
  });
  // Nothing in the period before: say so once, not under every figure.
  const compare = Boolean(summary.data && summary.data.previous.views > 0);
  const noCountries =
    status.data && !status.data.countries ? t("analytics.noCountries") : undefined;

  return (
    <div className="gap-stack-lg @container flex flex-col">
      <StatusNotes status={status.data} />
      {summary.data ? (
        <>
          <p className="text-body-sm text-txt-black-700">
            {compare
              ? t("analytics.comparing", {
                  range: rangeLabel(from, to),
                  before: rangeLabel(summary.data.before.from, summary.data.before.to),
                })
              : t("analytics.comparingNone", { range: rangeLabel(from, to) })}
          </p>
          <Figures
            current={summary.data.current}
            previous={summary.data.previous}
            page={Boolean(pageId)}
            compare={compare}
          />
          <p className="text-body-xs text-txt-black-500 -mt-3">{t("analytics.visitorsNote")}</p>
          <Panel>
            <h2 className="sr-only">{t("analytics.chart.title")}</h2>
            <TrafficChart summary={summary.data} />
          </Panel>
        </>
      ) : summary.isError || status.isError ? (
        <Callout variant="danger">
          <CalloutTitle>{t("analytics.failed")}</CalloutTitle>
          <CalloutContent>{t("common.tryAgain")}</CalloutContent>
        </Callout>
      ) : (
        <>
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </>
      )}
      {status.isSuccess && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @3xl:grid-cols-2">
          {!pageId && (
            <TopCard
              title="analytics.top.pages"
              query={query}
              tabs={[
                { by: "page", label: "analytics.top.page" },
                { by: "entry", label: "analytics.top.entry" },
                { by: "exit", label: "analytics.top.exit" },
              ]}
            />
          )}
          <TopCard
            title="analytics.top.sources"
            query={query}
            tabs={[
              {
                by: "referrer",
                label: "analytics.top.referrer",
                empty: t("analytics.noReferrers"),
              },
              { by: "utm_source", label: "analytics.top.utmSource", empty: t("analytics.noUtm") },
              { by: "utm_medium", label: "analytics.top.utmMedium", empty: t("analytics.noUtm") },
              {
                by: "utm_campaign",
                label: "analytics.top.utmCampaign",
                empty: t("analytics.noUtm"),
              },
            ]}
          />
          <TopCard
            title="analytics.top.technology"
            query={query}
            tabs={[
              { by: "browser", label: "analytics.top.browser" },
              { by: "os", label: "analytics.top.os" },
              { by: "device", label: "analytics.top.device" },
              { by: "screen", label: "analytics.top.screen" },
            ]}
          />
          <TopCard
            title="analytics.top.places"
            query={query}
            tabs={[
              { by: "language", label: "analytics.top.language" },
              { by: "country", label: "analytics.top.country", unavailable: noCountries },
            ]}
          />
          <TopCard
            title="analytics.top.clicks"
            query={query}
            countLabel={t("analytics.clicks")}
            tabs={[
              {
                by: "download",
                label: "analytics.top.download",
                empty: t("analytics.noDownloads"),
              },
              { by: "outbound", label: "analytics.top.outbound", empty: t("analytics.noOutbound") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
