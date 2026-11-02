/**
 * The page tree: the Pages screen's navigation. Arrows or j/k move, o or
 * Enter opens the editor, n adds a child, f filters. Drag a row onto another
 * to re-parent it, or between rows to reorder; alt+arrows do the same.
 */
import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { MovePageBody, PageSummary } from "@fiscal-sb/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { PageKindIcon, PageRowMeta, PageStatusTag } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { PlusIcon } from "@/components/ui/icons/plus";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Menu, MenuContent, MenuLinkItem, MenuShortcut, MenuTrigger } from "@/components/ui/menu";
import { useShortcut, useShortcutScope } from "@/components/ui/shortcuts";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { type TreeItem, buildTree, bySiblingOrder, subtreeIds } from "@/lib/pages";
import { listingApi } from "@/lib/api";
import { useShell } from "@/shell/context";
import { useTreeMove } from "./move";
import { useTrash } from "./trash-screen";

const SCOPE = "page-tree";

type Where = "before" | "inside" | "after";
type Drop = { overId: string; where: Where };

/** How far each level steps in, in px. */
const INDENT = 16;

/** Rows in display order: collapsed branches hidden, or matches and their ancestors while filtering. */
function visibleRows(roots: TreeItem[], collapsed: Set<string>, filter: string): TreeItem[] {
  const query = filter.trim().toLowerCase();
  const matches = (item: TreeItem): boolean =>
    item.title.toLowerCase().includes(query) ||
    item.path.toLowerCase().includes(query) ||
    item.children.some(matches);
  const out: TreeItem[] = [];
  const walk = (items: TreeItem[]) => {
    for (const item of items) {
      if (query && !matches(item)) continue;
      out.push(item);
      // Home doesn't fold: its pages are the site's first level.
      if (query || !item.parentId || !collapsed.has(item.id)) walk(item.children);
    }
  };
  walk(roots);
  return out;
}

const siblingsOf = (pages: PageSummary[], parentId: string | null, except?: string) =>
  pages.filter((p) => p.parentId === parentId && p.id !== except).toSorted(bySiblingOrder);

/** Where a drop puts the dragged page; null when it can't go there. */
function dropToMove(pages: PageSummary[], activeId: string, drop: Drop): MovePageBody | null {
  if (subtreeIds(pages, activeId).has(drop.overId)) return null;
  const over = pages.find((p) => p.id === drop.overId);
  if (!over) return null;
  // Everything sits under the home page, so dropping beside it means inside it.
  if (drop.where === "inside" || over.parentId === null) return { parentId: over.id };
  const index = siblingsOf(pages, over.parentId, activeId).findIndex((s) => s.id === over.id);
  return { parentId: over.parentId, position: drop.where === "before" ? index : index + 1 };
}

/** alt+arrows: reorder among siblings, outdent to the grandparent, indent under the previous sibling. */
function keyMove(pages: PageSummary[], page: PageSummary, key: string): MovePageBody | null {
  if (!page.parentId) return null;
  const siblings = siblingsOf(pages, page.parentId);
  const index = siblings.findIndex((s) => s.id === page.id);
  if (key === "ArrowUp") return index > 0 ? { position: index - 1 } : null;
  if (key === "ArrowDown") return index < siblings.length - 1 ? { position: index + 1 } : null;
  if (key === "ArrowLeft") {
    const parent = pages.find((p) => p.id === page.parentId);
    if (!parent?.parentId) return null;
    const at = siblingsOf(pages, parent.parentId).findIndex((s) => s.id === parent.id);
    return { parentId: parent.parentId, position: at + 1 };
  }
  if (key === "ArrowRight") {
    const previous = siblings[index - 1];
    return previous ? { parentId: previous.id } : null;
  }
  return null;
}

