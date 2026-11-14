/**
 * The Pages index, /pages with no page open: a search to reach any page, then
 * what isn't live yet, what was edited lately, and every page in a card per
 * section of the site. A row's main click opens the editor; everything else
 * a page can do is in its More menu.
 */
import type { PageSummary } from "@laman/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useShortcut } from "@/components/ui/shortcuts";
import { t } from "@/i18n";
import { listingApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import { type TreeItem, buildTree, formatAgo, previewHref, useSummary } from "@/lib/pages";
import { useWaiting } from "@/lib/publish";
import { useDebounced } from "@/lib/use-debounced";
import { useShell } from "@/shell/context";
import {
  CheckGlyph,
  ChevronGlyph,
  DotsGlyph,
  EyeGlyph,
  KindGlyph,
  PenGlyph,
  PlusGlyph,
  ReturnGlyph,
  SearchGlyph,
  SlidersGlyph,
  TrashGlyph,
  UploadGlyph,
} from "./line-icons";
import { StateDot, StateLabel as SharedStateLabel } from "./page-state";
import { useTrash } from "./trash-screen";

/** Waiting tiles shown before "Show all". */
const CAP = 4;

type State = "draft" | "changed" | "scheduled";
/** What a row needs to be opened, previewed and named. */
type Target = Pick<PageSummary, "id" | "title" | "kind" | "parentId">;

const titleOf = (page: { title: string }) => page.title || t("page.untitled");
const stateOf = (page: Pick<PageSummary, "status">): State | null =>
  page.status === "published" ? null : page.status;

const flatten = (items: TreeItem[]): TreeItem[] =>
  items.flatMap((item) => [item, ...flatten(item.children)]);

/** Ancestors' titles below Home: where a page sits on the site. */
function trailOf(id: string, byId: Map<string, PageSummary>) {
  const out: string[] = [];
  let parent = byId.get(byId.get(id)?.parentId ?? "");
  while (parent?.parentId) {
    out.unshift(titleOf(parent));
    parent = byId.get(parent.parentId);
  }
  return out;
}

/** Pages whose title or address holds the query: title starts first, then contains, then address. */
function findPages(pages: PageSummary[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rankOf = (p: PageSummary) => {
    const title = p.title.toLowerCase();
    return title.startsWith(q) ? 0 : title.includes(q) ? 1 : p.path.includes(q) ? 2 : 3;
  };
  return pages
    .map((page) => ({ page, rank: rankOf(page) }))
    .filter(({ rank }) => rank < 3)
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ page }) => page)
    .slice(0, 10);
}

