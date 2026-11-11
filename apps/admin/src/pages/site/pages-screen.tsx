/**
 * Pages: with no page open, the index of every page. Any page opens in the editor,
 * where its settings, history and analytics (and a collection's entries) are in the
 * page drawer; `/pages/$id`, the old page screen, leads there.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearch } from "@tanstack/react-router";
import type { PanelSearch } from "@/editor/page-drawer";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { pagesApi } from "@/lib/api";
import { formatAgo, usePages } from "@/lib/pages";
import { PagesIndex } from "./pages-index";
import type { DetailSearch } from "./search";
import { useTrash } from "./trash-screen";
import { Screen } from "@/components/screen";

export function PagesScreen() {
  const { id } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as DetailSearch;
  const pages = usePages();

  const exists = pages.data?.some((p) => p.id === id);
  // An entry isn't in the page list; its screen still opens.
  const entry = useQuery({
    queryKey: ["page", id],
    queryFn: () => pagesApi.get(id ?? ""),
    enabled: Boolean(id) && Boolean(pages.data) && !exists,
    retry: false,
  });
  const showDetail = Boolean(id) && (exists || entry.data?.kind === "entry");

  // A failed refetch keeps the screen; only a load with nothing to show is an error.
  if (pages.isError && !pages.data)
    return (
      <Screen>
        <Callout variant="danger">
          <CalloutTitle>{t("pages.loadFailed")}</CalloutTitle>
          <CalloutContent>{t("common.tryAgain")}</CalloutContent>
          <CalloutAction>
            <Button variant="default-outline" size="small" onClick={() => void pages.refetch()}>
              {t("error.retry")}
            </Button>
          </CalloutAction>
        </Callout>
      </Screen>
    );

  // No page open: the index.
  if (!id)
    return pages.data ? (
      <PagesIndex pages={pages.data} />
    ) : (
      <Screen aria-busy>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-12 w-full max-w-2xl rounded-full" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </Screen>
    );

  if (!pages.data || (!exists && entry.isPending))
    return (
      <Screen aria-busy>
        <Skeleton className="h-5 w-56 rounded-full" />
        <Skeleton className="h-12 w-80 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </Screen>
    );
  // A page's details live in the editor's drawer now: an old link lands there, on its tab.
  if (showDetail)
    return <Navigate to="/pages/$id/edit" params={{ id }} search={drawerFor(search)} replace />;
  return <Missing id={id} />;
}

/** An address that isn't a page: deleted pages say so and lead to where they can come back from. */
function Missing({ id }: { id: string }) {
  const deleted = useTrash().data?.find((page) => page.id === id);
  if (!deleted)
    return (
      <EmptyState className="h-full">
        <EmptyStateTitle>{t("pages.missing")}</EmptyStateTitle>
        <EmptyStateDescription>{t("pages.missingBody")}</EmptyStateDescription>
        <EmptyStateActions>
          <Button variant="default-outline" render={<Link to="/pages" />}>
            {t("pages.back")}
          </Button>
        </EmptyStateActions>
      </EmptyState>
    );
  return (
    <EmptyState className="h-full">
      <EmptyStateTitle>
        {t("pages.deleted", { title: deleted.title || t("page.untitled") })}
      </EmptyStateTitle>
      <EmptyStateDescription>
        {t("pages.deletedBody", { time: formatAgo(deleted.deletedAt) })}
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button
          variant="default-outline"
          render={<Link to="/pages/trash/$id" params={{ id: deleted.id }} />}
        >
          {t("pages.deletedOpen")}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}

/** The drawer tab an old page-screen link meant; with none, just the editor. */
function drawerFor(search: DetailSearch): PanelSearch {
  if (search.tab === "entries") return { panel: "entries" };
  if (search.tab === "listing") return { panel: "settings", section: "collection" };
  if (search.tab === "details") return { panel: "details" };
  if (search.tab === "settings")
    return { panel: "settings", ...(search.section && { section: search.section }) };
  if (search.tab === "history" || search.tab === "analytics") return { panel: search.tab };
  return {};
}
