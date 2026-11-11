/**
 * The home page with an editor's unsaved site chrome on it (navbar, footer,
 * announcement), at desktop width scaled to fit. It loads once, then swaps
 * in the fresh `regions` a moment after each edit, so the page and its
 * scroll stay put.
 */
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { PAGE_WIDTH } from "@/components/page-frame";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { t } from "@/i18n";
import { usePages } from "@/lib/pages";
import { useElementSize } from "@/lib/use-element-size";

export function LivePreview({
  render,
  renderKey,
  regions,
  focus,
  caption,
  frame: given,
  onLoad,
  onSwap,
}: {
  /** The page's HTML with the edits in it. */
  render: (pageId: string, signal: AbortSignal) => Promise<string>;
  /** Changes when the edits that reach the page do: a new render. */
  renderKey: string;
  /** Selectors for the parts of the page the edits change, swapped in place. */
  regions: string[];
  /** The part of the page being edited (a child of its body, such as "header"): the rest is greyed out. */
  focus?: string;
  caption: ReactNode;
  /** The frame, for an editor that also reaches into the page (opening a dropdown, scrolling). */
  frame?: RefObject<HTMLIFrameElement | null>;
  onLoad?: () => void;
  onSwap?: () => void;
}) {
  const pages = usePages();
  const home = pages.data?.find((p) => p.parentId === null);
  const own = useRef<HTMLIFrameElement>(null);
  const frame = given ?? own;
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  const [first, setFirst] = useState<string>();
  const latest = useRef({ render, regions, onSwap });
  latest.current = { render, regions, onSwap };

  useEffect(() => {
    if (!home) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const html = await latest.current.render(home.id, controller.signal);
          const d = frame.current?.contentDocument;
          if (!first || !d?.body) return setFirst(html);
          const next = new DOMParser().parseFromString(html, "text/html");
          for (const selector of latest.current.regions) {
            const fresh = [...next.querySelectorAll(selector)];
            [...d.querySelectorAll(selector)].forEach((old, i) => {
              const replacement = fresh[i];
              if (replacement) old.replaceWith(d.importNode(replacement, true));
            });
          }
          latest.current.onSwap?.();
        } catch (error) {
          if (!controller.signal.aborted) console.error(error);
        }
      },
      first ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- a new render only when the edits change
  }, [home?.id, renderKey]);

  /**
   * Greys out all but `focus`, as a style in the frame's head, which swapping the
   * regions in after an edit leaves alone.
   */
  const highlight = () => {
    const d = frame.current?.contentDocument;
    if (!d?.head) return;
    let style = d.getElementById("laman-focus");
    if (!style) {
      style = d.createElement("style");
      style.id = "laman-focus";
      d.head.append(style);
    }
    style.textContent = focus
      ? `body > :not(${focus}):not(script) {
          opacity: 0.35;
          filter: grayscale(1);
          pointer-events: none;
          transition: opacity 150ms, filter 150ms;
        }`
      : "";
  };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `frame` is a ref; a new style only when the focus changes
  useEffect(highlight, [focus]);

  const scale = width ? Math.min(1, width / PAGE_WIDTH) : 1;
  return (
    <div className="flex h-full flex-col">
      <p className="text-body-sm text-txt-black-700 border-otl-gray-200 bg-bg-white flex items-start gap-2 border-b px-4 py-2.5">
        <EyeShowIcon className="text-txt-black-500 mt-0.5 size-4 shrink-0" aria-hidden />
        {caption}
      </p>
      <div ref={box} className="bg-bg-washed min-h-0 flex-1 overflow-hidden">
        {first && (
          // oxlint-disable-next-line react/iframe-missing-sandbox -- our own renderer, same origin
          <iframe
            ref={frame}
            title={t("navigation.preview")}
            srcDoc={first}
            onLoad={() => {
              highlight();
              onLoad?.();
            }}
            className="bg-bg-white origin-top-left"
            style={{ width: PAGE_WIDTH, height: height / scale, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  );
}
