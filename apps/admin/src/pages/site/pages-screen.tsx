/**
 * Pages: with no page open, the index of every page. A collection opens on its own
 * screen (its entries, then its settings); a page or an entry opens in the editor,
 * where its settings, history and analytics are in the page drawer.
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
import { PageDetail } from "./detail";
import { PagesIndex } from "./pages-index";
import type { DetailSearch } from "./search";
import { useTrash } from "./trash-screen";

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
  const kind = pages.data?.find((p) => p.id === id)?.kind ?? entry.data?.kind;

  // A failed refetch keeps the screen; only a load with nothing to show is an error.
  if (pages.isError && !pages.data)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("pages.loadFailed")}</CalloutTitle>
          <CalloutContent>{t("common.tryAgain")}</CalloutContent>
          <CalloutAction>
            <Button variant="default-outline" size="small" onClick={() => void pages.refetch()}>
              {t("error.retry")}
            </Button>
          </CalloutAction>
        </Callout>
      </div>
    );

  // No page open: the index.
  if (!id)
    return pages.data ? (
      <PagesIndex pages={pages.data} />
    ) : (
      <div className="bg-bg-gray-50 h-full">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-6 pt-12">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-12 w-full max-w-2xl rounded-full" />
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      </div>
    );

  return (
    <div className="bg-bg-gray-50 h-full overflow-y-auto">
      {!pages.data || (!exists && entry.isPending) ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-6">
          <Skeleton className="h-5 w-56 rounded-full" />
          <Skeleton className="h-12 w-80 rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : showDetail && kind !== "listing" ? (
        // A page's details live in the editor's drawer now: an old link lands there, on its tab.
        <Navigate to="/pages/$id/edit" params={{ id }} search={drawerFor(search)} replace />
      ) : showDetail ? (
        <PageDetail key={id} id={id} pages={pages.data} search={search} />
      ) : (
        <Missing id={id} />
      )}
    </div>
  );
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
  if (search.tab === "details") return { panel: "details" };
  if (search.tab === "settings")
    return { panel: "settings", ...(search.section && { section: search.section }) };
  if (search.tab === "history" || search.tab === "analytics") return { panel: search.tab };
  return {};
}
