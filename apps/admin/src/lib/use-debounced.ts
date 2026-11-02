import { useEffect, useState } from "react";

/** `value` once it has stopped changing for `ms`: a search box's text after typing pauses. */
export function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
