/**
 * The admin's frame: FTDS AppShell with a labelled sidebar (it collapses to an
 * icon rail, and is a drawer on narrow screens), a top bar with the breadcrumb,
 * what's waiting to publish and ⌘K search, and the screen. It also owns the
 * dialogs and commands every screen can reach.
 */
import { announcementShowing } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useLocation,
  useMatchRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { SignInAgain } from "@/auth/sign-in-again";
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuCollapsible,
  SidebarMenuCollapsibleTrigger,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarTrigger,
} from "@/components/ui/app-shell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DocumentIcon } from "@/components/ui/icons/document";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { GalleryIcon } from "@/components/ui/icons/gallery";
import { GlobeIcon } from "@/components/ui/icons/globe";
import { HamburgerMenuIcon } from "@/components/ui/icons/hamburger-menu";
import { HomeIcon } from "@/components/ui/icons/home";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import { SearchIcon } from "@/components/ui/icons/search";
import { BrandMark } from "@/components/brand-mark";
import { PaletteIcon } from "@/components/palette-icon";
import { SettingIcon } from "@/components/ui/icons/setting";
import { UserIcon } from "@/components/ui/icons/user";
import { UserGroupIcon } from "@/components/ui/icons/user-group";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutProvider, useCommands, useShortcutActions } from "@/components/ui/shortcuts";
import { type MessageKey, t } from "@/i18n";
import { pagesApi } from "@/lib/api";
import { roleLabels, signOut, useCan, useMe } from "@/lib/auth";
import { usePages } from "@/lib/pages";
import { useAnnouncementDoc } from "@/lib/publish";
import { UploadDialog } from "@/media/upload-dialog";
import { type NavPart, navParts } from "@/site/navigation-screen";
import { ShellContext, type ShellActions } from "./context";
import { OpenPageDialog } from "./open-page-dialog";
import { PublishState, SiteInfo, WaitingDrawer } from "./site-status";

type Section = { to: string; label: MessageKey; combo: string; icon: ReactNode };

const dashboard: Section = { to: "/", label: "nav.dashboard", combo: "g d", icon: <HomeIcon /> };
const navigation: Section = {
  to: "/navigation",
  label: "nav.navigation",
  combo: "g n",
  icon: <HamburgerMenuIcon />,
};

const announcement: Section = {
  to: "/announcement",
  label: "nav.announcement",
  combo: "g a",
  icon: <MegaphoneIcon />,
};

const search: Section = {
  to: "/search",
  label: "nav.search",
  combo: "g c",
  icon: <SearchIcon />,
};

const colours: Section = {
  to: "/theme",
  label: "nav.colours",
  combo: "g t",
  icon: <PaletteIcon />,
};

const sections = [
  dashboard,
  { to: "/pages", label: "nav.pages", combo: "g p", icon: <DocumentIcon /> },
  { to: "/media", label: "nav.media", combo: "g m", icon: <GalleryIcon /> },
  navigation,
  announcement,
  search,
  colours,
  { to: "/publishing", label: "nav.publishing", combo: "g u", icon: <GlobeIcon /> },
  { to: "/analytics", label: "nav.analytics", combo: "g v", icon: <EyeShowIcon /> },
] satisfies Section[];

const settings: Section = {
  to: "/settings",
  label: "nav.settings",
  combo: "g s",
  icon: <SettingIcon />,
};

/** For Admins: people, invites and the audit log. */
const users: Section = { to: "/users", label: "nav.users", combo: "g w", icon: <UserGroupIcon /> };

const account: Section = { to: "/account", label: "nav.account", combo: "g y", icon: <UserIcon /> };

function sectionOf(pathname: string): Section {
  const path = pathname.replace(/^\/admin/, "") || "/";
  return (
    [...sections, settings, users, account].find(
      (s) => s.to !== "/" && (path === s.to || path.startsWith(`${s.to}/`)),
    ) ?? dashboard
  );
}