export function PagesIndex({ pages }: { pages: PageSummary[] }) {
  const shell = useShell();
  const navigate = useNavigate();
  const waitingItems = useWaiting().items;
  const recentEdits = useSummary().data?.recentEdits ?? [];
  const trashed = useTrash().data?.length ?? 0;
  const [query, setQuery] = useState("");
  const [allWaiting, setAllWaiting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useShortcut("/", () => input.current?.focus());

  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const site = useMemo(() => {
    const home = buildTree(pages)[0];
    const top = home?.children ?? [];
    return {
      home,
      // A first-level page with pages under it, or a collection, is a card of its own;
      // the single pages share one.
      sections: top.filter((p) => p.children.length > 0 || p.kind === "listing"),
      singles: top.filter((p) => p.children.length === 0 && p.kind !== "listing"),
    };
  }, [pages]);

  const searching = query.trim().length > 0;
  const pageMatches = findPages(pages, query);
  const entries = useEntryMatches(query);
  const first = pageMatches[0] ?? entries.matches[0];
  const open = (id: string) => void navigate({ to: "/pages/$id/edit", params: { id } });

  // Pages and entries, as the status bar counts them, newest first.
  const waiting = waitingItems
    .flatMap((item) => (item.kind === "page" ? [item] : []))
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shownWaiting = allWaiting ? waiting : waiting.slice(0, CAP);

  return (
    <Screen>
      <div className="gap-stack-md flex flex-col">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle size="headline">{t("pages.index.title")}</PageHeaderTitle>
            <PageHeaderDescription>
              {t("pages.index.intro", { count: pages.length })}
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        <div className="flex w-full max-w-2xl items-center gap-2">
          <label className="bg-bg-white border-otl-gray-200 focus-within:border-otl-primary-300 focus-within:ring-bg-primary-100 shadow-card flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border pr-2 pl-5 transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-4">
            <SearchGlyph className="text-txt-black-500 size-5 shrink-0" />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
                if (e.key === "Enter" && first) open(first.id);
              }}
              placeholder={t("pages.index.search")}
              aria-label={t("pages.index.searchLabel")}
              className="text-body-md text-txt-black-900 placeholder:text-txt-black-500 min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd className="text-label-compact text-txt-black-500 bg-bg-washed shrink-0 rounded-full px-2.5 py-1 font-sans">
              {searching ? t("pages.index.enter") : "/"}
            </kbd>
          </label>
          <Button variant="primary-fill" size="large" onClick={() => shell.newPage()}>
            <PlusGlyph className="size-5" /> {t("commands.newPage")}
          </Button>
        </div>
      </div>

      {searching ? (
        <section
          aria-label={t("pages.index.results")}
          className={clx(card, "border-otl-gray-200 w-full max-w-2xl rounded-2xl p-2")}
        >
          {pageMatches.map((page) => (
            <ResultRow
              key={page.id}
              page={page}
              first={page === first}
              sub={[...trailOf(page.id, byId), page.path].join(" · ")}
            />
          ))}
          {entries.matches.length > 0 && (
            <>
              <h2 className="text-label-compact text-txt-black-500 px-3 pt-3 pb-1 font-medium">
                {t("tree.entries")}
              </h2>
              {entries.matches.map((entry) => (
                <ResultRow
                  key={entry.id}
                  page={entry}
                  first={entry === first}
                  sub={t("tree.entryIn", {
                    collection: titleOf(byId.get(entry.parentId ?? "") ?? { title: "" }),
                  })}
                />
              ))}
            </>
          )}
          {pageMatches.length === 0 && entries.matches.length === 0 && entries.settled && (
            <p className="text-body-md text-txt-black-700 px-3 py-6 text-center">
              {t("pages.index.noMatch", { query: query.trim() })}
            </p>
          )}
        </section>
      ) : (
        <>
          {waiting.length > 0 ? (
            <section
              aria-labelledby="waiting-heading"
              className="bg-bg-washed flex flex-col gap-2 rounded-3xl p-2"
            >
              <div className="flex items-center justify-between gap-3 py-1.5 pr-1 pl-4">
                <div className="flex flex-col">
                  <h2
                    id="waiting-heading"
                    className="text-body-md text-txt-black-900 font-semibold"
                  >
                    {t("pages.index.waiting")}
                  </h2>
                  <p className="text-body-sm text-txt-black-700">
                    {t("pages.index.waitingBody", { count: waiting.length })}
                  </p>
                </div>
                <Button
                  variant="default-outline"
                  // Sheet on the tray's Well, so it still reads as a button.
                  className="bg-bg-white hover:bg-bg-gray-50"
                  render={<Link to="/publishing" />}
                >
                  <UploadGlyph className="size-[18px]" /> {t("pages.index.publish")}
                </Button>
              </div>
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
                {shownWaiting.map((item) => {
                  const page = byId.get(item.id);
                  const target = {
                    id: item.id,
                    title: item.title,
                    kind: page?.kind ?? "entry",
                    parentId: page?.parentId ?? "",
                  };
                  return (
                    <li
                      key={item.id}
                      className={clx(
                        card,
                        "group/row relative flex items-center gap-3.5 rounded-2xl border-transparent p-3.5",
                      )}
                    >
                      <Bubble page={target} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <EditLink id={item.id} className="text-body-md font-medium">
                          {titleOf(item)}
                        </EditLink>
                        <StateLine
                          state={item.new ? "draft" : "changed"}
                          updatedAt={item.updatedAt}
                          editedBy={item.editedBy}
                        />
                      </span>
                      <span className="relative z-10 flex items-center gap-1">
                        <Button
                          variant="default-outline"
                          size="small"
                          render={
                            // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- the Button fills it with its label
                            <a href={previewHref(item.id)} target="_blank" rel="noopener" />
                          }
                        >
                          {t("pages.index.preview")}
                        </Button>
                        <RowMenu page={target} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {waiting.length > CAP && (
                <Button
                  variant="default-ghost"
                  size="small"
                  aria-expanded={allWaiting}
                  onClick={() => setAllWaiting((all) => !all)}
                  className="self-center"
                >
                  {allWaiting
                    ? t("pages.index.showFewer")
                    : t("pages.index.showAll", { count: waiting.length })}
                  <ChevronGlyph
                    className={clx(
                      "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
                      allWaiting ? "-rotate-90" : "rotate-90",
                    )}
                  />
                </Button>
              )}
            </section>
          ) : (
            <p className="bg-bg-success-50 text-txt-success text-body-md flex items-center justify-center gap-2 rounded-3xl py-5">
              <CheckGlyph className="size-5" /> {t("pages.index.caughtUp")}
            </p>
          )}

          {recentEdits.length > 0 && (
            <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
              <h2
                id="recent-heading"
                className="text-body-md text-txt-black-900 px-1 font-semibold"
              >
                {t("pages.index.recent")}
              </h2>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
                {recentEdits.slice(0, 4).map((page) => (
                  <li key={page.id}>
                    <Link
                      to="/pages/$id/edit"
                      params={{ id: page.id }}
                      className={clx(
                        card,
                        "border-otl-gray-200 hover:border-otl-gray-300 focus-ring flex h-full flex-col items-start gap-4 rounded-2xl p-4 no-underline transition-[border-color] duration-150 ease-out",
                      )}
                    >
                      <Bubble page={page} />
                      <span className="flex w-full min-w-0 flex-col gap-0.5">
                        <span className="text-label-compact text-txt-black-500 truncate">
                          {page.parentId === null
                            ? t("pages.index.home")
                            : (trailOf(page.id, byId).at(-1) ?? page.path)}
                        </span>
                        <span className="text-body-md text-txt-black-900 truncate font-medium">
                          {titleOf(page)}
                        </span>
                        <StateLine
                          state={stateOf(page)}
                          updatedAt={page.updatedAt}
                          editedBy={page.editedBy}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="all-heading" className="flex flex-col gap-3">
            <h2 id="all-heading" className="text-body-md text-txt-black-900 px-1 font-semibold">
              {t("pages.index.all")}
              <span className="text-txt-black-500 ml-2 font-normal tabular-nums">
                {pages.length}
              </span>
            </h2>
            <div className="columns-1 gap-3 md:columns-2 xl:columns-3 [&>*]:mb-3">
              {site.sections.map((section) => (
                <SectionCard key={section.id} section={section} />
              ))}
              {(site.home || site.singles.length > 0) && (
                <PageCard title={t("pages.index.more")}>
                  {[...(site.home ? [site.home] : []), ...site.singles].map((page) => (
                    <Line key={page.id} page={page} />
                  ))}
                </PageCard>
              )}
              <Link
                to="/pages/trash"
                className="border-otl-gray-300 text-body-sm text-txt-black-700 hover:text-txt-black-900 hover:bg-bg-washed focus-ring flex w-full break-inside-avoid items-center gap-2.5 rounded-2xl border border-dashed px-4 py-3.5 no-underline transition-colors duration-150 ease-out"
              >
                <TrashGlyph className="size-[18px]" />
                {t("pages.index.trash")}
                <span className="text-txt-black-500 ml-auto tabular-nums">{trashed}</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </Screen>
  );
}

/**
 * Entries aren't in the page list, but they're what officers edit most: while
 * there's text, entries are searched too, after a pause in typing.
 */
function useEntryMatches(text: string) {
  const query = useDebounced(text.trim());
  const result = useQuery({
    queryKey: ["entries", "search", { search: query, limit: 5 }],
    queryFn: () => listingApi.search({ search: query, limit: 5 }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
  return {
    matches: text.trim() ? (result.data ?? []) : [],
    // Say nothing matched only once the entries have answered for this text.
    settled: query === text.trim() && !result.isFetching && !result.isPlaceholderData,
  };
}

/** A link to the editor whose hit area is the whole row (the row is `relative`). */
export function EditLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/pages/$id/edit"
      params={{ id }}
      className={clx(
        "text-txt-black-900 focus-ring truncate rounded-xs no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-['']",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** The state as a dot and a word; nothing for a live page, which is the usual case. */
function StateLabel({ state }: { state: State | null }) {
  return state ? <SharedStateLabel state={state} /> : null;
}

/** State, then when and who: "Draft · 25m ago · farid.h". */
function StateLine({
  state,
  updatedAt,
  editedBy,
}: {
  state: State | null;
  updatedAt: string;
  editedBy: string | null;
}) {
  return (
    <span className="text-body-sm text-txt-black-500 flex min-w-0 items-center gap-1.5">
      {state && <StateDot state={state} />}
      <span className="truncate">
        {[state && t(`pages.index.state.${state}`), formatAgo(updatedAt), editedBy]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

/** The page's glyph in a soft round square. */
function Bubble({ page }: { page: Pick<Target, "kind" | "parentId"> }) {
  return (
    <span className="bg-bg-washed text-txt-black-700 flex size-10 shrink-0 items-center justify-center rounded-xl">
      <KindGlyph page={page} className="size-5" />
    </span>
  );
}

/** Everything a row can do besides its main click, which edits. */
function RowMenu({ page }: { page: Target }) {
  const navigate = useNavigate();
  const shell = useShell();
  const title = titleOf(page);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="default-ghost"
            size="small"
            iconOnly
            aria-label={t("pages.index.moreFor", { title })}
            className="relative z-10"
          />
        }
      >
        <DotsGlyph className="size-[18px]" />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onClick={() => void navigate({ to: "/pages/$id/edit", params: { id: page.id } })}>
          <PenGlyph className="size-4" /> {t("pages.index.edit")}
        </MenuItem>
        <MenuItem onClick={() => window.open(previewHref(page.id), "_blank", "noopener")}>
          <EyeGlyph className="size-4" /> {t("pages.index.preview")}
        </MenuItem>
        <MenuItem
          onClick={() =>
            void navigate({
              to: "/pages/$id/edit",
              params: { id: page.id },
              search: { panel: "settings" },
            })
          }
        >
          <SlidersGlyph className="size-4" /> {t("pages.index.settings")}
        </MenuItem>
        {page.kind === "page" && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => shell.newPage(page.id)}>
              <PlusGlyph className="size-4" /> {t("pages.index.newInside")}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/** Shown on hover or focus within its row, and while its menu is open. */
function HoverMenu({ page }: { page: Target }) {
  return (
    <span className="opacity-0 transition-opacity duration-150 ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100">
      <RowMenu page={page} />
    </span>
  );
}

/** A search result: bubble, title over where it sits, state; Enter opens the first. */
function ResultRow({ page, sub, first }: { page: PageSummary; sub: string; first: boolean }) {
  return (
    <div
      className={clx(
        "group/row hover:bg-bg-gray-50 relative flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-150 ease-out",
        first && "bg-bg-gray-50",
      )}
    >
      <Bubble page={page} />
      <span className="flex min-w-0 flex-1 flex-col">
        <EditLink id={page.id} className="text-body-sm font-medium">
          {titleOf(page)}
        </EditLink>
        <span className="text-body-sm text-txt-black-500 truncate">{sub}</span>
      </span>
      <StateLabel state={stateOf(page)} />
      {first && (
        <ReturnGlyph
          aria-label={t("pages.index.enter")}
          className="text-txt-black-400 size-[18px]"
        />
      )}
      <HoverMenu page={page} />
    </div>
  );
}

function PageCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section
      className={clx(
        card,
        "border-otl-gray-200 flex break-inside-avoid flex-col rounded-2xl p-1.5",
      )}
    >
      {typeof title === "string" ? (
        <h3 className="text-body-md text-txt-black-900 px-2.5 pt-2 pb-1 font-semibold">{title}</h3>
      ) : (
        title
      )}
      {children}
    </section>
  );
}

/** A section of the site: its page as the heading, its pages below; a collection, its entries. */
function SectionCard({ section }: { section: TreeItem }) {
  const shell = useShell();
  const collection = section.kind === "listing";
  const rows = flatten(section.children);
  const title = titleOf(section);
  return (
    <PageCard
      title={
        <header className="group/row relative flex items-center gap-2 py-1 pr-1 pl-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-2 py-1">
            <EditLink id={section.id} className="text-body-md font-semibold hover:underline">
              {title}
            </EditLink>
            {!collection && (
              <span className="text-body-sm text-txt-black-500 tabular-nums">{rows.length}</span>
            )}
            <StateLabel state={stateOf(section)} />
          </span>
          {!collection && (
            <Button
              variant="default-ghost"
              size="small"
              iconOnly
              aria-label={t("pages.index.addTo", { title })}
              title={t("pages.index.addTo", { title })}
              onClick={() => shell.newPage(section.id)}
              className="relative z-10"
            >
              <PlusGlyph className="size-[18px]" />
            </Button>
          )}
          <span className="relative z-10">
            <RowMenu page={section} />
          </span>
        </header>
      }
    >
      {collection ? (
        <div className="flex items-center justify-between gap-3 px-2.5 pt-1 pb-2">
          <span className="text-body-sm text-txt-black-700 tabular-nums">
            {t("listing.count", { count: section.entryCount ?? 0 })}
          </span>
          <Button
            variant="default-outline"
            size="small"
            render={
              <Link
                to="/pages/$id/edit"
                params={{ id: section.id }}
                search={{ panel: "entries" }}
              />
            }
          >
            {t("pages.index.entries")}
          </Button>
        </div>
      ) : (
        rows.map((page) => (
          <Line key={page.id} page={page} indent={Math.max(0, page.depth - section.depth - 1)} />
        ))
      )}
    </PageCard>
  );
}

/** A page inside a card: glyph, title, entry count or state; More on hover. */
function Line({ page, indent = 0 }: { page: TreeItem; indent?: number }) {
  return (
    <div
      className="group/row hover:bg-bg-gray-50 relative flex min-h-10 items-center gap-2.5 rounded-xl pr-1 transition-colors duration-150 ease-out"
      style={{ paddingLeft: `${10 + indent * 18}px` }}
      title={page.path}
    >
      <KindGlyph page={page} className="text-txt-black-400 size-[18px] shrink-0" />
      <EditLink id={page.id} className="text-body-sm min-w-0 flex-1">
        {titleOf(page)}
      </EditLink>
      {page.kind === "listing" && (
        <span className="text-body-sm text-txt-black-500 tabular-nums">{page.entryCount ?? 0}</span>
      )}
      <StateLabel state={stateOf(page)} />
      <HoverMenu page={page} />
    </div>
  );
}
