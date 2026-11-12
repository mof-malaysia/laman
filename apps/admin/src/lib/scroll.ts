/** The nearest ancestor that scrolls its content (or will, once it's taller). */
function paneOf(element: HTMLElement, { scrolling = false } = {}) {
  for (let pane = element.parentElement; pane; pane = pane.parentElement) {
    const { overflowY } = getComputedStyle(pane);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      (!scrolling || pane.scrollHeight > pane.clientHeight)
    )
      return pane;
  }
  return null;
}

/** How far `element` sits below the top of `pane`, less a little room. */
const offsetIn = (pane: HTMLElement, element: HTMLElement) =>
  element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16;

/**
 * Scrolls the pane that holds `element` so it sits at the top. Not
 * scrollIntoView, which would also scroll the shell's fixed frame. `smooth`
 * glides there, unless the person has asked for reduced motion.
 */
export function scrollToTop(element: HTMLElement | null, { smooth = false } = {}) {
  const pane = element && paneOf(element, { scrolling: true });
  if (!element || !pane) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  pane.scrollBy({ top: offsetIn(pane, element), behavior: smooth && !reduce ? "smooth" : "auto" });
}

/** Input that means the person is moving the page themselves. */
const takingOver = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scrolls `element` to the top of its pane and keeps it there for `ms` while
 * what's above it finishes loading and changes height, until the person
 * scrolls themselves. Returns a cleanup.
 */
export function keepAtTop(element: HTMLElement | null, ms = 1500) {
  const pane = element && paneOf(element);
  if (!element || !pane) return () => {};
  const follow = () => {
    const by = offsetIn(pane, element);
    if (Math.abs(by) > 1) pane.scrollBy({ top: by });
  };
  // Fires once on observing, after layout, then whenever the content's height changes.
  const observer = new ResizeObserver(follow);
  observer.observe(pane.firstElementChild ?? pane);
  const done = new AbortController();
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    done.abort();
  };
  const timer = setTimeout(stop, ms);
  for (const event of takingOver)
    window.addEventListener(event, stop, { capture: true, passive: true, signal: done.signal });
  return stop;
}
