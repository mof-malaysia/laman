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
