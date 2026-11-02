/**
 * Routes, defined in code. Add a page: create it in src/pages, add a
 * createRoute() here and list it in routeTree.
 */
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { EditorPage } from "./editor/editor-page";
import { RootLayout } from "./layout";
import { AdminShell } from "./shell/shell";
import { DashboardPage } from "./pages/dashboard";
import { ErrorPage } from "./pages/error";
import { NotFoundPage } from "./pages/not-found";
import { MediaScreen } from "./media/media-screen";
import { type MediaSearch, mediaSearch } from "./media/search";
import { AnnouncementScreen } from "./site/announcement-screen";
import { SearchScreen } from "./site/search-screen";
import { ThemeScreen } from "./site/theme-screen";
import { type NavPart, NavigationScreen, navParts } from "./site/navigation-screen";
import { type SettingsSectionId, SettingsScreen, settingsSections } from "./site/settings-screen";
import { PublishingScreen } from "./publishing/publishing-screen";
import { AnalyticsScreen } from "./analytics/analytics-screen";
import { type RangeSearch, rangeSearch } from "./analytics/range";
import { PagesScreen } from "./pages/site/pages-screen";
import { TrashScreen } from "./pages/site/trash-screen";
import { type DetailSearch, detailSearch } from "./pages/site/search";
import { NewPageScreen } from "./pages/new-page/new-page-screen";
import { type NewPageSearch, newPageSearch } from "./pages/new-page/search";

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

// Every screen sits in the shell: rail, top bar with the open pages, status bar.
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AdminShell,
});

// New page is a focused flow of its own, outside the shell.
const newPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pages/new",
  validateSearch: (search): NewPageSearch => newPageSearch(search),
  component: NewPageScreen,
});

const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: DashboardPage,
});

const pagesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/pages",
  component: PagesScreen,
});

const pageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/pages/$id",
  validateSearch: (search): DetailSearch => detailSearch(search),
  component: PagesScreen,
});

// Recently deleted: the tree's other mode, with the selected page's preview.
const trashRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/pages/trash",
  component: TrashScreen,
});

const deletedPageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/pages/trash/$id",
  component: TrashScreen,
});

const editorRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/pages/$id/edit",
  component: EditorPage,
});

// Sections that arrive in later milestones of docs/admin.md.
const mediaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/media",
  validateSearch: (search): MediaSearch => mediaSearch(search),
  component: MediaScreen,
});
const navigationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/navigation",
  validateSearch: (search): { part?: NavPart } =>
    navParts.includes(search.part as NavPart) ? { part: search.part as NavPart } : {},
  component: NavigationScreen,
});
const announcementRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/announcement",
  component: AnnouncementScreen,
});
const searchRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/search",
  component: SearchScreen,
});
const themeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/theme",
  component: ThemeScreen,
});
const publishingRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/publishing",
  component: PublishingScreen,
});
const analyticsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/analytics",
  validateSearch: (search): RangeSearch => rangeSearch(search),
  component: AnalyticsScreen,
});
const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  validateSearch: (search): { section?: SettingsSectionId } =>
    settingsSections.includes(search.section as SettingsSectionId)
      ? { section: search.section as SettingsSectionId }
      : {},
  component: SettingsScreen,
});

const routeTree = rootRoute.addChildren([
  newPageRoute,
  shellRoute.addChildren([
    dashboardRoute,
    pagesRoute,
    pageRoute,
    trashRoute,
    deletedPageRoute,
    mediaRoute,
    navigationRoute,
    announcementRoute,
    searchRoute,
    themeRoute,
    publishingRoute,
    analyticsRoute,
    settingsRoute,
    editorRoute,
  ]),
]);

export const router = createRouter({ routeTree, basepath: "/admin", defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
