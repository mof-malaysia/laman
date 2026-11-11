/**
 * The page drawer's Settings sections, and the tabs of the old page screen: its
 * address still opens, and lands on the matching drawer tab in the editor.
 */

/** The old page screen's tabs, which old links and bookmarks may still name. */
export const detailTabs = [
  "entries",
  "listing",
  "details",
  "analytics",
  "history",
  "settings",
] as const;
export type DetailTab = (typeof detailTabs)[number];

export const settingsSections = [
  "collection",
  "calendars",
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
