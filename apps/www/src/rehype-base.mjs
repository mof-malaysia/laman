import { withBase } from "./base-path.mjs";

// Prefixes root-relative links and images in Markdown with the site's base
// path, so the copy can say "/pasang" whether the site is served at / or /laman.

/** @param {{ base: string }} options */
export function baseLinks({ base }) {
  /** @param {string} value */
  const fix = (value) => withBase(base, value);
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

/** Gives each table cell its column's header as data-label, so a phone can stack the rows. */
export function labelCells() {
  /** @param {any} node */
  const text = (node) =>
    node.type === "text" ? node.value : (node.children ?? []).map(text).join("");
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === "element" && node.tagName === "table") {
      const head = node.children.find((c) => c.tagName === "thead");
      const headers =
        head?.children
          .find((c) => c.tagName === "tr")
          ?.children.filter((c) => c.tagName === "th")
          .map(text) ?? [];
      const body = node.children.find((c) => c.tagName === "tbody");
      for (const row of body?.children ?? []) {
        let i = 0;
        for (const cell of row.children ?? []) {
          if (cell.type !== "element") continue;
          if (i > 0 && headers[i]) cell.properties = { ...cell.properties, dataLabel: headers[i] };
          i++;
        }
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  return walk;
}
