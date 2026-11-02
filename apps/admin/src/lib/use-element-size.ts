import { type RefObject, useEffect, useState } from "react";

/** The content size of `ref`'s element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Same size, same object: no re-render.
      setSize((last) =>
        last.width === width && last.height === height ? last : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
