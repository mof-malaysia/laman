/**
 * The page drawer: everything about the page beyond its blocks, without leaving the
 * editor. For a collection, its Entries first; then Details (its title, address and SEO,
 * and what's known about it), Settings (the collection's own settings, redirect,
 * duplicate, move, unpublish, delete), History and Analytics. The address says which is
 * open (`?panel=`), so a link can open it straight to the right place.
 */
import type { Page } from "@laman/contracts";
import type { ReactNode } from "react";
import { PageAnalyticsTab } from "@/analytics/page-tab";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { usePages } from "@/lib/pages";
import { HistoryTab } from "@/pages/site/history-tab";
import { EntriesTab } from "@/pages/site/listing";
import type { SettingsSection } from "@/pages/site/search";
import { AboutPanel } from "@/pages/site/about-panel";
import { type DraftLink, SettingsTab } from "@/pages/site/settings-tab";
import { Panel } from "@/pages/site/tab-layout";

export const panelTabs = ["entries", "details", "settings", "history", "analytics"] as const;
export type PanelTab = (typeof panelTabs)[number];

/** The tabs a page of this kind has: only a collection has entries. */
const tabsFor = (page: Page) =>
  panelTabs.filter((tab) => tab !== "entries" || page.kind === "listing");

export type PanelSearch = { panel?: PanelTab; section?: SettingsSection };

export function PageDrawer({
  page,
  panel,
  section,
  onPanel,
  fields,
  draft,
}: {
  page: Page;
  /** The page's own fields, bound to the editor's draft. */
  fields: ReactNode;
  /** The editor's draft, for Settings (see `DraftLink`). */
  draft: DraftLink;
  panel: PanelTab | undefined;
  section: SettingsSection | undefined;
  /** Open a tab (with a Settings section), or close with `undefined`. */
  onPanel: (panel: PanelTab | undefined, section?: SettingsSection) => void;
}) {
  const pages = usePages().data ?? [];
  const tabs = tabsFor(page);
  // A tab the page lacks (Entries, from a link to another kind of page) opens Details.
  const tab = panel && tabs.includes(panel) ? panel : "details";
  return (
    <Drawer
      side="right"
      open={panel !== undefined}
      onOpenChange={(open) => !open && onPanel(undefined)}
    >
      {/* Wide enough for History's list and the charts; the canvas stays in view beside it. */}
      <DrawerContent className="bg-bg-gray-50 w-full sm:max-w-[37.5rem]">
        <DrawerHeader className="bg-bg-white gap-3 pb-0">
          <DrawerTitle className="truncate">{page.title || t("page.untitled")}</DrawerTitle>
          <Tabs value={tab} onValueChange={(value) => onPanel(value as PanelTab)} className="gap-0">
            <TabsList width="full">
              {tabs.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`detail.tab.${value}`)}
                  {value === "entries" && <TabsCounter>{page.entryCount ?? 0}</TabsCounter>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DrawerHeader>
        <DrawerBody className="py-5">
          {tab === "entries" ? (
            <EntriesTab listing={page} />
          ) : tab === "history" ? (
            <HistoryTab page={page} />
          ) : tab === "analytics" ? (
            <PageAnalyticsTab pageId={page.id} />
          ) : tab === "settings" ? (
            <SettingsTab page={page} pages={pages} section={section} draft={draft} />
          ) : (
            <div className="flex flex-col gap-6">
              <Panel>{fields}</Panel>
              <AboutPanel
                page={page}
                pages={pages}
                collection={pages.find((p) => p.id === page.parentId && page.kind === "entry")}
                onPanel={onPanel}
              />
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
