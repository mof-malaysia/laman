/** The page list as the admin uses it: queries, the tree, and dates. */
import type { PageSummary } from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { locale, t } from "@/i18n";
import { historyApi, isActive, pagesApi, siteApi } from "./api";

export const pagesQuery = { queryKey: ["pages"], queryFn: pagesApi.list } as const;
export const usePages = () => useQuery(pagesQuery);

/** A page's revisions; `updatedAt` refetches them after the page changes. */
export const revisionsQuery = (pageId: string, updatedAt: string) => ({
  queryKey: ["revisions", pageId, updatedAt],
  queryFn: () => historyApi.revisions(pageId),
});

/** One revision with its content, once its id is known. */
export const revisionQuery = (pageId: string, revisionId: string | undefined) => ({
  queryKey: ["revision", pageId, revisionId],
  queryFn: () => historyApi.revision(pageId, revisionId ?? ""),
  enabled: revisionId !== undefined,
});

export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: siteApi.summary,
    // Quickly while a publish or backup runs or images process, so the status bar follows.
    refetchInterval: (query) => {
      const latest = query.state.data?.publishes[0];
      const busy =
        (latest && isActive(latest)) ||
        (query.state.data?.media.processing ?? 0) > 0 ||
        query.state.data?.backup.running;
      return busy ? 1000 : 15_000;
    },
  });
}

/** After anything that changes pages: the tree, the open page and the dashboard. */
export function useRefreshPages() {
  const queryClient = useQueryClient();
  return useCallback(
    async (id?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pages"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["trash"] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        id ? queryClient.invalidateQueries({ queryKey: ["page", id] }) : undefined,
      ]);
    },
    [queryClient],
  );
}

/** Sibling order, as the server keeps it: by position, then id. */
export const bySiblingOrder = (a: PageSummary, b: PageSummary) =>
  a.position - b.position || a.id.localeCompare(b.id);

export type TreeItem = PageSummary & { children: TreeItem[]; depth: number };

/** The list (depth first from the home page) as a tree. */
export function buildTree(pages: PageSummary[]): TreeItem[] {
  const items = new Map(pages.map((p) => [p.id, { ...p, children: [] as TreeItem[], depth: 0 }]));
  const roots: TreeItem[] = [];
  for (const item of items.values()) {
    const parent = item.parentId ? items.get(item.parentId) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  const setDepth = (list: TreeItem[], depth: number) => {
    for (const item of list) {
      item.depth = depth;
      item.children.sort(bySiblingOrder);
      setDepth(item.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

/** Ids of `id` and every page under it. */
export function subtreeIds(pages: PageSummary[], id: string): Set<string> {
  const ids = new Set([id]);
  for (const page of pages) if (page.parentId && ids.has(page.parentId)) ids.add(page.id);
  return ids;
}

export const isHome = (page: Pick<PageSummary, "parentId">) => page.parentId === null;

/** The home page's address, and an entry's addressed by year (2026/tajuk), can't be edited. */
export const fixedAddress = (page: Pick<PageSummary, "parentId" | "slug">) =>
  isHome(page) || page.slug.includes("/");

/** The draft as visitors would see it, in a page of its own. */
export const previewHref = (id: string) => `/render/pages/${id}?mode=preview`;

const dateTime = new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat(locale(), { timeStyle: "short" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
const date = new Intl.DateTimeFormat(locale(), { dateStyle: "medium" });
/** "2 Dec 2026". */
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));

const shortDate = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });
/** "3 Nov". */
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));

const dayDate = new Intl.DateTimeFormat(locale(), {
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** "Sat, 1 Nov". */
export const formatDayDate = (iso: string) => dayDate.format(new Date(iso));

/** "5m ago", "3h ago", "2d ago"; a date after a week. */
/** `inline` for use mid-sentence ("Backed up just now"). */
export function formatAgo(iso: string, { inline = false } = {}) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t(inline ? "ago.nowInline" : "ago.now");
  if (minutes < 60) return t("ago.minutes", { count: minutes });
  if (minutes < 24 * 60) return t("ago.hours", { count: Math.floor(minutes / 60) });
  if (minutes < 7 * 24 * 60) return t("ago.days", { count: Math.floor(minutes / 1440) });
  return formatShortDate(iso);
}

/** "4 s", "1 min 12 s". */
export function formatDuration(from: string, to: string) {
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** The path a child page would have: the parent's path, then the slug. */
export const childPath = (parentPath: string, slug: string) =>
  `${parentPath === "/" ? "" : parentPath}/${slug}`;
