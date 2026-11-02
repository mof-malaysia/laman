/**
 * A rendered page as a still picture: drawn at desktop width, scaled to fit,
 * in a browser frame showing its address. Nothing in it runs, scrolls or takes focus.
 */
import { type ReactNode, useRef, useState } from "react";
import { GlobeIcon } from "@/components/ui/icons/globe";
import { Spinner } from "@/components/ui/spinner";
import { clx } from "@/lib/ftds/utils";
import { useElementSize } from "@/lib/use-element-size";

/** The width the renderer draws at before scaling. */
export const PAGE_WIDTH = 1280;

export function PageFrame({
  src,
  path,
  title,
  className,
  overlay,
}: {
  /** A `/render/...` address. A new one redraws the picture. */
  src: string;
  path: string;
  title: string;
  /** Sizes the frame: give it a height, or make it grow in a flex column. */
  className?: string;
  /** Drawn over the picture, such as a link that opens the full page. */
  overlay?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useElementSize(box);
  const [loaded, setLoaded] = useState<string>();
  const loading = loaded !== src;
  const scale = size.width ? size.width / PAGE_WIDTH : 0;

  return (
    <div
      className={clx(
        "bg-bg-white border-otl-gray-200 flex min-h-0 flex-col overflow-hidden rounded-lg border",
        className,
      )}
    >
      <div className="border-otl-gray-200 bg-bg-washed flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <span className="flex gap-1" aria-hidden>
          <span className="bg-bg-washed-active size-2 rounded-full" />
          <span className="bg-bg-washed-active size-2 rounded-full" />
          <span className="bg-bg-washed-active size-2 rounded-full" />
        </span>
        <span className="bg-bg-white text-txt-black-700 text-body-xs flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-0.5">
          <GlobeIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate font-mono">{path}</span>
        </span>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
        {loading && (
          <Spinner
            label={null}
            className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          />
        )}
        {scale > 0 && (
          <iframe
            sandbox="allow-same-origin"
            title={title}
            src={src}
            inert
            tabIndex={-1}
            scrolling="no"
            onLoad={(event) => {
              // A still picture: the page in it doesn't scroll.
              const page = event.currentTarget.contentDocument?.documentElement;
              if (page) page.style.overflow = "hidden";
              setLoaded(src);
            }}
            className={clx(
              "pointer-events-none origin-top-left transition-opacity",
              loading && "opacity-60",
            )}
            style={{
              width: PAGE_WIDTH,
              height: size.height / scale,
              transform: `scale(${scale})`,
            }}
          />
        )}
        {overlay}
      </div>
    </div>
  );
}
