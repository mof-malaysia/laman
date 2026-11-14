/**
 * Recently deleted: the page tree's other mode. Deleted pages on the left,
 * the selected one's last draft on the right, restorable for 30 days.
 */
import type { DeletedPage } from "@laman/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState, EmptyStateDescription, EmptyStateTitle } from "@/components/ui/empty-state";
import { ArrowBackIcon } from "@/components/ui/icons/arrow-back";
import { UndoIcon } from "@/components/ui/icons/undo";
import { Link as TextLink } from "@/components/ui/link";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { t } from "@/i18n";
import { PageKindIcon } from "@/components/page-status";
import { apiError, historyApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, formatDateTime, useRefreshPages } from "@/lib/pages";

/** A deadline closer than this shows on the row. */
const WARN_DAYS = 7;

export const useTrash = () => useQuery({ queryKey: ["trash"], queryFn: historyApi.trash });

const daysLeft = (page: DeletedPage) =>
  Math.max(1, Math.ceil((Date.parse(page.purgeAt) - Date.now()) / 86_400_000));

/** Restores a deleted page and says so, with a link to it unless it opens anyway. */
export function useRestoreDeleted() {
  const refresh = useRefreshPages();
  const { toast } = useToast();
  return async (id: string, { link = true } = {}) => {
    try {
      const page = await historyApi.restoreDeleted(id);
      await refresh();
      toast({
        variant: "success",
        title: t("trash.restored", { title: page.title }),
        ...(link && {
          description: (
            <TextLink primary render={<Link to="/pages/$id/edit" params={{ id: page.id }} />}>
              {t("trash.openRestored")}
            </TextLink>
          ),
        }),
      });
      return page;
    } catch (caught) {
      toast({
        variant: "error",
        title: t("trash.failed"),
        description: (await apiError(caught))?.message,
      });
      return undefined;
    }
  };
}

/** Undo in the toast that says a page was deleted: restores it and goes back to it. */
export function UndoDelete({ id }: { id: string }) {
  const restore = useRestoreDeleted();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  // Once undone there's nothing left to undo.
  if (state === "done") return null;
  return (
    <TextLink
      primary
      render={<button type="button" disabled={state === "busy"} aria-label={t("trash.undo")} />}
      onClick={async () => {
        setState("busy");
        const page = await restore(id, { link: false });
        setState(page ? "done" : "idle");
        if (page) await navigate({ to: "/pages/$id", params: { id: page.id } });
      }}
    >
      {t("trash.undo")}
    </TextLink>
  );
}

export function TrashScreen() {
  const { id } = useParams({ strict: false });
  const trash = useTrash();
  const selected = trash.data?.find((page) => page.id === id);

  return (
    <SplitPane
      className="h-full"
      storageKey="admin.pages.split"
      defaultWidth={340}
      startLabel={t("trash.label")}
      endLabel={t("detail.label")}
      start={<TrashList pages={trash.data} selectedId={id} />}
      end={
        selected ? (
          <DeletedDetail key={selected.id} page={selected} next={nextAfter(trash.data, selected)} />
        ) : (
          trash.data && (
            <EmptyState className="h-full">
              <EmptyStateTitle>
                {trash.data.length === 0
                  ? t("trash.empty")
                  : id
                    ? t("trash.missing")
                    : t("trash.choose")}
              </EmptyStateTitle>
              <EmptyStateDescription>
                {trash.data.length === 0 ? t("trash.emptyBody") : t("trash.chooseBody")}
              </EmptyStateDescription>
            </EmptyState>
          )
        )
      }
    />
  );
}

/** The row to select once `page` is restored: the one below it, or above at the end. */
function nextAfter(pages: DeletedPage[] | undefined, page: DeletedPage) {
  if (!pages) return undefined;
  const index = pages.indexOf(page);
  return pages[index + 1] ?? pages[index - 1];
}