function NavItem({
  section,
  active,
  children,
}: {
  section: Section;
  active: boolean;
  children?: ReactNode;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={section.to} />}
        isActive={active}
        tooltip={t(section.label)}
      >
        {section.icon}
        <span>{t(section.label)}</span>
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The announcement, with a dot while it's on the site. */
function AnnouncementItem({ active }: { active: boolean }) {
  const live = useAnnouncementDoc().data?.published;
  return (
    <NavItem section={announcement} active={active}>
      {live && announcementShowing(live) && (
        <>
          <span aria-hidden className="bg-bg-warning-600 size-1.5 shrink-0 rounded-full" />
          <span className="sr-only">{t("navigation.announcement.isOn")}</span>
        </>
      )}
    </NavItem>
  );
}

/** Navigation's two parts, nested under it. */
function NavigationItem({ active }: { active: boolean }) {
  const { part = "navbar" } = useSearch({ strict: false }) as { part?: NavPart };
  return (
    <SidebarMenuItem>
      <SidebarMenuCollapsible defaultOpen={active}>
        <SidebarMenuCollapsibleTrigger tooltip={t(navigation.label)}>
          {navigation.icon}
          <span>{t(navigation.label)}</span>
        </SidebarMenuCollapsibleTrigger>
        <SidebarMenuSub>
          {navParts.map((p) => (
            <SidebarMenuItem key={p}>
              <SidebarMenuButton
                render={<Link to="/navigation" search={{ part: p }} />}
                isActive={active && part === p}
              >
                <span>{t(`navigation.part.${p}`)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenuSub>
      </SidebarMenuCollapsible>
    </SidebarMenuItem>
  );
}

/** Who's signed in, with Account and Sign out. */
function UserMenu({ active }: { active: boolean }) {
  const me = useMe();
  return (
    <SidebarMenuItem>
      <Menu>
        <MenuTrigger
          render={
            <SidebarMenuButton
              isActive={active}
              tooltip={me.displayName}
              className="h-auto py-1.5"
            />
          }
        >
          <UserIcon />
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate">{me.displayName}</span>
            <span className="text-body-2xs text-txt-black-500 truncate">
              {t(roleLabels[me.role])}
            </span>
          </span>
        </MenuTrigger>
        <MenuContent side="right" align="end">
          <MenuLinkItem render={<Link to="/account" />}>{t("nav.account")}</MenuLinkItem>
          <MenuSeparator />
          <MenuItem onClick={signOut}>{t("shell.signOut")}</MenuItem>
        </MenuContent>
      </Menu>
    </SidebarMenuItem>
  );
}

function AdminSidebar({ active }: { active: Section }) {
  const { openCheatSheet } = useShortcutActions();
  const canManagePeople = useCan("users.manage");
  return (
    <Sidebar label={t("shell.sidebar")}>
      <SidebarHeader>
        <Link to="/" className="focus-ring flex min-w-0 items-center gap-2 rounded-md no-underline">
          <BrandMark />
          <span className="text-label-md text-txt-black-900 truncate font-semibold group-data-[collapsible=icon]/sidebar:sr-only">
            {t("app.name")}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {sections.map((section) =>
              section === navigation ? (
                <NavigationItem key={section.to} active={section === active} />
              ) : section === announcement ? (
                <AnnouncementItem key={section.to} active={section === active} />
              ) : (
                <NavItem key={section.to} section={section} active={section === active} />
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavItem section={settings} active={settings === active} />
          {canManagePeople && <NavItem section={users} active={users === active} />}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={openCheatSheet} tooltip={t("nav.shortcuts")}>
              <QuestionCircleIcon />
              <span>{t("nav.shortcuts")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <UserMenu active={account === active} />
        </SidebarMenu>
        <SiteInfo />
      </SidebarFooter>
    </Sidebar>
  );
}

/** Go-to keys for each section (g p, g m…), and alt+1…3 for Navigation's parts while there. */
function NavigationCommands({ active }: { active: Section }) {
  const navigate = useNavigate();
  const group = t("shell.navigationGroup");
  const canManagePeople = useCan("users.manage");
  useCommands([
    ...[...sections, settings, ...(canManagePeople ? [users] : []), account].map((section) => ({
      id: `nav.${section.to}`,
      title: t("shell.goTo", { label: t(section.label) }),
      group,
      combo: section.combo,
      run: () => void navigate({ to: section.to }),
    })),
    ...(active === navigation
      ? navParts.map((p, i) => ({
          id: `nav.navigation.${p}`,
          title: t("shell.goTo", { label: t(`navigation.part.${p}`) }),
          group,
          combo: `alt+${i + 1}`,
          run: () => void navigate({ to: "/navigation", search: { part: p } }),
        }))
      : []),
  ]);
  return null;
}

/** A search field look-alike that opens the command palette, with its ⌘K hint. */
function SearchTrigger() {
  const { openPalette } = useShortcutActions();
  return (
    <button
      type="button"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={openPalette}
      className="border-otl-gray-200 bg-bg-white text-txt-black-500 text-label-md hover:border-otl-gray-300 hover:text-txt-black-700 focus-ring flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2"
    >
      <SearchIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-24 text-left max-sm:sr-only">{t("shell.search")}</span>
      <Kbd combo="mod+k" aria-hidden className="hidden sm:inline-flex" />
    </button>
  );
}

/** The section, or Pages › the selected page's title (Pages › listing › title for an entry). */
/** Screens below a section's own: the breadcrumb leads back to the section. */
const subScreens = [{ to: "/users/audit", label: "users.audit" }] as const;

function TopBarBreadcrumb({ section }: { section: Section }) {
  const pages = usePages();
  const matchRoute = useMatchRoute();
  const match = matchRoute({ to: "/pages/$id", fuzzy: true });
  const sub = subScreens.find((screen) => matchRoute({ to: screen.to }));
  const id = match ? match.id : undefined;
  const inTree = pages.data?.find((p) => p.id === id);
  // Entries aren't in the tree list; their own page query has them.
  const entry = useQuery({
    queryKey: ["page", id],
    queryFn: () => pagesApi.get(id ?? ""),
    enabled: Boolean(id) && Boolean(pages.data) && !inTree,
  });
  const page = inTree ?? entry.data;
  const listing =
    page?.kind === "entry" ? pages.data?.find((p) => p.id === page.parentId) : undefined;

  if (page)
    return (
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/pages" />}>{t("nav.pages")}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {listing && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/pages/$id" params={{ id: listing.id }} />}>
                {listing.title}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        <BreadcrumbItem>
          <BreadcrumbPage>{page.title || t("page.untitled")}</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    );
  if (sub)
    return (
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={section.to} />}>{t(section.label)}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{t(sub.label)}</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    );
  return (
    <Breadcrumb>
      <BreadcrumbItem>
        <BreadcrumbPage>{t(section.label)}</BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  );
}

/** Commands every screen offers: new page, open page, what isn't live yet. */
function GlobalCommands({ actions }: { actions: ShellActions }) {
  const group = t("commands.group");
  useCommands([
    {
      id: "page.new",
      title: t("commands.newPage"),
      group,
      combo: "c",
      run: () => actions.newPage(),
    },
    {
      id: "page.open",
      title: t("commands.openPage"),
      group,
      combo: "o",
      keywords: ["find", "go"],
      run: actions.openPage,
    },
    {
      id: "media.upload",
      title: t("commands.uploadMedia"),
      group,
      combo: "u",
      run: () => actions.uploadMedia(),
    },
    {
      id: "site.waiting",
      title: t("commands.waiting"),
      group,
      combo: "shift+p",
      keywords: ["publish", "live"],
      run: actions.openWaiting,
    },
  ]);
  return null;
}

export function AdminShell() {
  const { pathname } = useLocation();
  const active = sectionOf(pathname);
  const navigate = useNavigate();
  const [openPage, setOpenPage] = useState(false);
  const [upload, setUpload] = useState<{ open: boolean; files: File[] }>({
    open: false,
    files: [],
  });
  const [waiting, setWaiting] = useState(false);

  const actions = useMemo<ShellActions>(
    () => ({
      newPage: (parentId) =>
        void navigate({ to: "/pages/new", search: parentId ? { parent: parentId } : {} }),
      openPage: () => setOpenPage(true),
      openWaiting: () => setWaiting(true),
      uploadMedia: (files = []) => setUpload({ open: true, files }),
    }),
    [navigate],
  );

  return (
    <ShortcutProvider labels={{ palettePlaceholder: t("shell.palettePlaceholder") }}>
      <ShellContext.Provider value={actions}>
        <AppShell data-density="compact" storageKey="admin.sidebar">
          <GlobalCommands actions={actions} />
          <NavigationCommands active={active} />
          <AdminSidebar active={active} />
          <AppShellHeader>
            <SidebarTrigger label={t("shell.toggleSidebar")} />
            <TopBarBreadcrumb section={active} />
            <span className="flex-1" />
            <PublishState onOpenWaiting={actions.openWaiting} />
            <SearchTrigger />
          </AppShellHeader>
          <AppShellMain id="main" tabIndex={-1} className="p-0">
            <Outlet />
          </AppShellMain>
        </AppShell>
        <OpenPageDialog open={openPage} onOpenChange={setOpenPage} />
        <WaitingDrawer open={waiting} onOpenChange={setWaiting} />
        <UploadDialog
          open={upload.open}
          dropped={upload.files}
          onOpenChange={(open) => setUpload((state) => ({ ...state, open }))}
        />
        <SignInAgain />
      </ShellContext.Provider>
    </ShortcutProvider>
  );
}
