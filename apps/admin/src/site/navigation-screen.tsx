/**
 * Navigation: the site chrome around every page, kept apart from the page
 * tree on purpose. Two parts (navbar, footer) under Navigation in the
 * sidebar; the editor on the left, a live preview of the edits on the right,
 * as visitors will see them once published. It's one drafted document, made
 * live by its own Publish, which first says what will change. The
 * announcement has a screen of its own.
 */
import {
  type NavDropdown,
  type NavItem,
  type NavLink,
  type Navigation,
  type NavigationDoc,
  type NavWarning,
} from "@fiscal-sb/contracts";
import { featureIcons } from "@fiscal-sb/blocks";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { PublishControl } from "@/components/publish-control";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ArrowDownIcon } from "@/components/ui/icons/arrow-down";
import { ArrowUpIcon } from "@/components/ui/icons/arrow-up";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { HamburgerMenuIcon } from "@/components/ui/icons/hamburger-menu";
import { InfoIcon } from "@/components/ui/icons/info";
import { LinkIcon } from "@/components/ui/icons/link";
import { PlusIcon } from "@/components/ui/icons/plus";
import { TrashIcon } from "@/components/ui/icons/trash";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { useShortcut, useShortcutScope } from "@/components/ui/shortcuts";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { type MessageKey, t } from "@/i18n";
import { siteDocQuery } from "@/lib/publish";
import { apiError, siteApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import useToast from "@/lib/ftds/hooks/use-toast";
import { usePages } from "@/lib/pages";
import { card } from "@/components/card";
import { DiscardEditsDialog, PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import { useDebounced } from "@/lib/use-debounced";
import {
  type Selection,
  duplicateLabels,
  moveItem,
  navigationChanges,
  newDropdown,
  newLink,
  parse,
  problems,
  selectionOf,
  setItem,
  setLayout,
  turnIntoDropdown,
  uniqueLabel,
} from "./navigation-model";
import { LivePreview } from "./live-preview";
import { TargetField } from "./target-field";

export type NavPart = "navbar" | "footer";
export const navParts: NavPart[] = ["navbar", "footer"];

export function useNavigationDoc() {
  return useQuery(siteDocQuery("navigation"));
}

export function NavigationScreen() {
  const doc = useNavigationDoc();
  if (doc.isError)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("navigation.loadFailed")}</CalloutTitle>
        </Callout>
      </div>
    );
  if (!doc.data)
    return (
      <div className="p-surface">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <Editor doc={doc.data} />;
}

/** A removal that can still be undone: what it was called, and the navigation before it. */
type Removed = { message: string; before: Navigation };

/** Warnings for the draft as it is now, checked shortly after the officer stops editing. */
function useDraftWarnings(draft: Navigation, doc: NavigationDoc) {
  const settled = useDebounced(draft, 400);
  const saved = JSON.stringify(settled) === JSON.stringify(doc.draft);
  const check = useQuery({
    queryKey: ["navigation", "check", settled],
    queryFn: () => siteApi.checkNavigation(settled),
    enabled: !saved,
    placeholderData: keepPreviousData,
  });
  return saved ? doc.warnings : (check.data?.warnings ?? doc.warnings);
}

function Editor({ doc }: { doc: NavigationDoc }) {
  const { part = "navbar" } = useSearch({ strict: false }) as { part?: NavPart };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraftState] = useState<Navigation>(doc.draft);
  const [selection, setSelection] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<Map<string, string>>(new Map());
  // A field shows its problem once the officer has left it, or after Save.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(doc.draft);
  const local = useMemo(() => problems(draft), [draft]);
  const warnings = useDraftWarnings(draft, doc);

  const setDraft = (update: (draft: Navigation) => Navigation) => {
    setRemoved(null);
    setDraftState(update);
  };
  /** Removes something, keeping the navigation before it so the removal can be undone. */
  const remove = (message: string, update: (draft: Navigation) => Navigation) => {
    setRemoved({ message, before: draft });
    setDraftState(update);
  };
  const touch = (path: string) =>
    setTouched((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
  const issue = (path: string) => {
    const found =
      serverIssues.get(path) ?? (showAll || touched.has(path) ? local.get(path) : undefined);
    return found && path.endsWith(".pageId") ? t("nav.target.choosePage") : found;
  };

  const leaveGuard = useLeaveGuard(dirty, t("navigation.leave.body"));

  const save = async () => {
    if (local.size) {
      setShowAll(true);
      toast({
        variant: "error",
        title: t("navigation.notSaved"),
        description: t("settings.fixFields"),
      });
      return;
    }
    setSaving(true);
    setServerIssues(new Map());
    try {
      const next = await siteApi.saveNavigation(draft);
      queryClient.setQueryData(["navigation"], next);
      setDraftState(next.draft);
      setRemoved(null);
      setShowAll(false);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast({
        variant: "success",
        title: t("navigation.saved"),
        description: t("navigation.whenLive"),
      });
    } catch (caught) {
      const body = await apiError(caught);
      setServerIssues(
        new Map(body?.details?.map((d) => [d.path.replace(/^draft\./, ""), d.message]) ?? []),
      );
      toast({
        variant: "error",
        title: t("navigation.notSaved"),
        description:
          body?.code === "validation_error"
            ? t("settings.fixFields")
            : (body?.message ?? t("common.tryAgain")),
      });
    } finally {
      setSaving(false);
    }
  };
  const discardChanges = async () => {
    const next = await siteApi.discardNavigation();
    queryClient.setQueryData(["navigation"], next);
    setDraftState(next.draft);
    setRemoved(null);
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const changes = navigationChanges(doc.published, doc.draft);
  const actions = (
    <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
      {doc.changed && !dirty && (
        <Button variant="default-ghost" size="small" onClick={() => void discardChanges()}>
          {t("settings.discard")}
        </Button>
      )}
      {dirty && (
        <Button variant="default-ghost" size="small" onClick={() => setDiscarding(true)}>
          {t("navigation.discardEdits")}
        </Button>
      )}
      {dirty && (
        <Button
          variant="default-outline"
          size="small"
          disabled={saving}
          onClick={() => void save()}
        >
          {t("navigation.save")}
        </Button>
      )}
      <PublishControl
        live={doc.changed ? "changed" : "live"}
        save={saving ? "saving" : dirty ? "unsaved" : "saved"}
        label={t("navigation.publish")}
        disabled={dirty}
        viewPath="/"
        onPublish={() => siteApi.publishDoc("navigation")}
        review={{
          title: t("navigation.review.title"),
          description: t("navigation.review.everyPage"),
          body: <PublishReview changes={changes} warnings={doc.warnings} />,
        }}
      />
    </div>
  );

  const warningsIn = (p: NavPart) => warnings.filter((w) => w.path.startsWith(p));
  const shown = warningsIn(part);
  const warned = new Set(shown.map((w) => selectionOf(w.path)).filter(Boolean));
  const editorProps = { draft, setDraft, remove, issue, touch };
  const counts: Record<NavPart, number> = {
    navbar: draft.navbar.length,
    footer: draft.footer.columns.length,
  };
  return (
    <>
      <Tabs
        value={part}
        onValueChange={(value) =>
          void navigate({ to: "/navigation", search: { part: value as NavPart }, replace: true })
        }
        className="flex h-full flex-col gap-0"
      >
        {/* The same header as a page's detail: what it is, where it shows, then its parts. */}
        <header className="bg-bg-white px-surface flex flex-col gap-4 pt-5">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
              <span
                aria-hidden
                className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
              >
                <HamburgerMenuIcon />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-title text-txt-black-900 truncate font-semibold">
                  {t("navigation.title")}
                </h1>
                <p className="text-body-sm text-txt-black-500">{t("navigation.everyPage")}</p>
              </div>
            </div>
            {actions}
          </div>
          <TabsList width="full">
            {navParts.map((p) => (
              <TabsTrigger key={p} value={p}>
                {t(`navigation.part.${p}`)}
                <TabsCounter>{counts[p]}</TabsCounter>
                {warningsIn(p).length > 0 && (
                  <>
                    <WarningCircleIcon className="text-txt-warning size-4 shrink-0" aria-hidden />
                    <span className="sr-only">{t("navigation.hasWarning")}</span>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="admin.navigation.split"
          defaultWidth={460}
          maxWidth={720}
          startLabel={t("navigation.editor")}
          endLabel={t("navigation.preview")}
          start={
            <div className="bg-bg-washed flex h-full flex-col gap-4 overflow-y-auto p-4">
              {removed && (
                <output className="bg-bg-white border-otl-gray-200 text-body-sm flex items-center justify-between gap-3 rounded-lg border py-2 pr-2 pl-4">
                  <span>{removed.message}</span>
                  <Button
                    variant="default-outline"
                    size="small"
                    onClick={() => {
                      setDraftState(removed.before);
                      setRemoved(null);
                    }}
                  >
                    {t("navigation.undo")}
                  </Button>
                </output>
              )}
              {shown.length > 0 && (
                <Warnings
                  warnings={shown}
                  onSelect={
                    part === "navbar"
                      ? (path) => {
                          const target = selectionOf(path);
                          if (target) setSelection(target);
                        }
                      : undefined
                  }
                />
              )}
              <TabsContent value="navbar" className="flex flex-col gap-4">
                <NavbarEditor
                  {...editorProps}
                  selection={selection}
                  setSelection={setSelection}
                  warned={warned}
                />
              </TabsContent>
              <TabsContent value="footer" className="flex flex-col gap-4">
                <FooterEditor {...editorProps} />
              </TabsContent>
              {doc.previous && !dirty && !doc.changed && (
                <PutBackPrevious
                  label={t("navigation.previous.load")}
                  onPutBack={() => {
                    const previous = doc.previous;
                    if (previous) setDraft(() => previous);
                  }}
                />
              )}
            </div>
          }
          end={
            <NavigationPreview
              draft={draft}
              part={part}
              open={part === "navbar" ? openDropdown(draft, selection) : null}
            />
          }
        />
      </Tabs>
      <DiscardEditsDialog
        open={discarding}
        onOpenChange={setDiscarding}
        body={t("navigation.discardEdits.body")}
        onDiscard={() => {
          setDraftState(doc.draft);
          setRemoved(null);
        }}
      />
      {leaveGuard}
    </>
  );
}

/** What Publish will change, before it does: the items, the footer, and links left out. */
function PublishReview({
  changes,
  warnings,
}: {
  changes: ReturnType<typeof navigationChanges>;
  warnings: NavWarning[];
}) {
  const lines = [
    ...changes.added.map((label) => t("navigation.review.added", { label })),
    ...changes.removed.map((label) => t("navigation.review.removed", { label })),
    ...changes.changed.map((label) => t("navigation.review.changed", { label })),
    ...(changes.reordered ? [t("navigation.review.reordered")] : []),
    ...(changes.footer ? [t("navigation.review.footer")] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 list-disc pl-5">
        {(lines.length ? lines : [t("navigation.review.none")]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <p className="text-txt-warning">
          {t("navigation.review.leftOut", { count: warnings.length })}
        </p>
      )}
      <p className="text-txt-black-700">{t("navigation.review.undo")}</p>
    </div>
  );
}

/** A warning's item name and reason: the server writes them as `"Label" reason`. */
const splitWarning = (message: string) => {
  const match = /^"(.+)" (.+)$/.exec(message);
  return match ? { label: match[1] ?? "", reason: match[2] ?? "" } : null;
};

/** Links that can't go live yet. In the navbar, each item's name selects it. */
export function Warnings({
  warnings,
  title = t("navigation.warnings"),
  onSelect,
}: {
  warnings: NavWarning[];
  title?: string;
  onSelect?: ((path: string) => void) | undefined;
}) {
  return (
    <Callout variant="warning">
      <CalloutTitle>{title}</CalloutTitle>
      {/* As a definition, the callout stacks its title over the list. */}
      <div role="definition">
        <ul className="text-body-sm m-0 flex list-disc flex-col gap-1 pl-5 text-pretty">
          {warnings.map((w) => {
            const parts = onSelect && splitWarning(w.message);
            return (
              <li key={w.path}>
                {parts ? (
                  <>
                    <button
                      type="button"
                      className={`${linkClass} cursor-pointer`}
                      onClick={() => onSelect(w.path)}
                    >
                      {parts.label}
                    </button>{" "}
                    {parts.reason}
                  </>
                ) : (
                  w.message
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Callout>
  );
}

/**
 * The dropdown to show open in the preview: the selected item's, if it's a
 * dropdown, by its label and which of the dropdowns with that label it is.
 */
function openDropdown(draft: Navigation, selection: Selection) {
  const { item } = parse(selection);
  const value = item === undefined ? undefined : draft.navbar[item];
  if (value?.type !== "dropdown" || item === undefined) return null;
  const nth = draft.navbar
    .slice(0, item)
    .filter((other) => other.type === "dropdown" && other.label === value.label).length;
  return { label: value.label, nth };
}

type EditorProps = {
  draft: Navigation;
  setDraft: (update: (draft: Navigation) => Navigation) => void;
  remove: (message: string, update: (draft: Navigation) => Navigation) => void;
  issue: (path: string) => string | undefined;
  touch: (path: string) => void;
};

const layoutTags: Record<NavDropdown["layout"], MessageKey> = {
  list: "navigation.layout.list",
  described: "navigation.layout.described",
  grouped: "navigation.layout.grouped",
};

const MAX_ITEMS = 8;

/** How many links (and columns) removing a dropdown takes with it. */
const linkCount = (item: NavItem) =>
  item.type === "link"
    ? 0
    : item.links.length + item.groups.reduce((n, g) => n + g.links.length, 0);

function NavbarEditor({
  draft,
  setDraft,
  remove,
  issue,
  touch,
  selection,
  setSelection,
  warned,
}: EditorProps & {
  selection: Selection;
  setSelection: (s: Selection) => void;
  warned: Set<Selection>;
}) {
  const sel = parse(selection);
  const selectedItem = sel.item === undefined ? undefined : draft.navbar[sel.item];
  const full = draft.navbar.length >= MAX_ITEMS;
  const duplicates = duplicateLabels(draft);
  // Moves and removals are said out loud; the list itself doesn't announce them.
  const [announcement, setAnnouncement] = useState("");

  const addTopLink = (kind: "page" | "url") => {
    if (full) return;
    // A page link starts with no page: the officer picks it, and the label follows.
    const item: NavItem =
      kind === "page"
        ? { type: "link", label: "", target: { kind: "page", pageId: "" } }
        : {
            type: "link",
            label: uniqueLabel(t("navigation.newLink"), draft),
            target: { kind: "url", url: "" },
          };
    setDraft((d) => ({ ...d, navbar: [...d.navbar, item] }));
    setSelection(String(draft.navbar.length));
  };
  const addDropdown = () => {
    if (full) return;
    const label = uniqueLabel(t("navigation.newDropdown"), draft);
    setDraft((d) => ({ ...d, navbar: [...d.navbar, newDropdown(label)] }));
    setSelection(String(draft.navbar.length));
  };
  const canAddColumn = selectedItem?.type === "dropdown" && selectedItem.layout === "grouped";
  const addColumn = () => {
    if (sel.item === undefined || selectedItem?.type !== "dropdown" || !canAddColumn) return;
    const index = sel.item;
    setDraft((d) =>
      setItem(d, index, {
        ...selectedItem,
        groups: [...selectedItem.groups, { heading: t("navigation.newColumn"), links: [] }],
      }),
    );
    setSelection(`${index}.g.${selectedItem.groups.length}`);
  };

  /** Moves item `from` by one, keeping focus on the button that moved it. */
  const move = (from: number, by: -1 | 1, control?: "up" | "down") => {
    const to = from + by;
    const item = draft.navbar[from];
    if (!item || to < 0 || to >= draft.navbar.length) return;
    setDraft((d) => ({ ...d, navbar: moveItem(d.navbar, from, to) }));
    setSelection(String(to));
    setAnnouncement(
      t("navigation.moved", {
        label: item.label || t("navigation.noLabel"),
        position: to + 1,
        count: draft.navbar.length,
      }),
    );
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-nav-row="${to}"]`);
      const button =
        (control && row?.querySelector<HTMLElement>(`[data-move="${control}"]:not(:disabled)`)) ||
        row?.querySelector<HTMLElement>("[data-select]");
      button?.focus();
    });
  };

  // alt+arrows reorder the selected item, or the selected link within its dropdown.
  useShortcutScope("navigation");
  const reorder = (by: -1 | 1) => {
    if (sel.item === undefined) return;
    const item = draft.navbar[sel.item];
    if (sel.part === "item") return move(sel.item, by);
    if (item?.type !== "dropdown" || sel.link === undefined) return;
    const index = sel.item;
    const j = sel.link;
    if (sel.part === "link" && j + by >= 0 && j + by < item.links.length) {
      setDraft((d) => setItem(d, index, { ...item, links: moveItem(item.links, j, j + by) }));
      setSelection(`${index}.l.${j + by}`);
    }
    const g = sel.group;
    const group = g === undefined ? undefined : item.groups[g];
    if (sel.part === "groupLink" && group && j + by >= 0 && j + by < group.links.length) {
      setDraft((d) =>
        setItem(d, index, {
          ...item,
          groups: item.groups.map((x, k) =>
            k === g ? { ...x, links: moveItem(x.links, j, j + by) } : x,
          ),
        }),
      );
      setSelection(`${index}.g.${g}.l.${j + by}`);
    }
  };
  useShortcut("alt+arrowup", () => reorder(-1), { scope: "navigation" });
  useShortcut("alt+arrowdown", () => reorder(1), { scope: "navigation" });

  const editor =
    sel.item !== undefined && selectedItem ? (
      <section
        aria-label={t("navigation.selected")}
        className="border-otl-gray-200 mt-1.5 flex flex-col gap-4 border-t px-2 pt-3 pb-2"
      >
        <SelectedEditor
          key={selection}
          item={selectedItem}
          index={sel.item}
          selection={sel}
          issue={issue}
          touch={touch}
          duplicate={duplicates.has(sel.item)}
          update={(next) => setDraft((d) => setItem(d, sel.item ?? 0, next))}
          removeWith={(message, next) => remove(message, (d) => setItem(d, sel.item ?? 0, next))}
          select={setSelection}
        />
      </section>
    ) : null;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="navbar-items" className="text-label-sm text-txt-black-900 font-semibold">
            {t("navigation.items")}{" "}
            <span className="text-txt-black-500 font-normal tabular-nums">
              {t("navigation.count", { count: draft.navbar.length, max: MAX_ITEMS })}
            </span>
          </h2>
          <p className="text-body-sm text-txt-black-700">{t("navigation.navbar.hint")}</p>
        </div>
        <Menu>
          <MenuTrigger render={<Button variant="primary-ghost" size="small" />}>
            <PlusIcon /> {t("navigation.add")}
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={full} onClick={() => addTopLink("page")}>
              {t("navigation.add.page")}
            </MenuItem>
            <MenuItem disabled={full} onClick={() => addTopLink("url")}>
              {t("navigation.add.url")}
            </MenuItem>
            <MenuItem disabled={full} onClick={addDropdown}>
              {t("navigation.add.dropdown")}
            </MenuItem>
            {canAddColumn && (
              <MenuItem onClick={addColumn}>
                {t("navigation.add.column", { label: selectedItem.label })}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>
      {full && <p className="text-body-sm text-txt-black-700">{t("navigation.full")}</p>}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ol aria-labelledby="navbar-items" className="m-0 flex list-none flex-col gap-3 p-0">
        {draft.navbar.map((item, i) => (
          <NavTreeItem
            // By position: a moved row keeps its element, and focus stays where the officer is.
            // oxlint-disable-next-line react/no-array-index-key -- items have no ids
            key={i}
            item={item}
            index={i}
            count={draft.navbar.length}
            selection={selection}
            warned={warned}
            editor={editor}
            onSelect={setSelection}
            onMove={(by) => move(i, by, by < 0 ? "up" : "down")}
            onRemove={() => {
              const label = item.label || t("navigation.noLabel");
              const links = linkCount(item);
              remove(
                links
                  ? t("navigation.removedWith", { label, count: links })
                  : t("navigation.removed", { label }),
                (d) => ({ ...d, navbar: d.navbar.filter((_, j) => j !== i) }),
              );
              setSelection(null);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(
                    `[data-nav-row="${Math.min(i, draft.navbar.length - 2)}"] [data-select]`,
                  )
                  ?.focus(),
              );
            }}
          />
        ))}
        {draft.navbar.length === 0 && (
          <li
            className={`${card} border-otl-gray-200 text-body-sm text-txt-black-700 border-dashed px-4 py-6 text-center shadow-none`}
          >
            {t("navigation.navbar.empty")}
          </li>
        )}
      </ol>
    </>
  );
}

function TreeRow({
  depth,
  selected,
  warned,
  onSelect,
  children,
  actions,
  panel,
}: {
  depth: number;
  selected: boolean;
  warned?: boolean;
  onSelect: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** The selected item's editor, right under its row. */
  panel?: ReactNode;
}) {
  return (
    <>
      <div
        className={clx(
          "flex items-center rounded-sm",
          selected ? "bg-bg-primary-50" : "hover:bg-bg-washed",
        )}
      >
        <button
          type="button"
          data-select
          aria-current={selected || undefined}
          onClick={onSelect}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1.5 pr-2 text-left"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {children}
          {warned && (
            <>
              <WarningCircleIcon className="text-txt-warning size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t("navigation.hasWarning")}</span>
            </>
          )}
        </button>
        {/* Only the selected row's actions show: nothing appears under a passing pointer. */}
        {selected && actions}
      </div>
      {selected && panel}
    </>
  );
}

/** A row's label, or a placeholder while it has none. */
function RowLabel({ text, className }: { text: string; className: string }) {
  return text ? (
    <span className={clx("truncate", className)}>{text}</span>
  ) : (
    <span className={clx("text-txt-black-500 truncate italic", className)}>
      {t("navigation.noLabel")}
    </span>
  );
}

function NavTreeItem({
  item,
  index,
  count,
  selection,
  warned,
  editor,
  onSelect,
  onMove,
  onRemove,
}: {
  item: NavItem;
  index: number;
  count: number;
  selection: Selection;
  warned: Set<Selection>;
  editor: ReactNode;
  onSelect: (s: Selection) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = String(index);
  const name = item.label || t("navigation.noLabel");
  const pages = usePages();
  /** Where a link goes, as the officer knows it: the page's address, or the website's. */
  const destination = (target: NavLink["target"]) => {
    if (target.kind === "url")
      return target.url.replace(/^https?:\/\//, "").replace(/\/$/, "") || t("navigation.noTarget");
    if (!target.pageId) return t("navigation.noTarget");
    return pages.data?.find((p) => p.id === target.pageId)?.path ?? t("navigation.pageGone");
  };
  const actions = (
    <span className="flex">
      <Button
        variant="default-ghost"
        size="small"
        iconOnly
        data-move="up"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={t("navigation.up", { label: name })}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="default-ghost"
        size="small"
        iconOnly
        data-move="down"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label={t("navigation.down", { label: name })}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        variant="danger-ghost"
        size="small"
        iconOnly
        onClick={onRemove}
        aria-label={t("navigation.remove", { label: name })}
      >
        <TrashIcon />
      </Button>
    </span>
  );
  const row = (path: string) => ({
    selected: selection === path,
    warned: warned.has(path),
    onSelect: () => onSelect(path),
    panel: editor,
  });
  return (
    <li
      data-nav-row={index}
      className={clx(
        card,
        "flex flex-col gap-0.5 p-2 transition-colors duration-150 motion-reduce:transition-none",
        selection === id || selection?.startsWith(`${id}.`)
          ? "border-otl-primary-300"
          : "border-otl-gray-200",
      )}
    >
      <TreeRow depth={0} {...row(id)} actions={actions}>
        {item.type === "dropdown" ? (
          <ChevronDownIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
        ) : (
          <LinkIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
        )}
        <RowLabel text={item.label} className="text-label-sm font-medium" />
        <span className="sr-only">, </span>
        {item.type === "dropdown" ? (
          <Tag size="small">{t(layoutTags[item.layout])}</Tag>
        ) : (
          <span className="text-label-compact text-txt-black-500 min-w-0 truncate font-normal">
            <span className="sr-only">{t("navigation.link")}, </span>
            {destination(item.target)}
          </span>
        )}
      </TreeRow>
      {item.type === "dropdown" && (
        <ol className="m-0 list-none p-0">
          {item.layout === "grouped"
            ? item.groups.map((group, g) => (
                <li key={`g${g}`}>
                  <TreeRow depth={1} {...row(`${id}.g.${g}`)}>
                    <RowLabel
                      text={group.heading}
                      className="text-label-sm text-txt-black-700 font-medium"
                    />
                  </TreeRow>
                  {group.links.map((link, l) => (
                    <TreeRow key={`l${l}`} depth={2} {...row(`${id}.g.${g}.l.${l}`)}>
                      <RowLabel text={link.label} className="text-body-sm" />
                    </TreeRow>
                  ))}
                </li>
              ))
            : item.links.map((link, l) => (
                <li key={`l${l}`}>
                  <TreeRow depth={1} {...row(`${id}.l.${l}`)}>
                    <RowLabel text={link.label} className="text-body-sm" />
                  </TreeRow>
                </li>
              ))}
          {item.feature && (
            <li>
              <TreeRow depth={1} {...row(`${id}.feature`)}>
                <span className="text-label-compact text-txt-black-700 truncate font-normal">
                  {t("navigation.feature.summary", { title: item.feature.title })}
                </span>
              </TreeRow>
            </li>
          )}
          {item.footerLink && (
            <li>
              <TreeRow depth={1} {...row(`${id}.footer`)}>
                <span className="text-label-compact text-txt-black-700 truncate font-normal">
                  {t("navigation.footerLink.summary", { text: item.footerLink.text })}
                </span>
              </TreeRow>
            </li>
          )}
        </ol>
      )}
    </li>
  );
}

export function TextInput({
  name,
  label,
  value,
  max,
  hint,
  error,
  warning,
  onChange,
  onBlur,
}: {
  name: string;
  label: string;
  value: string;
  max: number;
  hint?: string;
  error?: string | undefined;
  /** Advice that doesn't stop a save, such as a label another item also has. */
  warning?: string | undefined;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
}) {
  return (
    <Field name={name} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <Input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <FieldError>{error}</FieldError>
      {!error && warning && <p className="text-body-sm text-txt-warning">{warning}</p>}
    </Field>
  );
}

/** Field problems and touching, for the editors below. */
type Checks = {
  issue: (path: string) => string | undefined;
  touch: (path: string) => void;
};

/** A link target's problem: its address, or a page not chosen yet. */
const targetIssue = (issue: Checks["issue"], path: string) =>
  issue(`${path}.url`) ?? issue(`${path}.pageId`);

/** Touches both halves of a target, whichever kind it is. */
const touchTarget = (touch: Checks["touch"], path: string) => () => {
  touch(`${path}.url`);
  touch(`${path}.pageId`);
};

/** "file-text" reads as "File text". */
const iconOptions = featureIcons.map((icon) => {
  const words = icon.replaceAll("-", " ");
  return { value: icon, label: words.charAt(0).toUpperCase() + words.slice(1) };
});

function LinkEditor({
  link,
  path,
  described,
  issue,
  touch,
  onChange,
  onRemove,
  onMove,
}: Checks & {
  link: NavLink;
  path: string;
  described: boolean;
  onChange: (link: NavLink) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const name = link.label || t("navigation.noLabel");
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-label-md font-semibold">{t("navigation.link")}</h2>
        <span className="flex">
          <Button
            variant="default-ghost"
            size="small"
            iconOnly
            onClick={() => onMove(-1)}
            aria-label={t("navigation.up", { label: name })}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="default-ghost"
            size="small"
            iconOnly
            onClick={() => onMove(1)}
            aria-label={t("navigation.down", { label: name })}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="danger-ghost"
            size="small"
            iconOnly
            onClick={onRemove}
            aria-label={t("navigation.remove", { label: name })}
          >
            <TrashIcon />
          </Button>
        </span>
      </div>
      <TextInput
        name={`${path}.label`}
        label={t("navigation.label")}
        value={link.label}
        max={60}
        error={issue(`${path}.label`)}
        onBlur={() => touch(`${path}.label`)}
        onChange={(label) => onChange({ ...link, label })}
      />
      <TargetField
        name={`${path}.target`}
        value={link.target}
        error={targetIssue(issue, `${path}.target`)}
        onBlur={touchTarget(touch, `${path}.target`)}
        onChange={(target, title) => onChange(withTarget(link, target, title))}
      />
      {described && (
        <>
          <TextInput
            name={`${path}.description`}
            label={t("navigation.description")}
            value={link.description ?? ""}
            max={120}
            onChange={(description) => onChange({ ...link, description: description || undefined })}
          />
          <Field name={`${path}.icon`}>
            <FieldLabel>{t("navigation.icon")}</FieldLabel>
            <Select
              items={iconOptions}
              value={link.icon ?? ""}
              clearable
              placeholder={t("editor.field.none")}
              onValueChange={(icon: string) =>
                onChange({ ...link, icon: (icon || undefined) as NavLink["icon"] })
              }
            />
          </Field>
        </>
      )}
    </>
  );
}

/** A link's new target; a link with no label yet takes the chosen page's title. */
const withTarget = <T extends { label: string }>(
  link: T,
  target: NavLink["target"],
  title: string | undefined,
): T => ({ ...link, target, label: link.label || title?.slice(0, 60) || "" });

const editLink = (list: NavLink[], j: number, next: NavLink) =>
  list.map((l, k) => (k === j ? next : l));

function SelectedEditor({
  item,
  index,
  selection,
  issue,
  touch,
  duplicate,
  update,
  removeWith,
  select,
}: Checks & {
  item: NavItem;
  index: number;
  selection: ReturnType<typeof parse>;
  /** Another top-level item has the same label. */
  duplicate: boolean;
  update: (item: NavItem) => void;
  /** An update that removes something, which the officer can undo. */
  removeWith: (message: string, item: NavItem) => void;
  select: (s: Selection) => void;
}) {
  const base = `navbar.${index}`;
  const labelIssue = issue(`${base}.label`);
  const duplicateWarning = duplicate ? t("navigation.duplicate") : undefined;
  if (item.type === "link")
    return (
      <>
        <h2 className="text-body-md font-semibold">{t("navigation.topLink")}</h2>
        <TextInput
          name={`${base}.label`}
          label={t("navigation.label")}
          value={item.label}
          max={60}
          error={labelIssue}
          warning={duplicateWarning}
          onBlur={() => touch(`${base}.label`)}
          onChange={(label) => update({ ...item, label })}
        />
        <TargetField
          name={`${base}.target`}
          value={item.target}
          error={targetIssue(issue, `${base}.target`)}
          onBlur={touchTarget(touch, `${base}.target`)}
          onChange={(target, title) => update(withTarget(item, target, title))}
        />
        <div>
          <Button
            variant="default-outline"
            size="small"
            onClick={() => update(turnIntoDropdown(item))}
          >
            {t("navigation.toDropdown")}
          </Button>
        </div>
      </>
    );

  const links = item.links;
  if (selection.part === "link" && selection.link !== undefined) {
    const j = selection.link;
    const link = links[j];
    if (!link) return null;
    return (
      <LinkEditor
        link={link}
        path={`${base}.links.${j}`}
        described={item.layout === "described"}
        issue={issue}
        touch={touch}
        onChange={(next) => update({ ...item, links: editLink(links, j, next) })}
        onRemove={() => {
          removeWith(t("navigation.removed", { label: link.label || t("navigation.noLabel") }), {
            ...item,
            links: links.filter((_, k) => k !== j),
          });
          select(String(index));
        }}
        onMove={(by) => {
          update({ ...item, links: moveItem(links, j, j + by) });
          if (j + by >= 0 && j + by < links.length) select(`${index}.l.${j + by}`);
        }}
      />
    );
  }
  if (
    (selection.part === "group" || selection.part === "groupLink") &&
    selection.group !== undefined
  ) {
    const g = selection.group;
    const group = item.groups[g];
    if (!group) return null;
    const withGroup = (next: typeof group) => ({
      ...item,
      groups: item.groups.map((x, k) => (k === g ? next : x)),
    });
    const setGroup = (next: typeof group) => update(withGroup(next));
    if (selection.part === "groupLink" && selection.link !== undefined) {
      const j = selection.link;
      const link = group.links[j];
      if (!link) return null;
      return (
        <LinkEditor
          link={link}
          path={`${base}.groups.${g}.links.${j}`}
          described={false}
          issue={issue}
          touch={touch}
          onChange={(next) => setGroup({ ...group, links: editLink(group.links, j, next) })}
          onRemove={() => {
            removeWith(
              t("navigation.removed", { label: link.label || t("navigation.noLabel") }),
              withGroup({ ...group, links: group.links.filter((_, k) => k !== j) }),
            );
            select(`${index}.g.${g}`);
          }}
          onMove={(by) => {
            setGroup({ ...group, links: moveItem(group.links, j, j + by) });
            if (j + by >= 0 && j + by < group.links.length) select(`${index}.g.${g}.l.${j + by}`);
          }}
        />
      );
    }
    return (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-body-md font-semibold">{t("navigation.column")}</h2>
          <Button
            variant="danger-ghost"
            size="small"
            iconOnly
            aria-label={t("navigation.remove", { label: group.heading })}
            onClick={() => {
              const label = group.heading || t("navigation.noLabel");
              removeWith(
                group.links.length
                  ? t("navigation.removedWith", { label, count: group.links.length })
                  : t("navigation.removed", { label }),
                { ...item, groups: item.groups.filter((_, k) => k !== g) },
              );
              select(String(index));
            }}
          >
            <TrashIcon />
          </Button>
        </div>
        <TextInput
          name={`${base}.groups.${g}.heading`}
          label={t("navigation.heading")}
          value={group.heading}
          max={60}
          error={issue(`${base}.groups.${g}.heading`)}
          onBlur={() => touch(`${base}.groups.${g}.heading`)}
          onChange={(heading) => setGroup({ ...group, heading })}
        />
        <div>
          <Button
            variant="default-outline"
            size="small"
            disabled={group.links.length >= 12}
            onClick={() => {
              setGroup({
                ...group,
                links: [...group.links, newLink(t("navigation.newLink"), { kind: "url", url: "" })],
              });
              select(`${index}.g.${g}.l.${group.links.length}`);
            }}
          >
            <PlusIcon /> {t("navigation.addLink")}
          </Button>
        </div>
      </>
    );
  }
  if (selection.part === "feature" && item.feature) {
    const feature = item.feature;
    const set = (next: Partial<typeof feature>) =>
      update({ ...item, feature: { ...feature, ...next } });
    return (
      <>
        <h2 className="text-body-md font-semibold">{t("navigation.feature")}</h2>
        <TextInput
          name={`${base}.feature.eyebrow`}
          label={t("navigation.feature.eyebrow")}
          value={feature.eyebrow ?? ""}
          max={40}
          onChange={(eyebrow) => set({ eyebrow: eyebrow || undefined })}
        />
        <TextInput
          name={`${base}.feature.title`}
          label={t("navigation.feature.title")}
          value={feature.title}
          max={80}
          error={issue(`${base}.feature.title`)}
          onBlur={() => touch(`${base}.feature.title`)}
          onChange={(title) => set({ title })}
        />
        <TextInput
          name={`${base}.feature.description`}
          label={t("navigation.description")}
          value={feature.description ?? ""}
          max={200}
          onChange={(description) => set({ description: description || undefined })}
        />
        <TargetField
          name={`${base}.feature.target`}
          value={feature.target}
          error={targetIssue(issue, `${base}.feature.target`)}
          onBlur={touchTarget(touch, `${base}.feature.target`)}
          onChange={(target) => set({ target })}
        />
        <TextInput
          name={`${base}.feature.linkText`}
          label={t("navigation.feature.linkText")}
          value={feature.linkText ?? ""}
          max={40}
          onChange={(linkText) => set({ linkText: linkText || undefined })}
        />
      </>
    );
  }
  if (selection.part === "footer" && item.footerLink) {
    const footer = item.footerLink;
    return (
      <>
        <h2 className="text-body-md font-semibold">{t("navigation.footerLink")}</h2>
        <TextInput
          name={`${base}.footerLink.text`}
          label={t("navigation.label")}
          value={footer.text}
          max={60}
          error={issue(`${base}.footerLink.text`)}
          onBlur={() => touch(`${base}.footerLink.text`)}
          onChange={(text) => update({ ...item, footerLink: { ...footer, text } })}
        />
        <TargetField
          name={`${base}.footerLink.target`}
          value={footer.target}
          error={targetIssue(issue, `${base}.footerLink.target`)}
          onBlur={touchTarget(touch, `${base}.footerLink.target`)}
          onChange={(target) => update({ ...item, footerLink: { ...footer, target } })}
        />
      </>
    );
  }

  // The dropdown itself.
  const firstTarget = links[0]?.target ??
    item.groups[0]?.links[0]?.target ?? { kind: "url" as const, url: "" };
  return (
    <>
      <h2 className="text-body-md font-semibold">{t("navigation.dropdown")}</h2>
      <TextInput
        name={`${base}.label`}
        label={t("navigation.menuTitle")}
        value={item.label}
        max={60}
        error={labelIssue}
        warning={duplicateWarning}
        onBlur={() => touch(`${base}.label`)}
        onChange={(label) => update({ ...item, label })}
      />
      <Field name={`${base}.layout`}>
        <FieldLabel>{t("navigation.style")}</FieldLabel>
        <ToggleGroup
          value={[item.layout]}
          aria-label={t("navigation.style")}
          onValueChange={(v) => v[0] && update(setLayout(item, v[0] as NavDropdown["layout"]))}
        >
          <Toggle value="list">{t("navigation.layout.list")}</Toggle>
          <Toggle value="described">{t("navigation.layout.described")}</Toggle>
          <Toggle value="grouped">{t("navigation.layout.grouped")}</Toggle>
        </ToggleGroup>
        <FieldDescription>{t(`navigation.layout.${item.layout}.hint`)}</FieldDescription>
      </Field>
      {item.layout === "list" && (
        <Field name={`${base}.columns`}>
          <FieldLabel>{t("navigation.columns")}</FieldLabel>
          <ToggleGroup
            value={[String(item.columns)]}
            aria-label={t("navigation.columns")}
            onValueChange={(v) => v[0] && update({ ...item, columns: Number(v[0]) as 1 | 2 | 3 })}
          >
            <Toggle value="1">1</Toggle>
            <Toggle value="2">2</Toggle>
            <Toggle value="3">3</Toggle>
          </ToggleGroup>
        </Field>
      )}
      {item.layout !== "grouped" && (
        <div>
          <Button
            variant="default-outline"
            size="small"
            disabled={links.length >= 16}
            onClick={() => {
              update({
                ...item,
                links: [...links, newLink(t("navigation.newLink"), { kind: "url", url: "" })],
              });
              select(`${index}.l.${links.length}`);
            }}
          >
            <PlusIcon /> {t("navigation.addLink")}
          </Button>
        </div>
      )}
      <SwitchRow
        title={t("navigation.feature")}
        hint={t("navigation.feature.hint")}
        checked={Boolean(item.feature)}
        onCheckedChange={(on) => {
          update({
            ...item,
            feature: on ? { title: item.label, target: firstTarget } : undefined,
          });
          if (on) select(`${index}.feature`);
        }}
      />
      <SwitchRow
        title={t("navigation.footerLink")}
        hint={t("navigation.footerLink.hint")}
        checked={Boolean(item.footerLink)}
        onCheckedChange={(on) => {
          update({
            ...item,
            footerLink: on
              ? { text: t("navigation.footerLink.default"), target: firstTarget }
              : undefined,
          });
          if (on) select(`${index}.footer`);
        }}
      />
    </>
  );
}

/** A switch with its title and hint, labelled for assistive technology. */
export function SwitchRow({
  title,
  hint,
  checked,
  onCheckedChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span id={`${id}-title`} className="text-label-md font-medium">
          {title}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="text-label-compact text-txt-black-700 font-normal">
            {hint}
          </span>
        )}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={`${id}-title`}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}

const MAX_COLUMNS = 4;

function FooterEditor({ draft, setDraft, remove, issue, touch }: EditorProps) {
  const columns = draft.footer.columns;
  const setColumns = (next: typeof columns) =>
    setDraft((d) => ({ ...d, footer: { columns: next } }));
  const withLinks = (c: number, update: (links: NavLink[]) => NavLink[]) =>
    columns.map((x, k) => (k === c ? { ...x, links: update(x.links) } : x));
  const setLinks = (c: number, update: (links: NavLink[]) => NavLink[]) =>
    setColumns(withLinks(c, update));
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-label-sm text-txt-black-900 font-semibold">
          {t("navigation.footer.columns")}{" "}
          <span className="text-txt-black-500 font-normal tabular-nums">
            {t("navigation.count", { count: columns.length, max: MAX_COLUMNS })}
          </span>
        </h2>
        <p className="text-body-sm text-txt-black-700">{t("navigation.footer.hint")}</p>
      </div>
      {columns.map((column, c) => {
        const name = column.heading || t("navigation.noLabel");
        return (
          <section
            key={`c${c}`}
            aria-label={name}
            className={`${card} border-otl-gray-200 flex flex-col`}
          >
            <div className="flex items-end gap-1 px-4 pt-4 pb-3">
              <div className="min-w-0 flex-1">
                <TextInput
                  name={`footer.columns.${c}.heading`}
                  label={t("navigation.heading")}
                  value={column.heading}
                  max={60}
                  error={issue(`footer.columns.${c}.heading`)}
                  onBlur={() => touch(`footer.columns.${c}.heading`)}
                  onChange={(heading) =>
                    setColumns(columns.map((x, k) => (k === c ? { ...x, heading } : x)))
                  }
                />
              </div>
              <Button
                variant="default-ghost"
                size="small"
                iconOnly
                disabled={c === 0}
                onClick={() => setColumns(moveItem(columns, c, c - 1))}
                aria-label={t("navigation.up", { label: name })}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="default-ghost"
                size="small"
                iconOnly
                disabled={c === columns.length - 1}
                onClick={() => setColumns(moveItem(columns, c, c + 1))}
                aria-label={t("navigation.down", { label: name })}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                variant="danger-ghost"
                size="small"
                iconOnly
                onClick={() =>
                  remove(
                    column.links.length
                      ? t("navigation.removedWith", { label: name, count: column.links.length })
                      : t("navigation.removed", { label: name }),
                    (d) => ({ ...d, footer: { columns: columns.filter((_, k) => k !== c) } }),
                  )
                }
                aria-label={t("navigation.remove", { label: name })}
              >
                <TrashIcon />
              </Button>
            </div>
            {column.links.length > 0 && (
              <ol className="divide-otl-gray-200 border-otl-gray-200 m-0 list-none divide-y border-t px-4 py-0">
                {column.links.map((link, j) => {
                  const linkName = link.label || t("navigation.noLabel");
                  return (
                    <li key={`l${j}`} className="flex flex-col gap-3 py-4">
                      <div className="flex items-end gap-1">
                        <div className="min-w-0 flex-1">
                          <TextInput
                            name={`footer.columns.${c}.links.${j}.label`}
                            label={t("navigation.label")}
                            value={link.label}
                            max={60}
                            error={issue(`footer.columns.${c}.links.${j}.label`)}
                            onBlur={() => touch(`footer.columns.${c}.links.${j}.label`)}
                            onChange={(label) =>
                              setLinks(c, (links) =>
                                links.map((l, m) => (m === j ? { ...l, label } : l)),
                              )
                            }
                          />
                        </div>
                        <Button
                          variant="danger-ghost"
                          size="small"
                          iconOnly
                          aria-label={t("navigation.remove", { label: linkName })}
                          onClick={() =>
                            remove(t("navigation.removed", { label: linkName }), (d) => ({
                              ...d,
                              footer: {
                                columns: withLinks(c, (ls) => ls.filter((_, m) => m !== j)),
                              },
                            }))
                          }
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                      <TargetField
                        name={`footer.columns.${c}.links.${j}.target`}
                        value={link.target}
                        error={targetIssue(issue, `footer.columns.${c}.links.${j}.target`)}
                        onBlur={touchTarget(touch, `footer.columns.${c}.links.${j}.target`)}
                        onChange={(target, title) =>
                          setLinks(c, (links) =>
                            links.map((l, m) => (m === j ? withTarget(l, target, title) : l)),
                          )
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="border-otl-gray-200 bg-bg-washed flex items-center gap-3 border-t px-4 py-2">
              <Button
                variant="default-ghost"
                size="small"
                disabled={column.links.length >= 12}
                onClick={() =>
                  setLinks(c, (links) => [
                    ...links,
                    newLink(t("navigation.newLink"), { kind: "url", url: "" }),
                  ])
                }
              >
                <PlusIcon /> {t("navigation.addLink")}
              </Button>
              {column.links.length === 0 && (
                <span className="text-body-sm text-txt-black-500">
                  {t("navigation.footer.emptyColumn")}
                </span>
              )}
            </div>
          </section>
        );
      })}
      <div>
        <Button
          variant="primary-ghost"
          size="small"
          disabled={columns.length >= MAX_COLUMNS}
          onClick={() =>
            setColumns([...columns, { heading: t("navigation.newColumn"), links: [] }])
          }
        >
          <PlusIcon /> {t("navigation.addColumn")}
        </Button>
      </div>
      <p className="text-body-sm text-txt-black-700 flex items-start gap-2">
        <InfoIcon className="text-txt-black-500 mt-0.5 size-4 shrink-0" aria-hidden />
        {t("navigation.footer.contact")}
      </p>
    </>
  );
}

/**
 * The home page with the navigation being edited around it, as visitors will
 * see it once published: links to pages that aren't live are left out. The
 * part being edited is scrolled into view, and the selected dropdown opened.
 */
function NavigationPreview({
  draft,
  part,
  open,
}: {
  draft: Navigation;
  /** The part being edited, scrolled into view. */
  part: NavPart;
  open: { label: string; nth: number } | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // The latest, for the frame's load and swap callbacks.
  const openRef = useRef(open);
  const partRef = useRef(part);
  useEffect(() => {
    openRef.current = open;
    partRef.current = part;
  });

  /** Shows the part being edited: the top of the page for the navbar, the bottom for the footer. */
  const reveal = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const footers = w.document.querySelectorAll("body footer");
    const footer = footers[footers.length - 1];
    if (partRef.current === "footer" && footer) footer.scrollIntoView({ block: "end" });
    else w.scrollTo(0, 0);
  };
  useEffect(reveal, [part]);

  const openSelected = () => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    for (const popover of d.querySelectorAll<HTMLElement>("header [popover]")) {
      try {
        popover.hidePopover();
      } catch {
        // Not open.
      }
    }
    const target = openRef.current;
    if (!target) return;
    const triggers = [...d.querySelectorAll<HTMLElement>("header [popovertarget]")].filter(
      (el) => el.textContent?.trim() === target.label,
    );
    triggers[target.nth]?.click();
  };
  useEffect(openSelected, [open?.label, open?.nth]);

  return (
    <LivePreview
      frame={frame}
      render={(pageId, signal) => siteApi.renderWithSite(pageId, { navigation: draft }, signal)}
      renderKey={JSON.stringify(draft)}
      regions={["body header", "body footer"]}
      caption={t("navigation.preview.caption")}
      onLoad={() => {
        reveal();
        openSelected();
      }}
      onSwap={() => {
        openSelected();
        if (partRef.current === "footer") reveal();
      }}
    />
  );
}
