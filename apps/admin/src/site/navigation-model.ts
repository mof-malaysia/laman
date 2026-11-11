/**
 * Edits to the navigation document, as pure functions. A selection is a
 * dotted path into the navbar: "2" an item (a dropdown opens whole), "2.l.0" a
 * link of its list, "2.g.1.l.3" a link in its column 1.
 */
import {
  type DropdownLayout,
  type LinkTarget,
  type NavDropdown,
  type NavItem,
  type NavLink,
  Navigation,
} from "@fiscal-sb/contracts";

export type Selection = string | null;

export const parse = (selection: Selection) => {
  const parts = selection?.split(".") ?? [];
  const item = parts[0] === undefined ? undefined : Number(parts[0]);
  if (parts[1] === "g" && parts[3] === "l")
    return { item, group: Number(parts[2]), link: Number(parts[4]), part: "groupLink" as const };
  if (parts[1] === "l") return { item, link: Number(parts[2]), part: "link" as const };
  return { item, part: item === undefined ? ("none" as const) : ("item" as const) };
};

export const newLink = (label: string, target: LinkTarget): NavLink => ({ label, target });

export const newDropdown = (label: string): NavDropdown => ({
  type: "dropdown",
  label,
  layout: "list",
  columns: 1,
  links: [],
  groups: [],
});

/** Replaces item `index` of the navbar. */
export function setItem(nav: Navigation, index: number, item: NavItem): Navigation {
  return { ...nav, navbar: nav.navbar.map((it, i) => (i === index ? item : it)) };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const moved = list[from];
  if (moved === undefined) return list;
  return list.toSpliced(from, 1).toSpliced(to, 0, moved);
}

/**
 * Switching style never loses links: grouped flattens to one list, and a
 * list becomes a single column titled with the dropdown's label.
 */
export function setLayout(item: NavDropdown, layout: DropdownLayout): NavDropdown {
  if (layout === item.layout) return item;
  if (layout === "grouped") {
    const groups = item.groups.length
      ? item.groups
      : item.links.length
        ? [{ heading: item.label, links: item.links }]
        : [];
    return { ...item, layout, groups, links: [] };
  }
  const links = [...item.links, ...item.groups.flatMap((g) => g.links)];
  return { ...item, layout, links, groups: [] };
}

/** Field problems, by dotted path ("navbar.0.label"), from the same rules the server applies on save. */
export function problems(nav: Navigation): Map<string, string> {
  const result = Navigation.safeParse(nav);
  return new Map(
    result.success ? [] : result.error.issues.map((i) => [i.path.join("."), i.message]),
  );
}

/** The navbar items whose label another top-level item also has: visitors can't tell them apart. */
export function duplicateLabels(nav: Navigation): Set<number> {
  const seen = new Map<string, number[]>();
  nav.navbar.forEach((item, i) => {
    const key = item.label.trim().toLowerCase();
    if (key) seen.set(key, [...(seen.get(key) ?? []), i]);
  });
  return new Set([...seen.values()].filter((list) => list.length > 1).flat());
}

/** `base`, or "base 2", "base 3"… so new items aren't all called the same. */
export function uniqueLabel(base: string, nav: Navigation): string {
  const taken = new Set(nav.navbar.map((item) => item.label));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * The selection that a warning's path points at: "navbar.2.links.0" is "2.l.0".
 * Anything else in a dropdown (its feature card, its footer link) opens the dropdown.
 */
export function selectionOf(path: string): Selection {
  const [root, item, kind, a, links, b] = path.split(".");
  if (root !== "navbar" || item === undefined) return null;
  if (kind === "links") return `${item}.l.${a}`;
  if (kind === "groups" && links === "links") return `${item}.g.${a}.l.${b}`;
  return item;
}

/**
 * What publishing would change in the navbar and footer, in words, compared
 * with what's live. Items are matched by label.
 */
const byLabel = (nav: Navigation) => new Map(nav.navbar.map((item) => [item.label, item]));
/** The labels of `nav` that `other` also has, in `nav`'s order. */
const kept = (nav: Navigation, other: Map<string, NavItem>) =>
  nav.navbar.map((i) => i.label).filter((label) => other.has(label));

export function navigationChanges(live: Navigation, next: Navigation) {
  const before = byLabel(live);
  const after = byLabel(next);
  const added = next.navbar.filter((item) => !before.has(item.label)).map((i) => i.label);
  const removed = live.navbar.filter((item) => !after.has(item.label)).map((i) => i.label);
  const changed = next.navbar
    .filter((item) => {
      const old = before.get(item.label);
      return old && JSON.stringify(old) !== JSON.stringify(item);
    })
    .map((i) => i.label);
  const reordered = kept(live, after).join("\n") !== kept(next, before).join("\n");
  const footer = JSON.stringify(live.footer) !== JSON.stringify(next.footer);
  return { added, removed, changed, reordered, footer };
}
