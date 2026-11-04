// Prefixes root-relative links and images in Markdown with the site's base
// path, so the copy can say "/pasang" whether the site is served at / or /laman.

/** @param {{ base: string }} options */
export function withBase({ base }) {
  const prefix = base.replace(/\/$/, "");
  /** @param {string} value */
  const fix = (value) => {
    if (!prefix || !value.startsWith("/") || value.startsWith("//")) return value;
    return value === "/" ? prefix : prefix + value;
  };
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === "element") {
      if (node.tagName === "a" && typeof node.properties?.href === "string")
        node.properties.href = fix(node.properties.href);
      if (node.tagName === "img" && typeof node.properties?.src === "string")
        node.properties.src = fix(node.properties.src);
    }
    for (const child of node.children ?? []) walk(child);
  };
  return walk;
}