function Row({
  item,
  pages,
  selected,
  tabbable,
  collapsed,
  drop,
  rowRef,
  onSelect,
  onOpen,
  onToggle,
  onKeyDown,
}: {
  item: TreeItem;
  pages: PageSummary[];
  selected: boolean;
  /** The one row Tab reaches: the selected row, or the first one when none is. */
  tabbable: boolean;
  collapsed: boolean;
  drop: Where | null;
  rowRef: (element: HTMLDivElement | null) => void;
  onSelect: () => void;
  onOpen: () => void;
  onToggle: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const home = item.parentId === null;
  const drag = useDraggable({ id: item.id, disabled: home });
  const target = useDroppable({ id: item.id });
  // Home is a row of its own; its pages are drawn as the first level.
  const hasChildren = !home && item.children.length > 0;
  const level = Math.max(0, item.depth - 1);
  return (
    <div
      ref={(element) => {
        drag.setNodeRef(element);
        target.setNodeRef(element);
        rowRef(element);
      }}
      {...drag.attributes}
      {...drag.listeners}
      // useDraggable makes the row a button; it's a tree item.
      role="treeitem"
      aria-roledescription={undefined}
      aria-describedby={undefined}
      // Home and its pages read as the first level, as they're drawn.
      aria-level={level + 1}
      aria-expanded={hasChildren ? !collapsed : undefined}
      title={item.path}
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onDoubleClick={onOpen}
      className={clx(
        "focus-ring-inset relative flex h-9 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-2 select-none",
        "hover:bg-bg-washed aria-selected:bg-bg-primary-50",
        drag.isDragging && "opacity-50",
        drop === "inside" && "bg-bg-primary-50 outline-otl-primary-200 outline-2 -outline-offset-2",
      )}
      style={{ paddingLeft: `${level * INDENT + 4}px` }}
    >
      {/* A guide for each level above, down the middle of its chevron: the structure at a glance. */}
      {Array.from({ length: level }, (_, above) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- a level is its index
          key={above}
          aria-hidden
          className="bg-otl-gray-200 absolute inset-y-0 w-px"
          style={{ left: `${above * INDENT + 15}px` }}
        />
      ))}
      {drop === "before" && (
        <span aria-hidden className="bg-bg-primary-600 absolute inset-x-0 top-0 h-0.5" />
      )}
      {drop === "after" && (
        <span aria-hidden className="bg-bg-primary-600 absolute inset-x-0 bottom-0 h-0.5" />
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={clx(
          "text-txt-black-500 flex size-6 shrink-0 items-center justify-center rounded-xs",
          !hasChildren && "invisible",
        )}
      >
        <ChevronRightIcon
          className={clx("size-4 transition-transform", !collapsed && "rotate-90")}
        />
      </button>
      <PageKindIcon
        page={item}
        aria-hidden
        className={clx("size-4 shrink-0", selected ? "text-txt-primary" : "text-txt-black-500")}
      />
      {/* The status sits with the title it describes, in words, and only when the page
          isn't simply live: a plain row is a live page. The address is in the tooltip. */}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={clx(
            "text-body-sm truncate font-medium",
            selected ? "text-txt-primary" : "text-txt-black-900",
          )}
        >
          {item.title || t("page.untitled")}
        </span>
        {item.status === "published" ? (
          <span className="sr-only">{t("page.status.published")}</span>
        ) : (
          <span className="flex shrink-0">
            <PageStatusTag status={item.status} />
          </span>
        )}
      </span>
      <PageRowMeta page={item} pages={pages} />
    </div>
  );
}

/**
 * Entries aren't in the tree, but they're what officers edit most: while the
 * filter has text, entries are searched too, and the matches are listed under
 * the tree with the collection they're in.
 */
function EntryMatches({
  pages,
  filter,
  pagesMatch,
}: {
  pages: PageSummary[];
  filter: string;
  /** Whether any page in the tree matched, for saying when nothing did. */
  pagesMatch: boolean;
}) {
  const text = filter.trim();
  // Wait for a pause in typing before searching.
  const query = useDebounced(text);
  const result = useQuery({
    queryKey: ["entries", "search", { search: query, limit: 5 }],
    queryFn: () => listingApi.search({ search: query, limit: 5 }),
    enabled: query.length > 0,
    // Keep the last matches on screen while the next search runs.
    placeholderData: keepPreviousData,
  });
  if (!text) return null;
  const titles = new Map(pages.map((page) => [page.id, page.title]));
  const matches = (result.data ?? []).map((entry) => ({
    entry,
    collection: (entry.parentId && titles.get(entry.parentId)) || t("page.untitled"),
  }));
  // Say nothing matched only once the entries have answered for this text.
  const settled = query === text && !result.isFetching && !result.isPlaceholderData;
  if (matches.length === 0)
    return !pagesMatch && settled ? (
      <p className="text-body-sm text-txt-black-700 px-3 py-2">{t("tree.noMatches")}</p>
    ) : null;
  return (
    <section aria-labelledby="entry-matches" className="flex flex-col gap-1">
      <h3 id="entry-matches" className="text-label-compact text-txt-black-700 px-3 font-medium">
        {t("tree.entries")}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {matches.map(({ entry, collection }) => (
          <EntryMatch key={entry.id} entry={entry} collection={collection} />
        ))}
      </ul>
    </section>
  );
}

function EntryMatch({ entry, collection }: { entry: PageSummary; collection: string }) {
  return (
    <li>
      <Link
        to="/pages/$id"
        params={{ id: entry.id }}
        className="focus-ring hover:bg-bg-washed flex items-center gap-2 rounded-md px-3 py-1.5"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-sm text-txt-black-900 truncate font-medium">
            {entry.title || t("page.untitled")}
          </span>
          <span className="text-label-compact text-txt-black-700 truncate">
            {t("tree.entryIn", { collection })}
          </span>
        </span>
        {entry.status !== "published" && (
          <span className="flex shrink-0">
            <PageStatusTag status={entry.status} />
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * New page, with the tree's other way in beside it: a menu holding Recently deleted,
 * so getting a page back sits next to making one instead of a bin of its own.
 */
function NewPageButton({ onNew }: { onNew: () => void }) {
  const count = useTrash().data?.length ?? 0;
  return (
    <div className="flex items-center gap-px">
      <Button
        variant="primary-fill"
        size="small"
        title={t("tree.newChild")}
        className="rounded-r-none"
        onClick={onNew}
      >
        <PlusIcon /> {t("commands.newPage")}
      </Button>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="primary-fill"
              size="small"
              iconOnly
              className="rounded-l-none"
              aria-label={t("tree.moreActions")}
            />
          }
        >
          <ChevronDownIcon />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLinkItem render={<Link to="/pages/trash" />}>
            <TrashIcon className="size-4" />
            {t("trash.open")}
            {count > 0 && <MenuShortcut className="tabular-nums">{count}</MenuShortcut>}
          </MenuLinkItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

export function PageTree({
  pages,
  selectedId,
}: {
  pages: PageSummary[];
  selectedId: string | undefined;
}) {
  const navigate = useNavigate();
  const shell = useShell();
  const move = useTreeMove();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const focusNext = useRef(false);

  const roots = useMemo(() => buildTree(pages), [pages]);
  const visible = useMemo(() => visibleRows(roots, collapsed, filter), [roots, collapsed, filter]);
  const selectedIndex = visible.findIndex((r) => r.id === selectedId);
  const selected = visible[selectedIndex];
  // The tree's one Tab stop: the selected row, or the first when none is.
  const tabStop = (selected ?? visible[0])?.id;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const select = (id: string | undefined, focus = true) => {
    if (!id) return;
    focusNext.current = focus;
    void navigate({
      to: "/pages/$id",
      params: { id },
      search: (s) => (s.tab ? { tab: s.tab } : {}),
    });
  };
  const open = (id: string | undefined) => {
    if (id) void navigate({ to: "/pages/$id/edit", params: { id } });
  };
  const toggle = (id: string, expand?: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (expand ?? next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    if (focusNext.current && selectedId) rows.current.get(selectedId)?.focus();
    focusNext.current = false;
  }, [selectedId]);

  useShortcutScope(SCOPE);
  const step = (by: number) =>
    select(visible[Math.min(visible.length - 1, Math.max(0, selectedIndex + by))]?.id);
  useShortcut("j", () => step(1), { scope: SCOPE });
  useShortcut("k", () => step(-1), { scope: SCOPE });
  useShortcut("o", () => open(selectedId), { scope: SCOPE });
  useShortcut("n", () => shell.newPage(selectedId), { scope: SCOPE });
  useShortcut("f", () => filterRef.current?.focus(), { scope: SCOPE });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    if (event.altKey && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const body = keyMove(pages, selected, event.key);
      if (event.key === "ArrowRight" && body?.parentId) toggle(body.parentId, true);
      if (body) void move.request(selected, body);
      return;
    }
    // Home doesn't fold.
    const hasChildren = selected.parentId !== null && selected.children.length > 0;
    const isCollapsed = collapsed.has(selected.id);
    const handlers: Record<string, () => void> = {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Home: () => select(visible[0]?.id),
      End: () => select(visible.at(-1)?.id),
      Enter: () => open(selected.id),
      ArrowRight: () =>
        hasChildren && isCollapsed
          ? toggle(selected.id, true)
          : hasChildren && select(selected.children[0]?.id),
      ArrowLeft: () =>
        hasChildren && !isCollapsed
          ? toggle(selected.id, false)
          : select(selected.parentId ?? undefined),
    };
    const handler = handlers[event.key];
    if (handler && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      handler();
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    const over = event.over;
    const pointer = event.activatorEvent as PointerEvent;
    if (!over || over.id === event.active.id) return setDrop(null);
    const y = pointer.clientY + event.delta.y;
    const ratio = (y - over.rect.top) / over.rect.height;
    const where: Where = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
    const next = { overId: String(over.id), where };
    setDrop(dropToMove(pages, String(event.active.id), next) ? next : null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const page = pages.find((p) => p.id === event.active.id);
    const body = page && drop && dropToMove(pages, page.id, drop);
    setDrop(null);
    setDragging(null);
    if (page && body) {
      if (body.parentId && body.position === undefined) toggle(body.parentId, true);
      void move.request(page, body);
    }
  };
  const draggingPage = pages.find((p) => p.id === dragging);

  return (
    <div className="flex h-full flex-col">
      <div className="border-otl-gray-200 flex flex-col gap-2.5 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-label-md text-txt-black-900 font-semibold">
            {t("nav.pages")}{" "}
            <span className="text-txt-black-500 font-normal tabular-nums">{pages.length}</span>
          </h2>
          <div className="flex items-center gap-1">
            <NewPageButton onNew={() => shell.newPage(selectedId)} />
          </div>
        </div>
        <Input
          ref={filterRef}
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilter("");
              rows.current.get(selectedId ?? "")?.focus();
            }
          }}
          placeholder={t("tree.filter")}
          aria-label={t("tree.filterLabel")}
          className="min-w-0"
          append={<Kbd combo="f" className="mr-2" />}
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setDragging(String(e.active.id))}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDrop(null);
          setDragging(null);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 py-2">
          <div
            role="tree"
            aria-label={t("tree.label")}
            tabIndex={-1}
            className="flex flex-col gap-px"
          >
            {visible.map((item) => (
              <Fragment key={item.id}>
                <Row
                  item={item}
                  pages={pages}
                  selected={item.id === selectedId}
                  tabbable={item.id === tabStop}
                  collapsed={!filter && collapsed.has(item.id)}
                  drop={drop?.overId === item.id ? drop.where : null}
                  rowRef={(element) => {
                    if (element) rows.current.set(item.id, element);
                    else rows.current.delete(item.id);
                  }}
                  onSelect={() => select(item.id, false)}
                  onKeyDown={onKeyDown}
                  onOpen={() => open(item.id)}
                  onToggle={() => toggle(item.id)}
                />
                {/* Home stands apart from the pages under it. */}
                {!item.parentId && item.children.length > 0 && (
                  <hr aria-hidden className="border-otl-gray-200 mx-2 my-1 border-t" />
                )}
              </Fragment>
            ))}
          </div>
          <EntryMatches pages={pages} filter={filter} pagesMatch={visible.length > 0} />
        </div>
        <DragOverlay>
          {draggingPage && (
            <div className="bg-bg-white text-body-sm shadow-card rounded-sm px-3 py-1.5 font-medium">
              {draggingPage.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <div className="border-otl-gray-200 flex flex-col gap-2 border-t px-3 py-2.5">
        <p className="text-label-compact text-txt-black-700 text-pretty">{t("tree.liveNote")}</p>
        {/* Keyboard and mouse help; it means nothing on a touch screen. */}
        <p className="text-label-compact text-txt-black-700 text-pretty pointer-coarse:hidden">
          {t("tree.hint")}
        </p>
      </div>
      {move.dialog}
    </div>
  );
}
