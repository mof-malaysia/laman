/** The page detail's tab and Settings section live in the address, so the More menu can link to them. */
import type { PageKind } from "@fiscal-sb/blocks";

// SEO sits under Details, so a page has four tabs and a collection six.
export const detailTabs = [
  "entries",
  "listing",
  "details",
  "analytics",
  "history",
  "settings",
] as const;
export type DetailTab = (typeof detailTabs)[number];
const pageTabs: readonly DetailTab[] = ["details", "analytics", "history", "settings"];
/** The tabs a page of this kind has; the first opens by default. */
export const tabsFor = (kind: PageKind): readonly DetailTab[] =>
  kind === "listing" ? detailTabs : pageTabs;

export const settingsSections = [
  "redirect",
  "listing",
  "duplicate",
  "move",
  "unpublish",
  "delete",
] as const;
export type SettingsSection = (typeof settingsSections)[number];

export type DetailSearch = { tab?: DetailTab; section?: SettingsSection };

const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T) ? (value as T) : undefined;

export function detailSearch(search: Record<string, unknown>): DetailSearch {
  const tab = oneOf(detailTabs, search.tab);
  const section = oneOf(settingsSections, search.section);
  return { ...(tab && { tab }), ...(section && { section }) };
}
