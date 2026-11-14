/**
 * A block's band tone as FTDS draws it. The Accent wash is FTDS's primary
 * wash with the site's accent swapped in (`accent-wash` in global.css), so
 * it's `tone="primary"` plus that class.
 */
export const bandTone = <T extends string>(tone: T) =>
  tone === "accent"
    ? { tone: "primary" as const, class: "accent-wash" }
    : { tone: tone as Exclude<T, "accent">, class: undefined };
