/**
 * The media library: upload (or drop files anywhere), search, filter, grid
 * or list. "Needs alt text" and "Recently deleted" are views of their own;
 * the search, filters and open file live in the address.
 */
import type { Media, MediaKind } from "@fiscal-sb/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { type ColumnDef, DataTable } from "@/components/ui/data-table";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { GridIcon } from "@/components/ui/icons/grid";
import { ListIcon } from "@/components/ui/icons/list";
import { UploadIcon } from "@/components/ui/icons/upload";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { t } from "@/i18n";
import { mediaApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import { formatDateTime, useSummary } from "@/lib/pages";
import { useShell } from "@/shell/context";
import { formatBytes, typeName } from "./format";
import { MediaDrawer } from "./media-drawer";
import { MediaGrid, MediaTags, MediaThumb } from "./media-grid";
import { type MediaSearch, type MediaShow, mediaKinds } from "./search";

const PAGE_SIZE = 60;
const VIEW_KEY = "admin.media.view";

type View = "grid" | "list";
type KindFilter = "all" | MediaKind;
type ShowFilter = "all" | MediaShow;

const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export function useMediaList(query: {
  search: string;
  kind: KindFilter;
  show?: ShowFilter;
  page: number;
  pageSize: number;
}) {
  const search = useDebounced(query.search);
  return useQuery({
    queryKey: ["media", "list", { ...query, search }],
    queryFn: () =>
      mediaApi.list({
        search: search || undefined,
        kind: query.kind === "all" ? undefined : query.kind,
        unused: query.show === "unused" || undefined,
        needsAlt: query.show === "needsAlt" || undefined,
        deleted: query.show === "deleted" || undefined,
        page: query.page,
        pageSize: query.pageSize,
      }),
    placeholderData: keepPreviousData,
    // Thumbnails appear as variants finish.
    refetchInterval: (q) =>
      q.state.data?.items.some((m) => m.status === "processing") ? 1500 : false,
  });
}

function NameCell({ media, onOpen }: { media: Media; onOpen: (id: string) => void }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        data-media-id={media.id}
        onClick={() => onOpen(media.id)}
        className="focus-ring flex min-w-0 items-center gap-2 rounded-xs text-left"
      >
        <MediaThumb media={media} className="size-8 shrink-0 rounded-xs" />
        <span className="text-txt-primary truncate font-medium underline underline-offset-[3px]">
          {media.filename}
        </span>
      </button>
      {/* "Used on" has its own column here. */}
      <MediaTags media={media} hideUnused />
    </span>
  );
}

// No column sorts: a page of the list holds 60 files, and sorting only those would look like sorting them all.
function mediaColumns(onOpen: (id: string) => void, deleted: boolean): ColumnDef<Media>[] {
  return [
    {
      accessorKey: "filename",
      header: t("media.column.name"),
      cell: ({ row }) => <NameCell media={row.original} onOpen={onOpen} />,
    },
    {
      accessorKey: "type",
      header: t("media.column.type"),
      cell: ({ row }) => typeName(row.original.type),
    },
    {
      accessorKey: "size",
      header: t("media.column.size"),
      meta: { numeric: true },
      cell: ({ row }) => formatBytes(row.original.size),
    },
    {
      id: "dimensions",
      header: t("media.column.dimensions"),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.width ? `${row.original.width} × ${row.original.height}` : "–",
    },
    {
      accessorKey: "usedBy",
      header: t("media.column.usedOn"),
      cell: ({ row }) =>
        row.original.usedBy
          ? t("media.usedCount", { count: row.original.usedBy })
          : t("media.unusedTag"),
    },
    deleted
      ? {
          accessorKey: "deletedAt",
          header: t("media.column.deleted"),
          cell: ({ row }) => formatDateTime(row.original.deletedAt ?? row.original.updatedAt),
        }
      : {
          accessorKey: "createdAt",
          header: t("media.column.uploaded"),
          cell: ({ row }) => formatDateTime(row.original.createdAt),
        },
  ];
}

