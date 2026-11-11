/** Six dots: the handle a row is dragged by, wherever rows are reordered. */
import type { SVGProps } from "react";

export function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      {[7, 13].flatMap((x) =>
        [5, 10, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />),
      )}
    </svg>
  );
}
