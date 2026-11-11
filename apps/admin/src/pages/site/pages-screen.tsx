/**
 * Pages: with no page open, the index of every page; with one open, the tree on
 * the left and the page's detail on the right.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { Backlink } from "@/components/ui/backlink";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { t } from "@/i18n";
import { pagesApi } from "@/lib/api";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { formatAgo, usePages } from "@/lib/pages";
import { PageDetail } from "./detail";
import { PagesIndex } from "./pages-index";
import type { DetailSearch } from "./search";
import { useTrash } from "./trash-screen";
import { PageTree } from "./tree";

export function PagesScreen() {
  const { id } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as DetailSearch;
  const pages = usePages();
  // On a narrow screen the two panes don't fit side by side: show one, with a way back.
  const wide = useMediaQuery("(min-width: 768px)");

  const exists = pages.data?.some((p) => p.id === id);
  // An entry isn't in the tree; its detail still opens, with its listing selected.
  const entry = useQuery({
    queryKey: ["page", id],
    queryFn: () => pagesApi.get(id ?? ""),
    enabled: Boolean(id) && Boolean(pages.data) && !exists,
    retry: false,
  });
  const selected = exists
    ? id
    : entry.data?.kind === "entry"
      ? (entry.data.parentId ?? undefined)
      : undefined;
  const showDetail = Boolean(id) && (exists || entry.data?.kind === "entry");

  // A failed refetch keeps the tree on screen; only a load with nothing to show is an error.
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

  const tree = pages.data ? (
    <PageTree pages={pages.data} selectedId={selected} />
  ) : (
    <div className="flex flex-col gap-2 p-3">
      <Skeleton className="h-6" />
      <Skeleton className="h-6" />
      <Skeleton className="h-6" />
    </div>
  );

  const detail =
    !pages.data || (id && !exists && entry.isPending) ? (
      <div className="p-surface flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    ) : id && showDetail ? (
      <PageDetail key={id} id={id} pages={pages.data} search={search} />
    ) : id ? (
      <Missing id={id} />
    ) : null;

  // No page open: the index, at any width.
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

  if (!wide)
    return (
      <div className="flex h-full flex-col">
        <div className="px-surface pt-3">
          <Backlink render={<Link to="/pages" />}>{t("pages.back")}</Backlink>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
      </div>
    );

  return (
    <SplitPane
      className="h-full"
      storageKey="admin.pages.split"
      defaultWidth={340}
      startLabel={t("tree.label")}
      endLabel={t("detail.label")}
      start={tree}
      end={detail}
    />
  );
}

/** An address that isn't a page: deleted pages say so and lead to where they can come back from. */
function Missing({ id }: { id: string }) {
  const deleted = useTrash().data?.find((page) => page.id === id);
  if (!deleted)
    return (
      <EmptyState className="h-full">
        <EmptyStateTitle>{t("pages.missing")}</EmptyStateTitle>
        <EmptyStateDescription>{t("pages.chooseBody")}</EmptyStateDescription>
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
