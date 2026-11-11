/** A trend at a glance: a line and its wash, the width of its box, with no axes. */
import { useId } from "react";
import { clx } from "@/lib/ftds/utils";

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  // Nothing to draw yet: keep the line's height so cards in a row stay level.
  if (values.length < 2) return <span aria-hidden className={clx("block h-9", className)} />;
  const w = 120;
  const h = 36;
  const pad = 2;
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${i * step},${h - pad - (v / max) * (h - pad * 2)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className={clx("text-txt-primary h-9 w-full overflow-visible", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