/** Square placeholders the shape of the grid (or rows of the list) while files load. */
function Loading({ view }: { view: View }) {
  return view === "grid" ? (
    <ul
      aria-hidden
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-0"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i} className="flex flex-col gap-1.5 p-1.5">
          <Skeleton className="aspect-square w-full rounded-sm" />
          <Skeleton className="h-3 w-3/4" />
        </li>
      ))}
    </ul>
  ) : (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** What the files in view are, and why they're here: the line above the grid. */
function viewSummary(show: ShowFilter, total: number, trashDays: number) {
  const count = t("media.count", { count: total });
  if (show === "needsAlt") return `${count}. ${t("media.view.needsAlt")}`;
  if (show === "unused") return `${count}. ${t("media.view.unused")}`;
  if (show === "deleted") return `${count}. ${t("media.deletedIntro", { days: trashDays })}`;
  return count;
}

/** What an empty view says, by what's being looked at; a search names the view it searched. */
function emptyCopy(show: ShowFilter, filtered: boolean, trashDays: number) {
  if (filtered)
    return show === "all"
      ? { title: t("media.none.filtered"), body: t("media.none.filteredBody") }
      : { title: t(`media.none.filtered.${show}`), body: t("media.none.filteredInView") };
  if (show === "needsAlt")
    return { title: t("media.none.needsAlt"), body: t("media.none.needsAltBody") };
  if (show === "unused") return { title: t("media.none.unused"), body: t("media.none.unusedBody") };
  if (show === "deleted")
    return {
      title: t("media.none.deleted"),
      body: t("media.none.deletedBody", { days: trashDays }),
    };
  return { title: t("media.none.title"), body: t("media.none.body") };
}

export function MediaScreen() {
  const shell = useShell();
  const summary = useSummary();
  const params = useSearch({ strict: false }) as MediaSearch;
  const navigate = useNavigate();
  const go = (next: MediaSearch, replace = true) =>
    void navigate({ to: "/media", search: next, replace });
  // Typing stays in the field; the address follows without a history entry per key.
  const [search, setSearch] = useState(params.q ?? "");
  useEffect(() => setSearch(params.q ?? ""), [params.q]);
  const kind: KindFilter = params.type ?? "all";
  const show: ShowFilter = params.show ?? "all";
  const page = params.page ?? 1;
  const open = params.file ?? null;
  const [view, setView] = useState<View>(savedView);
  const [dragging, setDragging] = useState(false);
  const media = useMediaList({ search, kind, show, page, pageSize: PAGE_SIZE });
  const total = media.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Search and type narrow a view; the Show choice is the view itself.
  const filtered = Boolean(search || kind !== "all");
  // Nothing in the library at all: the empty state leads, with the one Upload button.
  const libraryEmpty = summary.data?.media.count === 0 && show === "all";
  const setFilter = (patch: Partial<MediaSearch>) => {
    const { page: _page, file: _file, ...rest } = { ...params, q: search || undefined, ...patch };
    go(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
  };
  const openFile = (id: string | null) =>
    go(
      Object.fromEntries(
        Object.entries({ ...params, file: id ?? undefined }).filter(([, v]) => v !== undefined),
      ),
      false,
    );

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Just won't be remembered.
    }
  }, [view]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- openFile reads the address when called
  const columns = useMemo(() => mediaColumns(openFile, show === "deleted"), [show, params]);
  const empty = emptyCopy(show, filtered && !libraryEmpty, media.data?.trashDays ?? 30);
  const from = (page - 1) * PAGE_SIZE + 1;

  return (
    <div
      className={clx(
        "p-surface gap-stack-md relative flex min-h-full flex-col",
        dragging && "bg-bg-primary-50",
      )}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        shell.uploadMedia([...event.dataTransfer.files]);
      }}
    >
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.media")}</PageHeaderTitle>
          <PageHeaderDescription className="text-pretty">{t("media.intro")}</PageHeaderDescription>
        </PageHeaderContent>
        {!libraryEmpty && (
          <PageHeaderActions>
            <UploadButton onClick={() => shell.uploadMedia()} />
          </PageHeaderActions>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[show]}
          onValueChange={(v) =>
            v[0] && setFilter({ show: v[0] === "all" ? undefined : (v[0] as MediaShow) })
          }
          aria-label={t("media.show")}
        >
          <Toggle value="all">{t("media.show.all")}</Toggle>
          <Toggle value="needsAlt">
            {t("media.show.needsAlt")}
            {Boolean(media.data?.needsAlt) && <Count n={media.data?.needsAlt ?? 0} />}
          </Toggle>
          <Toggle value="unused">{t("media.show.unused")}</Toggle>
          <Toggle value="deleted">
            {t("media.show.deleted")}
            {Boolean(media.data?.deleted) && <Count n={media.data?.deleted ?? 0} />}
          </Toggle>
        </ToggleGroup>
        <span className="flex-1" />
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setFilter({ q: e.target.value || undefined });
          }}
          placeholder={t("media.search")}
          aria-label={t("media.search.label")}
          className="w-full sm:w-56"
        />
        <Select
          items={[
            { value: "all", label: t("media.filter.all") },
            ...mediaKinds.map((k) => ({
              value: k,
              label: t(k === "image" ? "media.filter.images" : "media.filter.documents"),
            })),
          ]}
          value={kind}
          aria-label={t("media.filter.kind")}
          className="w-40"
          onValueChange={(v: string) =>
            setFilter({ type: v && v !== "all" ? (v as MediaSearch["type"]) : undefined })
          }
        />
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => v[0] && setView(v[0] as View)}
          aria-label={t("media.view")}
        >
          <Toggle value="grid" aria-label={t("media.view.grid")}>
            <GridIcon />
          </Toggle>
          <Toggle value="list" aria-label={t("media.view.list")}>
            <ListIcon />
          </Toggle>
        </ToggleGroup>
      </div>

      {/* Read out when the files change, so a filter or search says what it found. */}
      <p aria-live="polite" className="text-body-sm text-txt-black-700 max-w-[70ch] text-pretty">
        {media.data && media.data.items.length > 0
          ? viewSummary(show, total, media.data.trashDays)
          : ""}
      </p>

      {media.isError ? (
        <Callout variant="danger">
          <CalloutTitle>{t("media.loadFailed")}</CalloutTitle>
          <CalloutContent>{t("media.loadFailedBody")}</CalloutContent>
          <CalloutAction>
            <Button variant="default-outline" onClick={() => void media.refetch()}>
              {t("media.retry")}
            </Button>
          </CalloutAction>
        </Callout>
      ) : !media.data ? (
        <Loading view={view} />
      ) : media.data.items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle as="h2">{empty.title}</EmptyStateTitle>
          <EmptyStateDescription>{empty.body}</EmptyStateDescription>
          {libraryEmpty ? (
            <EmptyStateActions>
              <UploadButton onClick={() => shell.uploadMedia()} />
            </EmptyStateActions>
          ) : (
            filtered && (
              <EmptyStateActions>
                {show !== "all" && (
                  <Button variant="default-outline" onClick={() => setFilter({ show: undefined })}>
                    {t("media.none.searchAll")}
                  </Button>
                )}
                <Button
                  variant="default-outline"
                  onClick={() => {
                    setSearch("");
                    setFilter({ q: undefined, type: undefined });
                  }}
                >
                  {t("media.none.clear")}
                </Button>
              </EmptyStateActions>
            )
          )}
        </EmptyState>
      ) : view === "grid" ? (
        <MediaGrid items={media.data.items} onChoose={(m) => openFile(m.id)} />
      ) : (
        <DataTable columns={columns} data={media.data.items} />
      )}

      {pages > 1 && (
        <nav aria-label={t("media.paging")} className="flex items-center justify-end gap-2">
          <span className="text-body-sm text-txt-black-700 tabular-nums">
            {t("media.range", {
              from,
              to: Math.min(from + PAGE_SIZE - 1, total),
              total,
            })}
          </span>
          <Button
            variant="default-outline"
            size="small"
            disabled={page === 1}
            onClick={() => go({ ...params, page: page - 1 }, false)}
          >
            {t("common.previous")}
          </Button>
          <Button
            variant="default-outline"
            size="small"
            disabled={page === pages}
            onClick={() => go({ ...params, page: page + 1 }, false)}
          >
            {t("common.next")}
          </Button>
        </nav>
      )}
      {dragging && (
        <p className="text-txt-primary text-title pointer-events-none absolute inset-x-0 top-1/2 text-center font-semibold">
          {t("media.dropHere")}
        </p>
      )}
      <MediaDrawer
        id={open}
        trashDays={media.data?.trashDays ?? 30}
        onClose={() => openFile(null)}
      />
    </div>
  );
}

/** The screen's one blue button. The shortcut is shown, and announced as a shortcut rather than read as part of the name. */
function UploadButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="primary-fill" aria-keyshortcuts="u" onClick={onClick}>
      <UploadIcon /> {t("media.upload")} <Kbd combo="u" inverse aria-hidden />
    </Button>
  );
}

/** A count beside a filter's name, read as "Needs alt text (3)". */
function Count({ n }: { n: number }) {
  return (
    <>
      <span aria-hidden className="text-txt-black-500 ml-1 tabular-nums">
        {n}
      </span>
      <span className="sr-only"> ({n})</span>
    </>
  );
}
