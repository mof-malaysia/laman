/**
 * The admin's frame: FTDS AppShell with a labelled sidebar (it collapses to an
 * icon rail, and is a drawer on narrow screens), a top bar with the breadcrumb,
 * what's waiting to publish and ⌘K search, and the screen. It also owns the
 * dialogs and commands every screen can reach.
 */
import { announcementShowing } from "@laman/contracts";
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
import { useSiteBrand, useSiteTab } from "./site-brand";
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
import { SearchIcon } from "@/components/ui/icons/search";
import { AppTag } from "@/components/app-tag";
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
import { Skeleton } from "@/components/ui/skeleton";
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
import { PageBreadcrumb } from "./page-breadcrumb";
import { PersonAvatar } from "@/users/person";
import { usersPages } from "@/users/users-tabs";
import { PublishState, SiteInfo, ViewSite } from "./site-status";

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

/**
 * The sidebar in the order of the work: what the site says, how the site is
 * dressed, then putting it live and seeing who came. The dashboard stands alone.
 */
const groups: { label?: MessageKey; sections: Section[] }[] = [
  { sections: [dashboard] },
  {
    label: "nav.group.content",
    sections: [
      { to: "/pages", label: "nav.pages", combo: "g p", icon: <DocumentIcon /> },
      { to: "/media", label: "nav.media", combo: "g m", icon: <GalleryIcon /> },
    ],
  },
  { label: "nav.group.site", sections: [navigation, announcement, search, colours] },
  {
    label: "nav.group.live",
    sections: [
      { to: "/publishing", label: "nav.publishing", combo: "g u", icon: <GlobeIcon /> },
      { to: "/analytics", label: "nav.analytics", combo: "g v", icon: <EyeShowIcon /> },
    ],
  },
];

const sections = groups.flatMap((group) => group.sections);

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
          {/* In the icon column, so the name lines up with the items above. */}
          <PersonAvatar name={me.displayName} className="-mx-0.5 size-6 shrink-0" />
          {/* The rail keeps only icons, so it shows this in the avatar's place. */}
          <UserIcon className="hidden group-data-[collapsible=icon]/sidebar:block" />
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

/**
 * The site's own logo and name once a logo is published, so officers see whose
 * site they're running; Laman's until then. The tag says this is the admin,
 * not the public site, and hides with the name when the sidebar is a rail.
 */
function AdminBrand() {
  // On screen everywhere, so its own mounts (the phone drawer) needn't refetch.
  const { settings: siteSettings, identity, logo } = useSiteBrand();
  const [broken, setBroken] = useState(false);
  const logoUrl = broken ? undefined : logo.data?.thumbnailUrl;
  const name = logoUrl && identity ? identity.siteName : t("app.name");
  // Wait for a logo that's on its way rather than flash Laman's first.
  const loading = siteSettings.isPending || (Boolean(identity?.logo) && logo.isPending);
  return (
    // One row: mark, name, tag. The name gives way first, so the tag always shows.
    <Link to="/" className="focus-ring flex min-w-0 items-center gap-2 rounded-md no-underline">
      {loading ? (
        <>
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <Skeleton className="h-4 w-28 group-data-[collapsible=icon]/sidebar:hidden" />
        </>
      ) : (
        <>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              onError={() => setBroken(true)}
              className="h-7 w-auto max-w-16 shrink-0 rounded-xs object-contain group-data-[collapsible=icon]/sidebar:max-w-7"
            />
          ) : (
            <BrandMark />
          )}
          <span
            className="text-label-md text-txt-black-900 min-w-0 truncate font-semibold group-data-[collapsible=icon]/sidebar:sr-only"
            title={logoUrl ? name : undefined}
          >
            {name}
          </span>
        </>
      )}
      <AppTag className="group-data-[collapsible=icon]/sidebar:hidden" />
    </Link>
  );
}

function AdminSidebar({ active }: { active: Section }) {
  const canManagePeople = useCan("users.manage");
  return (
    <Sidebar label={t("shell.sidebar")}>
      <SidebarHeader>
        <AdminBrand />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label ?? "home"}>
            {group.label && <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.sections.map((section) =>
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
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavItem section={settings} active={settings === active} />
          {canManagePeople && <NavItem section={users} active={users === active} />}
          <UserMenu active={account === active} />
          <SiteInfo />
        </SidebarMenu>
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

/** Screens below a section's own: the breadcrumb leads back to the section. */
const subScreens = usersPages.filter((page) => page.to !== "/users");

/**
 * The section, or a page's whole path: Pages › its parents › the page. A parent opens in
 * the editor (a collection, at its entries); the page's own name opens the page switcher.
 */
function TopBarBreadcrumb({ section }: { section: Section }) {
  const pages = usePages();
  const matchRoute = useMatchRoute();
  const match = matchRoute({ to: "/pages/$id", fuzzy: true });
  const sub = subScreens.find((screen) => matchRoute({ to: screen.to }));
  const id = match ? match.id : undefined;
  const inList = pages.data?.find((p) => p.id === id);
  // Entries aren't in the page list; their own page query has them.
  const entry = useQuery({
    queryKey: ["page", id],
    queryFn: () => pagesApi.get(id ?? ""),
    enabled: Boolean(id) && Boolean(pages.data) && !inList,
  });
  const page = inList ?? entry.data;

  if (page) return <PageBreadcrumb page={page} />;
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
  const navigate = useNavigate();
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
      run: () => void navigate({ to: "/publishing" }),
    },
  ]);
  return null;
}

export function AdminShell() {
  const { pathname } = useLocation();
  const active = sectionOf(pathname);
  // The editor draws one bar of its own, with the page's path in it: the top bar steps
  // aside there, except on a phone, where it holds the menu button.
  const editing = /\/pages\/[^/]+\/edit$/.test(pathname);
  const navigate = useNavigate();
  const [openPage, setOpenPage] = useState(false);
  const [upload, setUpload] = useState<{ open: boolean; files: File[] }>({
    open: false,
    files: [],
  });
  useSiteTab();

  const actions = useMemo<ShellActions>(
    () => ({
      newPage: (parentId) =>
        void navigate({ to: "/pages/new", search: parentId ? { parent: parentId } : {} }),
      openPage: () => setOpenPage(true),
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
          <AppShellHeader className={editing ? "md:hidden" : undefined}>
            <SidebarTrigger label={t("shell.toggleSidebar")} />
            <TopBarBreadcrumb section={active} />
            <span className="flex-1" />
            <PublishState />
            <ViewSite />
            <SearchTrigger />
          </AppShellHeader>
          <AppShellMain id="main" tabIndex={-1} className="p-0">
            <Outlet />
          </AppShellMain>
        </AppShell>
        <OpenPageDialog open={openPage} onOpenChange={setOpenPage} />
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
