/** Pages: the tree on the left, the selected page's detail on the right. */
import type { PageSummary } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { card } from "@/components/card";
import { PageKindIcon, PageStatusTag } from "@/components/page-status";
import { Backlink } from "@/components/ui/backlink";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { t } from "@/i18n";
import { pagesApi } from "@/lib/api";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, usePages } from "@/lib/pages";
import { isNewPage, useWaiting } from "@/lib/publish";
import { useShell } from "@/shell/context";
import { PageDetail } from "./detail";
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
    ) : (
      <NoSelection pages={pages.data} />
    );

  if (!wide)
    return id ? (
      <div className="flex h-full flex-col">
        <div className="px-surface pt-3">
          <Backlink render={<Link to="/pages" />}>{t("pages.back")}</Backlink>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
      </div>
    ) : (
      tree
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

/**
 * Nothing selected: the pages and entries that aren't live yet, since those are the
 * ones an officer usually came to finish. It's the list the status bar counts, so the
 * two agree. With none, an invitation to pick or add a page.
 */
function NoSelection({ pages }: { pages: PageSummary[] }) {
  const shell = useShell();
  const notLive = useWaiting().items.filter((item) => item.kind === "page");
  if (notLive.length === 0)
    return (
      <EmptyState className="h-full">
        <EmptyStateTitle>{t("pages.choose")}</EmptyStateTitle>
        <EmptyStateDescription>{t("pages.chooseBody")}</EmptyStateDescription>
        <EmptyStateActions>
          <Button variant="default-outline" onClick={() => shell.newPage()}>
            {t("commands.newPage")}
          </Button>
        </EmptyStateActions>
      </EmptyState>
    );
  return (
    <section
      aria-labelledby="not-live-heading"
      className="p-surface text-body-sm flex max-w-2xl flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="not-live-heading" className="text-title font-semibold">
          {t("pages.notLive")}
        </h2>
        <p className="text-txt-black-700">{t("pages.notLiveBody")}</p>
      </div>
      {/* One framed list, each row its page's link: the same rows as the dashboard's recent edits. */}
      <ul
        className={clx(
          card,
          "border-otl-gray-200 divide-otl-gray-200 m-0 flex list-none flex-col divide-y p-0",
        )}
      >
        {notLive.map((item) => (
          <li key={item.id}>
            <Link
              to="/pages/$id"
              params={{ id: item.id }}
              className="focus-ring-inset hover:bg-bg-washed flex items-center gap-3 px-4 py-2.5 no-underline transition-colors duration-150 motion-reduce:transition-none"
            >
              {/* Entries aren't in the tree's list: they get the page icon. */}
              <PageKindIcon
                page={pages.find((page) => page.id === item.id) ?? { kind: "entry" }}
                aria-hidden
                className="text-txt-black-500 size-4 shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-txt-black-900 truncate font-medium">
                  {item.title || t("page.untitled")}
                </span>
                <span className="text-label-compact text-txt-black-500 truncate">{item.path}</span>
              </span>
              <span className="flex shrink-0">
                <PageStatusTag status={isNewPage(item) ? "draft" : "changed"} />
              </span>
              <ChevronRightIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