function TrashList({
  pages,
  selectedId,
}: {
  pages: DeletedPage[] | undefined;
  selectedId: string | undefined;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-otl-gray-200 flex flex-col gap-1 border-b p-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="default-ghost"
            size="small"
            iconOnly
            className="-ml-1.5"
            aria-label={t("trash.back")}
            title={t("trash.back")}
            render={<Link to="/pages" />}
          >
            <ArrowBackIcon />
          </Button>
          <h2 className="text-label-md text-txt-black-900 font-semibold">
            {t("trash.title")}{" "}
            {pages && (
              <span className="text-txt-black-500 font-normal tabular-nums">{pages.length}</span>
            )}
          </h2>
        </div>
        <p className="text-label-compact text-txt-black-500">{t("trash.kept")}</p>
      </div>
      <ul
        aria-label={t("trash.label")}
        className="m-0 flex min-h-0 flex-1 list-none flex-col gap-px overflow-y-auto px-1.5 py-2"
      >
        {!pages &&
          [1, 2, 3].map((n) => (
            <li key={n} className="px-2 py-1">
              <Skeleton className="h-6" />
            </li>
          ))}
        {pages?.map((page) => (
          <TrashRow key={page.id} page={page} selected={page.id === selectedId} />
        ))}
      </ul>
    </div>
  );
}

function TrashRow({ page, selected }: { page: DeletedPage; selected: boolean }) {
  const left = daysLeft(page);
  return (
    <li>
      <Link
        to="/pages/trash/$id"
        params={{ id: page.id }}
        title={page.path}
        aria-current={selected ? "page" : undefined}
        className={clx(
          "focus-ring-inset text-body-sm flex h-9 items-center gap-1.5 rounded-md px-2",
          "hover:bg-bg-washed aria-[current=page]:bg-bg-primary-50",
        )}
      >
        <PageKindIcon page={page} aria-hidden className="text-txt-black-500 size-4 shrink-0" />
        <span
          className={clx("text-txt-black-900 min-w-0 flex-1 truncate", selected && "font-medium")}
        >
          {page.title || t("page.untitled")}
        </span>
        {page.children > 0 && (
          <span
            className="text-label-compact text-txt-black-500 tabular-nums"
            title={t("trash.children", { count: page.children })}
          >
            {t("trash.more", { count: page.children })}
          </span>
        )}
        {left <= WARN_DAYS ? (
          <span className="text-label-compact text-txt-warning shrink-0">
            {t("trash.daysLeft", { count: left })}
          </span>
        ) : (
          <time
            dateTime={page.deletedAt}
            title={formatDateTime(page.deletedAt)}
            className="text-label-compact text-txt-black-500 shrink-0 tabular-nums"
          >
            {formatAgo(page.deletedAt)}
          </time>
        )}
      </Link>
    </li>
  );
}

function DeletedDetail({ page, next }: { page: DeletedPage; next: DeletedPage | undefined }) {
  const restore = useRestoreDeleted();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const title = page.title || t("page.untitled");

  const onRestore = async () => {
    setBusy(true);
    const restored = await restore(page.id);
    setBusy(false);
    if (restored)
      await navigate(
        next ? { to: "/pages/trash/$id", params: { id: next.id } } : { to: "/pages/trash" },
      );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-surface border-otl-gray-200 flex flex-wrap items-center gap-x-6 gap-y-3 border-b py-4">
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
          <h1 className="text-title text-txt-black-900 truncate font-semibold">{title}</h1>
          {/* A dot goes between the facts, however many there are. */}
          <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-x-2 gap-y-1 [&>*+*]:before:text-txt-black-500 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
            <span>{t("trash.deletedAt", { time: formatDateTime(page.deletedAt) })}</span>
            <span>{t("trash.wasAt", { path: page.path })}</span>
            {page.children > 0 && <span>{t("trash.children", { count: page.children })}</span>}
          </p>
        </div>
        <Button
          variant="primary-fill"
          disabled={busy}
          aria-label={t("trash.restoreTitle", { title })}
          onClick={() => void onRestore()}
        >
          <UndoIcon /> {t("trash.restore")}
        </Button>
      </header>
      <div className="bg-bg-washed px-surface flex min-h-0 flex-1 flex-col py-5">
        <PageFrame
          src={`/render/trash/${page.id}`}
          path={page.path}
          title={t("trash.preview", { title })}
          className="flex-1"
        />
      </div>
    </div>
  );
}
