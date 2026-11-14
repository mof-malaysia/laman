/**
 * Views (bars) and visitors (a line) over time on one axis, both counts, with
 * a tick for each publish so traffic can be read against what went live.
 * Hover or arrow keys show a bucket's figures; the same figures are in a table
 * under the chart.
 */
import type { AnalyticsSummary } from "@laman/contracts";
import { useRef, useState } from "react";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { useElementSize } from "@/lib/use-element-size";
import { bucketLabel, formatCount } from "./range";

const HEIGHT = 240;
const PAD = { top: 20, right: 8, bottom: 28, left: 44 };

/** A round top of `max` ending on a step of 1, 2 or 5. */
function niceMax(max: number) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * step >= max) ?? 10;
  return nice * step;
}

/** A bar with a 4px rounded top, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function TrafficChart({ summary }: { summary: AnalyticsSummary }) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(box);
  const [active, setActive] = useState<number | null>(null);
  const { series, interval } = summary;

  const top = niceMax(Math.max(0, ...series.map((p) => Math.max(p.views, p.visitors))));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = series.length ? plotW / series.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  // About six labels along the bottom, whatever the width.
  const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotW / 90))));
  const line = series.map((p, i) => `${i ? "L" : "M"}${cx(i)},${y(p.visitors)}`).join("");

  const point = active === null ? undefined : series[active];

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="sr-only">{t("analytics.chart.caption")}</figcaption>
      <ul
        className="text-body-sm text-txt-black-700 m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0"
        aria-label={t("analytics.chart.legend")}
      >
        <li className="flex items-center gap-2">
          <span aria-hidden className="bg-primary-400 size-3 rounded-xs" />
          {t("analytics.views")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="bg-primary-700 h-0.5 w-4 rounded-full" />
          {t("analytics.visitors")}
        </li>
        {series.some((p) => p.publishes) && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="border-txt-black-500 h-3 w-0 border-l border-dashed" />
            {t("analytics.chart.publish")}
          </li>
        )}
      </ul>
      <div
        ref={box}
        className="relative rounded-md outline-offset-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-[rgb(var(--fr-primary))] has-[input:focus-visible]:outline-solid"
      >
        {/* The keyboard's way through the chart: a range over the buckets, each read out as text. */}
        <input
          type="range"
          className="sr-only"
          aria-label={t("analytics.chart.keys")}
          min={0}
          max={Math.max(0, series.length - 1)}
          value={active ?? 0}
          aria-valuetext={
            point
              ? t("analytics.chart.point", {
                  at: bucketLabel(point.at, interval, true),
                  views: formatCount(point.views),
                  visitors: formatCount(point.visitors),
                })
              : t("analytics.chart.start")
          }
          onChange={(e) => setActive(e.target.valueAsNumber)}
          onFocus={() => setActive((i) => i ?? series.length - 1)}
          onBlur={() => setActive(null)}
        />
        <svg
          width={width}
          height={HEIGHT}
          aria-hidden
          className="block overflow-visible"
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? "stroke-otl-gray-300" : "stroke-otl-gray-200"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-txt-black-500 text-[11px] tabular-nums"
              >
                {formatCount(v)}
              </text>
            </g>
          ))}
          {series.map((p, i) => {
            const h = (p.views / top) * plotH;
            return (
              <g key={p.at}>
                {p.publishes > 0 && (
                  <>
                    <line
                      x1={cx(i)}
                      x2={cx(i)}
                      y1={PAD.top - 6}
                      y2={PAD.top + plotH}
                      className="stroke-txt-black-500"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <path
                      d={`M${cx(i) - 4},${PAD.top - 12}h8l-4,6z`}
                      className="fill-txt-black-500"
                    />
                  </>
                )}
                {h > 0 && (
                  <path
                    d={barPath(cx(i) - barW / 2, y(p.views), barW, h)}
                    className={active === i ? "fill-primary-500" : "fill-primary-400"}
                  />
                )}
                {i % every === 0 && (
                  <text
                    x={cx(i)}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="fill-txt-black-500 text-[11px]"
                  >
                    {bucketLabel(p.at, interval)}
                  </text>
                )}
              </g>
            );
          })}
          {series.length > 1 && (
            <path
              d={line}
              fill="none"
              className="stroke-primary-700"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {point && active !== null && (
            <>
              <line
                x1={cx(active)}
                x2={cx(active)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                className="stroke-txt-black-700"
                strokeWidth={1}
              />
              <circle
                cx={cx(active)}
                cy={y(point.visitors)}
                r={4.5}
                className="fill-primary-700 stroke-bg-white"
                strokeWidth={2}
              />
            </>
          )}
          {/* Hit targets the full height of each bucket, wider than the bars. */}
          {series.map((p, i) => (
            <rect
              key={p.at}
              x={PAD.left + band * i}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          ))}
        </svg>
        {point && active !== null && (
          <output
            className="bg-bg-white shadow-card border-otl-gray-200 text-body-sm pointer-events-none absolute top-2 z-10 flex min-w-40 flex-col gap-1 rounded-md border px-3 py-2"
            style={
              cx(active) > width / 2
                ? { right: width - cx(active) + 12 }
                : { left: cx(active) + 12 }
            }
          >
            <span className="text-txt-black-900 font-semibold">
              {bucketLabel(point.at, interval, true)}
            </span>
            <span className="text-txt-black-700 flex justify-between gap-4">
              {t("analytics.views")}
              <span className="text-txt-black-900 tabular-nums">{formatCount(point.views)}</span>
            </span>
            <span className="text-txt-black-700 flex justify-between gap-4">
              {t("analytics.visitors")}
              <span className="text-txt-black-900 tabular-nums">{formatCount(point.visitors)}</span>
            </span>
            {point.publishes > 0 && (
              <span className="text-txt-black-700">
                {t("analytics.chart.publishes", { count: point.publishes })}
              </span>
            )}
          </output>
        )}
      </div>
      <Details>
        <DetailsTrigger>{t("analytics.chart.table")}</DetailsTrigger>
        <DetailsContent>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("analytics.chart.period")}</TableHead>
                  <TableHead className="text-right">{t("analytics.views")}</TableHead>
                  <TableHead className="text-right">{t("analytics.visitors")}</TableHead>
                  <TableHead className="text-right">{t("analytics.chart.publish")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((p) => (
                  <TableRow key={p.at}>
                    <TableCell>{bucketLabel(p.at, interval, true)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(p.views)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(p.visitors)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.publishes || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DetailsContent>
      </Details>
    </figure>
  );
}
