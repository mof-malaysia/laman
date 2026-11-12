/**
 * Scrolls the pane that holds `element` so it sits at the top. Not
 * scrollIntoView, which would also scroll the shell's fixed frame. `smooth`
 * glides there, unless the person has asked for reduced motion.
 */
export function scrollToTop(element: HTMLElement | null, { smooth = false } = {}) {
  if (!element) return;
  for (let pane = element.parentElement; pane; pane = pane.parentElement) {
    const { overflowY } = getComputedStyle(pane);
    if ((overflowY === "auto" || overflowY === "scroll") && pane.scrollHeight > pane.clientHeight) {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      pane.scrollBy({
        top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16,
        behavior: smooth && !reduce ? "smooth" : "auto",
      });
      return;
    }
  }
}

/**
 * Scrolls `element` to the top, then keeps it there for `ms` while what's
 * around it finishes loading and changes height, until the person scrolls
 * themselves. Returns a cleanup.
 */
export function keepAtTop(element: HTMLElement | null, ms = 1500) {
  if (!element) return () => {};
  const area = element.parentElement?.parentElement ?? element.parentElement;
  const observer = new ResizeObserver(() => scrollToTop(element));
  if (area) observer.observe(area);
  scrollToTop(element);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const event of ["wheel", "touchstart", "keydown", "pointerdown"])
      window.removeEventListener(event, stop, true);
  };
  const timer = setTimeout(stop, ms);
  for (const event of ["wheel", "touchstart", "keydown", "pointerdown"])
    window.addEventListener(event, stop, { capture: true, passive: true });
  return stop;
}
