/**
 * Routes, defined in code. Add a page: create it in src/pages, add a
 * createRoute() here and list it in routeTree.
 */
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { EditorPage } from "./editor/editor-page";
import { type PanelSearch, panelTabs } from "./editor/page-drawer";
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
import {
  pageOf,
  type SettingsSectionId,
  SettingsScreen,
  settingsSections,
} from "./site/settings-screen";
import { PublishingScreen } from "./publishing/publishing-screen";
import { type PublishingSearch, publishingSearch } from "./publishing/search";
import { AnalyticsScreen } from "./analytics/analytics-screen";
import { type RangeSearch, rangeSearch } from "./analytics/range";
import { PagesScreen } from "./pages/site/pages-screen";
import { TrashScreen } from "./pages/site/trash-screen";
import {
  type DetailSearch,
  detailSearch,
  settingsSections as pageSections,
} from "./pages/site/search";
import { NewPageScreen } from "./pages/new-page/new-page-screen";
import { type NewPageSearch, newPageSearch } from "./pages/new-page/search";
import { AccountScreen } from "./account/account-screen";
import { ConnectScreen, connectSearch } from "./auth/connect-screen";
import { JoinScreen, ResetScreen } from "./auth/link-screens";
import { CodeScreen, EnrolScreen, PasswordScreen, SignInScreen } from "./auth/sign-in-screens";
import { meQuery, stagePaths } from "./lib/auth";
import { queryClient } from "./lib/query";
import { type AgentsSearch, AgentsScreen, agentsSearch } from "./users/agents-screen";
import { TokensScreen } from "./users/tokens-screen";
import { type AuditSearch, AuditScreen, auditSearch } from "./users/audit-screen";
import { UsersScreen } from "./users/users-screen";

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

/** Where to go once signed in: kept through each step of signing in. */
const nextSearch = (search: Record<string, unknown>): { next?: string } =>
  typeof search.next === "string" ? { next: search.next } : {};

// Signing in and the one-time links: outside the admin, open to anyone.
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: nextSearch,
  component: SignInScreen,
});
// Each step after the password, at its path in `stagePaths`.
const stepScreens = { totp: CodeScreen, password: PasswordScreen, enrol: EnrolScreen };
const stepRoutes = (Object.keys(stepScreens) as (keyof typeof stepScreens)[]).map((stage) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: stagePaths[stage],
    validateSearch: nextSearch,
    component: stepScreens[stage],
  }),
);
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  component: JoinScreen,
});
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset",
  component: ResetScreen,
});

// Everything else needs a finished sign-in: without one, Sign in (or the
// step it's at), then back here.
const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
  beforeLoad: async ({ location }) => {
    const me = await queryClient.ensureQueryData(meQuery).catch(() => undefined);
    const next = `/admin${location.href}`;
    if (!me) throw redirect({ to: "/sign-in", search: { next } });
    if (me.stage !== "full") throw redirect({ to: stagePaths[me.stage], search: { next } });
  },
  component: Outlet,
});

// An agent's sign-in (docs/mcp.md): after signing in, outside the shell, like signing in itself.
const connectRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/connect",
  validateSearch: connectSearch,
  component: ConnectScreen,
});

// Every screen sits in the shell: rail, top bar with the open pages, status bar.
const shellRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "shell",
  component: AdminShell,
});

// New page is a focused flow of its own, outside the shell.
const newPageRoute = createRoute({
  getParentRoute: () => signedInRoute,
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
  // `checks`: open what the check before publishing found, as the publish list's link does.
  // `panel` (and `section`): open the page drawer at that tab, as links to a page's settings,
  // history or analytics do.
  validateSearch: (search): { checks?: true } & PanelSearch => {
    const panel = panelTabs.find((tab) => tab === search.panel);
    const section = pageSections.find((s) => s === search.section);
    return {
      ...(search.checks ? { checks: true as const } : {}),
      ...(panel && { panel }),
      ...(panel && section && { section }),
    };
  },
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
  validateSearch: (search): PublishingSearch => publishingSearch(search),
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
  // A section shown as a further card on another's page (Phase banner) links to that page.
  validateSearch: (search): { section?: SettingsSectionId } =>
    settingsSections.includes(search.section as SettingsSectionId)
      ? { section: pageOf(search.section as SettingsSectionId) }
      : {},
  component: SettingsScreen,
});

const usersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users",
  component: UsersScreen,
});
const auditRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/audit",
  validateSearch: (search): AuditSearch => auditSearch(search),
  component: AuditScreen,
});
const agentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/agents",
  validateSearch: (search): AgentsSearch => agentsSearch(search),
  component: AgentsScreen,
});
const tokensRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/tokens",
  component: TokensScreen,
});
const accountRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/account",
  component: AccountScreen,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  ...stepRoutes,
  joinRoute,
  resetRoute,
  signedInRoute.addChildren([
    connectRoute,
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
      usersRoute,
      auditRoute,
      agentsRoute,
      tokensRoute,
      accountRoute,
      editorRoute,
    ]),
  ]),
]);

export const router = createRouter({
  routeTree,
  basepath: "/admin",
  defaultPreload: "intent",
  // A screen that throws shows the error in its own place: inside the shell, the sidebar stays.
  defaultErrorComponent: ErrorPage,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
