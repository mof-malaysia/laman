/**
 * Navigation: the site chrome around every page, kept apart from the page
 * tree on purpose. Two parts (navbar, footer) under Navigation in the
 * sidebar; the editor on the left, a live preview of the edits on the right,
 * as visitors will see them once published. It's one drafted document, made
 * live by its own Publish, which first says what will change. The
 * announcement has a screen of its own.
 */
import { IconPicker } from "@/components/icon-picker";
import { RadioCards } from "@/components/radio-cards";
import { featureIconSections } from "@/lib/feature-icons";
import {
  type NavDropdown,
  type NavItem,
  type NavLink,
  type Navigation,
  type NavigationDoc,
  type NavWarning,
} from "@laman/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PublishControl } from "@/components/publish-control";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { CheckIcon } from "@/components/ui/icons/check";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { HamburgerMenuIcon } from "@/components/ui/icons/hamburger-menu";
import { InfoIcon } from "@/components/ui/icons/info";
import { LinkIcon } from "@/components/ui/icons/link";
import { PlusIcon } from "@/components/ui/icons/plus";
import { TrashIcon } from "@/components/ui/icons/trash";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TextArea } from "@/components/ui/textarea";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useShortcut, useShortcutScope } from "@/components/ui/shortcuts";
import { SplitPane } from "@/components/ui/split-pane";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { type MessageKey, t } from "@/i18n";
import { hostOf, siteDocQuery } from "@/lib/publish";
import { apiError, siteApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import useToast from "@/lib/ftds/hooks/use-toast";
import { usePages } from "@/lib/pages";
import { card } from "@/components/card";
import { useDocConflict } from "@/components/conflict-dialog";
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
  uniqueLabel,
} from "./navigation-model";
import { LivePreview } from "./live-preview";
import { SortableList, shifted, sortId, sortIds, useSortableRow } from "@/components/sortable";
import { TargetField } from "./target-field";
import { WorkspaceFallback, WorkspaceHeader } from "@/components/workspace";

export type NavPart = "navbar" | "footer";
export const navParts: NavPart[] = ["navbar", "footer"];

export function useNavigationDoc() {
  return useQuery(siteDocQuery("navigation"));
}

/** What the screen is, drawn the same whether its document is loaded, loading or failed. */
const identity = () => ({
  icon: <HamburgerMenuIcon />,
  title: t("navigation.title"),
  subtitle: t("navigation.everyPage"),
});

/** The editing pane's starting width, for the SplitPane and the skeleton before it. */
const PANE_WIDTH = 460;

export function NavigationScreen() {
  const doc = useNavigationDoc();
  if (doc.isError || !doc.data)
    return (
      <WorkspaceFallback
        {...identity()}
        error={doc.isError ? t("navigation.loadFailed") : undefined}
        paneWidth={PANE_WIDTH}
      />
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
  const destination = useDestinationOf();

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
  const conflict = useDocConflict<Navigation>("navigation", {
    onLoad: (latest) => {
      setDraftState(latest);
      setRemoved(null);
    },
    retry: () => save(),
  });

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
      if (await conflict.handle(caught)) return;
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
    <>
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
    </>
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
    <DestinationContext.Provider value={destination}>
      <Tabs
        value={part}
        onValueChange={(value) =>
          void navigate({ to: "/navigation", search: { part: value as NavPart }, replace: true })
        }
        className="flex h-full flex-col gap-0"
      >
        <WorkspaceHeader {...identity()} actions={actions}>
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
        </WorkspaceHeader>
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="admin.navigation.split"
          defaultWidth={PANE_WIDTH}
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
                <FooterEditor
                  {...editorProps}
                  warnedPaths={warningsIn("footer").map((w) => w.path)}
                />
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
      {conflict.dialog}
    </DestinationContext.Provider>
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
  // The items with a warning anywhere in them: "3.l.1" marks item 3.
  const warnedItems = new Set([...warned].map((w) => w?.split(".")[0]));

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

  /** Moves item `from` to `to`; whatever is open goes with it. */
  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= draft.navbar.length || from === to) return;
    setDraft((d) => ({ ...d, navbar: moveItem(d.navbar, from, to) }));
    if (sel.item !== undefined && selection !== null) {
      const [, ...rest] = selection.split(".");
      setSelection([String(shifted(sel.item, from, to)), ...rest].join("."));
    }
  };

  // alt+arrows reorder the selected item, or the selected link within its dropdown.
  useShortcutScope("navigation");
  const reorder = (by: -1 | 1) => {
    if (sel.item === undefined) return;
    const item = draft.navbar[sel.item];
    if (sel.part === "item") return moveTo(sel.item, sel.item + by);
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
      <SelectedEditor
        key={sel.item}
        item={selectedItem}
        index={sel.item}
        at={selection}
        warned={warned}
        issue={issue}
        touch={touch}
        duplicate={duplicates.has(sel.item)}
        update={(next) => setDraft((d) => setItem(d, sel.item ?? 0, next))}
        removeWith={(message, next) => remove(message, (d) => setItem(d, sel.item ?? 0, next))}
        select={setSelection}
      />
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
          </MenuContent>
        </Menu>
      </div>
      {full && <p className="text-body-sm text-txt-black-700">{t("navigation.full")}</p>}
      <SortableList
        ids={sortIds("navbar", draft.navbar.length)}
        names={draft.navbar.map((item) => named(item.label))}
        onMove={moveTo}
      >
        <ol aria-labelledby="navbar-items" className="m-0 flex list-none flex-col gap-3 p-0">
          {draft.navbar.map((item, i) => (
            <NavTreeItem
              // By position: a moved row keeps its element, and focus stays where the officer is.
              // oxlint-disable-next-line react/no-array-index-key -- items have no ids
              key={i}
              item={item}
              index={i}
              selection={selection}
              warned={warnedItems.has(String(i))}
              editor={editor}
              onSelect={setSelection}
              onRemove={() => {
                remove(removedWith(item.label, linkCount(item)), (d) => ({
                  ...d,
                  navbar: d.navbar.filter((_, j) => j !== i),
                }));
                setSelection(null);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(
                      `[aria-labelledby="navbar-items"] > [data-card="${Math.min(i, draft.navbar.length - 2)}"] [data-select]`,
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
      </SortableList>
    </>
  );
}

/** A label, or what to call it while it has none. */
const named = (label: string) => label || t("navigation.noLabel");

/** A row's label, or a placeholder while it has none. */
function RowLabel({ text, className }: { text: string; className: string }) {
  return text ? (
    <span className={clx("truncate", className)}>{text}</span>
  ) : (
    <span className={clx("text-txt-black-500 truncate italic", className)}>{named(text)}</span>
  );
}

/** "Removed …", saying how many links went with it. */
const removedWith = (label: string, links: number) =>
  links
    ? t("navigation.removedWith", { label: named(label), count: links })
    : t("navigation.removed", { label: named(label) });

/** Where a link goes, as the officer knows it: the page's address, or the website's. */
type Destination = (target: NavLink["target"]) => string;
const DestinationContext = createContext<Destination>(() => "");
const useDestination = () => useContext(DestinationContext);

/** One look-up of the site's pages for every row of the editor, by id. */
function useDestinationOf(): Destination {
  const pages = usePages();
  const paths = useMemo(() => new Map(pages.data?.map((p) => [p.id, p.path])), [pages.data]);
  return useCallback(
    (target) => {
      if (target.kind === "url") return hostOf(target.url) || t("navigation.noTarget");
      if (!target.pageId) return t("navigation.noTarget");
      return paths.get(target.pageId) ?? t("navigation.pageGone");
    },
    [paths],
  );
}

/** Remove, for a row that's open. Rows are reordered by their grips. */
function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <Button
      variant="danger-ghost"
      size="small"
      iconOnly
      className="shrink-0"
      onClick={onRemove}
      aria-label={t("navigation.remove", { label: name })}
    >
      <TrashIcon />
    </Button>
  );
}

/**
 * An item of a top-level list, a navbar item or a footer column: a card with its
 * grip and what it is (`children`); open, its remove button, and its editor under it.
 */
function SortableCard({
  sortId: id,
  index,
  label,
  open,
  warned,
  editor,
  onToggle,
  onRemove,
  children,
}: {
  sortId: string;
  index: number;
  label: string;
  open: boolean;
  warned: boolean;
  editor: ReactNode;
  onToggle: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const name = named(label);
  const { setNodeRef, style, dragging, handle } = useSortableRow(id, name);
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-card={index}
      className={clx(
        card,
        "flex flex-col gap-0.5 p-2 transition-colors duration-150 motion-reduce:transition-none",
        open ? "border-otl-primary-300" : "border-otl-gray-200",
        dragging && "shadow-card relative z-10",
      )}
    >
      <div
        className={clx(
          "flex items-center rounded-sm",
          open ? "bg-bg-primary-50" : "hover:bg-bg-washed",
        )}
      >
        {handle}
        <button
          type="button"
          data-select
          aria-expanded={open}
          onClick={onToggle}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left"
        >
          {children}
          {warned && (
            <>
              <WarningCircleIcon className="text-txt-warning size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t("navigation.hasWarning")}</span>
            </>
          )}
        </button>
        {/* Only the open card's actions show: nothing appears under a passing pointer. */}
        {open && <RemoveButton name={name} onRemove={onRemove} />}
      </div>
      {open && (
        <section
          aria-label={name}
          className="border-otl-gray-200 mt-1.5 flex flex-col gap-4 border-t px-2 pt-3 pb-2"
        >
          {editor}
        </section>
      )}
    </li>
  );
}

/** A navbar item's card: a link with where it goes, or a dropdown with its style and size. */
function NavTreeItem({
  item,
  index,
  selection,
  warned,
  editor,
  onSelect,
  onRemove,
}: {
  item: NavItem;
  index: number;
  selection: Selection;
  warned: boolean;
  editor: ReactNode;
  onSelect: (s: Selection) => void;
  onRemove: () => void;
}) {
  const id = String(index);
  const destination = useDestination();
  // Open when the item, or anything in its dropdown, is selected.
  const open = selection === id || Boolean(selection?.startsWith(`${id}.`));
  return (
    <SortableCard
      sortId={sortId("navbar", index)}
      index={index}
      label={item.label}
      open={open}
      warned={warned}
      editor={editor}
      // The open item's card closes it again.
      onToggle={() => onSelect(open ? null : id)}
      onRemove={onRemove}
    >
      {item.type === "dropdown" ? (
        <ChevronDownIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
      ) : (
        <LinkIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
      )}
      <RowLabel text={item.label} className="text-label-sm font-medium" />
      <span className="sr-only">, </span>
      {item.type === "dropdown" ? (
        <span className="text-label-compact text-txt-black-500 min-w-0 truncate font-normal">
          {t(layoutTags[item.layout])} · {t("navigation.summary.links", { count: linkCount(item) })}
        </span>
      ) : (
        <span className="text-label-compact text-txt-black-500 min-w-0 truncate font-normal">
          <span className="sr-only">{t("navigation.link")}, </span>
          {destination(item.target)}
        </span>
      )}
    </SortableCard>
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

type Layout = NavDropdown["layout"];

/**
 * A dropdown's style in miniature: its menu title and chevron, and the open menu
 * under it with the links laid out that way. Strong bars are what a visitor reads
 * first (a link, a heading); faint ones are the rest (a description, the links under
 * a heading). Colours come from the card, so the picked one turns primary.
 */
function LayoutSilhouette({ layout }: { layout: Layout }) {
  const strong = "fill-current";
  const faint = "fill-current opacity-30";
  return (
    <svg viewBox="0 0 96 64" aria-hidden className="h-auto w-full">
      {/* The menu title and its chevron. */}
      <rect x="6" y="5" width="20" height="3.5" rx="1.75" className={strong} />
      <path
        d="M29.5 5.5l2.25 2.25 2.25-2.25"
        className="stroke-current"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* The open menu. */}
      <rect
        x="4.5"
        y="14.5"
        width="87"
        height="45"
        rx="4"
        className="fill-bg-white stroke-otl-gray-200"
        strokeWidth="1"
      />
      {layout === "list" &&
        [22, 30, 38, 46].map((y, i) => (
          <rect
            key={y}
            x="12"
            y={y}
            width={[40, 30, 46, 26][i]}
            height="3.5"
            rx="1.75"
            className={strong}
          />
        ))}
      {layout === "described" &&
        [21, 33, 45].map((y) => (
          <g key={y}>
            <rect x="12" y={y} width="8" height="8" rx="2" className={faint} />
            <rect x="24" y={y} width="30" height="3.5" rx="1.75" className={strong} />
            <rect x="24" y={y + 5} width="52" height="2.5" rx="1.25" className={faint} />
          </g>
        ))}
      {layout === "grouped" &&
        [12, 38, 64].map((x) => (
          <g key={x}>
            <rect x={x} y="22" width="18" height="3.5" rx="1.75" className={strong} />
            {[30, 37, 44].map((y, i) => (
              <rect
                key={y}
                x={x}
                y={y}
                width={[16, 12, 14][i]}
                height="2.5"
                rx="1.25"
                className={faint}
              />
            ))}
          </g>
        ))}
    </svg>
  );
}

/**
 * A dropdown's style, as cards showing each one's shape. Their names are for
 * assistive technology and the tooltip; the line under them names the one picked
 * and says what it's for.
 */
function StylePicker({ value, onChange }: { value: Layout; onChange: (layout: Layout) => void }) {
  const id = useId();
  const layouts: Layout[] = ["list", "described", "grouped"];
  return (
    <div className="flex flex-col gap-2">
      <RadioCards
        legend={t("navigation.style")}
        value={value}
        onChange={onChange}
        describedBy={`${id}-hint`}
        className="grid grid-cols-3 gap-2"
        cardClassName="rounded-lg p-1.5"
        idleClassName="border-otl-gray-200 bg-bg-washed text-txt-black-500 hover:border-otl-gray-300 hover:text-txt-black-700"
        options={layouts.map((layout) => ({
          value: layout,
          label: t(`navigation.layout.${layout}`),
          content: <LayoutSilhouette layout={layout} />,
        }))}
        checkedMark={
          <span
            aria-hidden
            className="bg-bg-primary-600 text-txt-white absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full"
          >
            <CheckIcon className="size-3" />
          </span>
        }
      />
      <p id={`${id}-hint`} className="text-body-sm text-txt-black-700">
        <span className="text-txt-black-900 font-medium">{t(`navigation.layout.${value}`)}.</span>{" "}
        {t(`navigation.layout.${value}.hint`)}
      </p>
    </div>
  );
}

/** A link's own fields: its label, where it goes, and in a described dropdown its line and icon. */
function LinkFields({
  link,
  path,
  described,
  issue,
  touch,
  onChange,
}: Checks & {
  link: NavLink;
  path: string;
  described: boolean;
  onChange: (link: NavLink) => void;
}) {
  return (
    <>
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
          <DescriptionField
            name={`${path}.description`}
            value={link.description}
            max={120}
            onChange={(description) => onChange({ ...link, description })}
          />
          <IconPicker
            label={t("navigation.icon")}
            value={link.icon}
            sections={featureIconSections()}
            onChange={(icon) => onChange({ ...link, icon })}
          />
        </>
      )}
    </>
  );
}

/** A description: two lines to start, growing with what's typed. Empty is none. */
function DescriptionField({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: string | undefined;
  max: number;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Field name={name}>
      <FieldLabel>{t("navigation.description")}</FieldLabel>
      <TextArea
        rows={2}
        maxLength={max}
        // FTDS gives a text area a taller minimum; here it's two lines.
        className="field-sizing-content max-h-40 min-h-[calc(2lh+1.25rem+2px)]!"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </Field>
  );
}

/** A new, empty link: the officer picks where it goes, and its label follows a page's title. */
const blankLink = () => newLink(t("navigation.newLink"), { kind: "url", url: "" });

/** A link as a row: its grip reorders it, and the row opens its fields in a popover beside it. */
function LinkRow({
  link,
  path,
  open,
  warned,
  described,
  dragId,
  checks,
  onToggle,
  onChange,
  onRemove,
}: {
  link: NavLink;
  path: string;
  open: boolean;
  warned: boolean;
  described: boolean;
  /** Its id in its `SortableList`. */
  dragId: string;
  checks: Checks;
  onToggle: () => void;
  onChange: (link: NavLink) => void;
  onRemove: () => void;
}) {
  const destination = useDestination();
  const name = named(link.label);
  const { setNodeRef, style, dragging, handle } = useSortableRow(dragId, name);
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={clx("flex items-center gap-1", dragging && "relative z-10")}
    >
      {handle}
      <Popover open={open} onOpenChange={(next) => next !== open && onToggle()}>
        <PopoverTrigger
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by its children
          render={<button type="button" />}
          className={clx(
            "focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
            dragging && "shadow-card",
            open
              ? "border-otl-primary-300 bg-bg-primary-50"
              : "border-otl-gray-200 bg-bg-white hover:bg-bg-washed",
          )}
        >
          <RowLabel text={link.label} className="text-body-sm text-txt-black-900" />
          <span className="text-label-compact text-txt-black-500 min-w-0 flex-1 truncate font-normal">
            <span className="sr-only">, </span>
            {destination(link.target)}
          </span>
          {warned && (
            <>
              <WarningCircleIcon className="text-txt-warning size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t("navigation.hasWarning")}</span>
            </>
          )}
          <ChevronRightIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
        </PopoverTrigger>
        {/* Beside the row, over the preview: the list stays put, with no scrolling to the fields. */}
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          aria-label={name}
          className="flex max-h-[min(36rem,var(--available-height))] w-80 flex-col overflow-y-auto p-0"
        >
          <div className="border-otl-gray-200 flex items-center gap-2 border-b py-1.5 pr-1.5 pl-4">
            <h3 className="text-label-sm text-txt-black-900 min-w-0 flex-1 truncate font-semibold">
              {name}
            </h3>
            <RemoveButton name={name} onRemove={onRemove} />
          </div>
          <div className="flex flex-col gap-4 p-4">
            <LinkFields
              link={link}
              path={path}
              described={described}
              {...checks}
              onChange={onChange}
            />
          </div>
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** A titled part of the dropdown editor, in the order the dropdown shows them. */
function EditorSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3
        id={id}
        className="text-label-sm text-txt-black-900 flex items-baseline gap-1.5 font-semibold"
      >
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

/** A dashed "add" button at the end of a list. */
function AddRow({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="default-ghost"
      size="small"
      disabled={disabled}
      onClick={onClick}
      className="border-otl-gray-300 w-full justify-start border border-dashed"
    >
      <PlusIcon /> {children}
    </Button>
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

type ItemEditorProps = Checks & {
  item: NavItem;
  index: number;
  /** What's selected: the item, or a link in its dropdown. */
  at: Selection;
  warned: Set<Selection>;
  /** Another top-level item has the same label. */
  duplicate: boolean;
  update: (item: NavItem) => void;
  /** An update that removes something, which the officer can undo. */
  removeWith: (message: string, item: NavItem) => void;
  select: (s: Selection) => void;
};

function SelectedEditor(props: ItemEditorProps) {
  const { item, index, issue, touch, duplicate, update } = props;
  if (item.type === "dropdown") return <DropdownEditor {...props} item={item} />;
  const base = `navbar.${index}`;
  return (
    <>
      <TextInput
        name={`${base}.label`}
        label={t("navigation.label")}
        value={item.label}
        max={60}
        error={issue(`${base}.label`)}
        warning={duplicate ? t("navigation.duplicate") : undefined}
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
    </>
  );
}

/**
 * A dropdown, all in one place and in the order visitors see it: what it's called
 * and how it's laid out, its links (or columns of links), then its extras. A link
 * opens in place to edit it; one at a time.
 */
function DropdownEditor({
  item,
  index,
  at,
  warned,
  issue,
  touch,
  duplicate,
  update,
  removeWith,
  select,
}: ItemEditorProps & { item: NavDropdown }) {
  const id = String(index);
  const base = `navbar.${index}`;
  const checks = { issue, touch };
  const sel = parse(at);
  const links = item.links;
  const firstTarget = links[0]?.target ??
    item.groups[0]?.links[0]?.target ?? { kind: "url" as const, url: "" };

  const setGroup = (g: number, next: NavDropdown["groups"][number]) =>
    update({ ...item, groups: item.groups.map((x, k) => (k === g ? next : x)) });

  return (
    <>
      <EditorSection title={t("navigation.dropdown.menu")}>
        <TextInput
          name={`${base}.label`}
          label={t("navigation.menuTitle")}
          value={item.label}
          max={60}
          error={issue(`${base}.label`)}
          warning={duplicate ? t("navigation.duplicate") : undefined}
          onBlur={() => touch(`${base}.label`)}
          onChange={(label) => update({ ...item, label })}
        />
        <StylePicker value={item.layout} onChange={(layout) => update(setLayout(item, layout))} />
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
      </EditorSection>

      <hr className="border-otl-gray-200 m-0" />

      {item.layout === "grouped" ? (
        <EditorSection
          title={t("navigation.columns")}
          aside={
            <span className="text-txt-black-500 font-normal tabular-nums">
              {item.groups.length}
            </span>
          }
        >
          {item.groups.map((group, g) => {
            const heading = named(group.heading);
            const openHere = sel.part === "groupLink" && sel.group === g ? sel.link : undefined;
            return (
              <div
                // oxlint-disable-next-line react/no-array-index-key -- columns have no ids
                key={g}
                className="bg-bg-washed border-otl-gray-200 rounded-lg border p-3"
              >
                <ColumnEditor
                  path={`${base}.groups.${g}`}
                  listId={`g${g}`}
                  column={group}
                  open={openHere}
                  warnedLink={(j) => warned.has(`${id}.g.${g}.l.${j}`)}
                  checks={checks}
                  onChange={(next) => setGroup(g, next)}
                  onOpen={(j) => select(j === null ? id : `${id}.g.${g}.l.${j}`)}
                  onRemoveLink={(j) => {
                    removeWith(removedWith(group.links[j]?.label ?? "", 0), {
                      ...item,
                      groups: item.groups.map((x, k) =>
                        k === g ? { ...x, links: x.links.filter((_, m) => m !== j) } : x,
                      ),
                    });
                    select(id);
                  }}
                  onRemove={() => {
                    removeWith(removedWith(heading, group.links.length), {
                      ...item,
                      groups: item.groups.filter((_, k) => k !== g),
                    });
                    select(id);
                  }}
                />
              </div>
            );
          })}
          <AddRow
            onClick={() =>
              update({
                ...item,
                groups: [...item.groups, { heading: t("navigation.newColumn"), links: [] }],
              })
            }
          >
            {t("navigation.addColumn")}
          </AddRow>
        </EditorSection>
      ) : (
        <EditorSection
          title={t("navigation.dropdown.links")}
          aside={
            <span className="text-txt-black-500 font-normal tabular-nums">{links.length}</span>
          }
        >
          <LinkList
            path={`${base}.links`}
            listId="links"
            links={links}
            open={sel.part === "link" ? sel.link : undefined}
            warnedLink={(j) => warned.has(`${id}.l.${j}`)}
            described={item.layout === "described"}
            max={16}
            addLabel={t("navigation.addLink")}
            checks={checks}
            onChange={(next) => update({ ...item, links: next })}
            onOpen={(j) => select(j === null ? id : `${id}.l.${j}`)}
            onRemove={(j) => {
              removeWith(removedWith(links[j]?.label ?? "", 0), {
                ...item,
                links: links.filter((_, k) => k !== j),
              });
              select(id);
            }}
          />
        </EditorSection>
      )}

      <hr className="border-otl-gray-200 m-0" />

      <EditorSection title={t("navigation.dropdown.extras")}>
        <SwitchRow
          title={t("navigation.feature")}
          hint={t("navigation.feature.hint")}
          checked={Boolean(item.feature)}
          onCheckedChange={(on) =>
            update({
              ...item,
              feature: on ? { title: item.label, target: firstTarget } : undefined,
            })
          }
        />
        {item.feature && (
          <FeatureFields
            feature={item.feature}
            base={`${base}.feature`}
            checks={checks}
            onChange={(feature) => update({ ...item, feature })}
          />
        )}
        <SwitchRow
          title={t("navigation.footerLink")}
          hint={t("navigation.footerLink.hint")}
          checked={Boolean(item.footerLink)}
          onCheckedChange={(on) =>
            update({
              ...item,
              footerLink: on
                ? { text: t("navigation.footerLink.default"), target: firstTarget }
                : undefined,
            })
          }
        />
        {item.footerLink && (
          <Extra>
            <TextInput
              name={`${base}.footerLink.text`}
              label={t("navigation.label")}
              value={item.footerLink.text}
              max={60}
              error={issue(`${base}.footerLink.text`)}
              onBlur={() => touch(`${base}.footerLink.text`)}
              onChange={(text) =>
                item.footerLink && update({ ...item, footerLink: { ...item.footerLink, text } })
              }
            />
            <TargetField
              name={`${base}.footerLink.target`}
              value={item.footerLink.target}
              error={targetIssue(issue, `${base}.footerLink.target`)}
              onBlur={touchTarget(touch, `${base}.footerLink.target`)}
              onChange={(target) =>
                item.footerLink && update({ ...item, footerLink: { ...item.footerLink, target } })
              }
            />
          </Extra>
        )}
      </EditorSection>
    </>
  );
}

/** An extra's fields, right under the switch that turned it on. */
function Extra({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-washed border-otl-gray-200 -mt-1 flex flex-col gap-4 rounded-lg border p-3">
      {children}
    </div>
  );
}

function FeatureFields({
  feature,
  base,
  checks: { issue, touch },
  onChange,
}: {
  feature: NonNullable<NavDropdown["feature"]>;
  base: string;
  checks: Checks;
  onChange: (feature: NonNullable<NavDropdown["feature"]>) => void;
}) {
  const set = (next: Partial<typeof feature>) => onChange({ ...feature, ...next });
  return (
    <Extra>
      <TextInput
        name={`${base}.eyebrow`}
        label={t("navigation.feature.eyebrow")}
        value={feature.eyebrow ?? ""}
        max={40}
        onChange={(eyebrow) => set({ eyebrow: eyebrow || undefined })}
      />
      <TextInput
        name={`${base}.title`}
        label={t("navigation.feature.title")}
        value={feature.title}
        max={80}
        error={issue(`${base}.title`)}
        onBlur={() => touch(`${base}.title`)}
        onChange={(title) => set({ title })}
      />
      <DescriptionField
        name={`${base}.description`}
        value={feature.description}
        max={200}
        onChange={(description) => set({ description })}
      />
      <TargetField
        name={`${base}.target`}
        value={feature.target}
        error={targetIssue(issue, `${base}.target`)}
        onBlur={touchTarget(touch, `${base}.target`)}
        onChange={(target) => set({ target })}
      />
      <TextInput
        name={`${base}.linkText`}
        label={t("navigation.feature.linkText")}
        value={feature.linkText ?? ""}
        max={40}
        onChange={(linkText) => set({ linkText: linkText || undefined })}
      />
    </Extra>
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

/**
 * A list of links: each row dragged by its grip and opened in a popover, then a row
 * to add one. A dropdown's links and a column's links are edited the same way.
 */
function LinkList({
  path,
  listId,
  links,
  open,
  warnedLink,
  described,
  max,
  addLabel,
  checks,
  onChange,
  onOpen,
  onRemove,
}: {
  /** Where the links are in the navigation, for their problems: "footer.columns.0.links". */
  path: string;
  /** The list's name, for dragging. */
  listId: string;
  links: NavLink[];
  /** The link open in its popover. */
  open: number | undefined;
  warnedLink: (j: number) => boolean;
  described: boolean;
  max: number;
  addLabel: string;
  checks: Checks;
  onChange: (links: NavLink[]) => void;
  onOpen: (j: number | null) => void;
  onRemove: (j: number) => void;
}) {
  return (
    <>
      {links.length > 0 && (
        <SortableList
          ids={sortIds(listId, links.length)}
          names={links.map((l) => named(l.label))}
          onMove={(from, to) => {
            onChange(moveItem(links, from, to));
            if (open !== undefined) onOpen(shifted(open, from, to));
          }}
        >
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {links.map((link, j) => (
              <LinkRow
                // oxlint-disable-next-line react/no-array-index-key -- links have no ids
                key={j}
                link={link}
                path={`${path}.${j}`}
                open={open === j}
                warned={warnedLink(j)}
                described={described}
                dragId={sortId(listId, j)}
                checks={checks}
                onToggle={() => onOpen(open === j ? null : j)}
                onChange={(next) => onChange(editLink(links, j, next))}
                onRemove={() => onRemove(j)}
              />
            ))}
          </ol>
        </SortableList>
      )}
      <AddRow
        disabled={links.length >= max}
        onClick={() => {
          onChange([...links, blankLink()]);
          onOpen(links.length);
        }}
      >
        {addLabel}
      </AddRow>
    </>
  );
}

type Column = { heading: string; links: NavLink[] };

/**
 * A titled column of links: its heading, its links (dragged by their grips, each
 * opening in a popover), and a way to add one. A footer column and a column in a
 * titled dropdown are the same thing, so they're edited the same way.
 */
function ColumnEditor({
  path,
  listId,
  column,
  open,
  warnedLink,
  checks,
  onChange,
  onOpen,
  onRemoveLink,
  onRemove,
}: {
  /** Where its fields are in the navigation, for their problems: "footer.columns.0". */
  path: string;
  /** Its links' list, for dragging. */
  listId: string;
  column: Column;
  /** The link open in its popover. */
  open: number | undefined;
  warnedLink: (j: number) => boolean;
  checks: Checks;
  onChange: (column: Column) => void;
  onOpen: (j: number | null) => void;
  onRemoveLink: (j: number) => void;
  /** A remove button beside the heading, where the column has no row of its own. */
  onRemove?: () => void;
}) {
  const { issue, touch } = checks;
  const { links } = column;
  const heading = named(column.heading);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1">
        <div className="min-w-0 flex-1">
          <TextInput
            name={`${path}.heading`}
            label={t("navigation.heading")}
            value={column.heading}
            max={60}
            error={issue(`${path}.heading`)}
            onBlur={() => touch(`${path}.heading`)}
            onChange={(next) => onChange({ ...column, heading: next })}
          />
        </div>
        {onRemove && <RemoveButton name={heading} onRemove={onRemove} />}
      </div>
      <LinkList
        path={`${path}.links`}
        listId={listId}
        links={links}
        open={open}
        warnedLink={warnedLink}
        described={false}
        max={12}
        addLabel={t("navigation.addLinkTo", { label: heading })}
        checks={checks}
        onChange={(next) => onChange({ ...column, links: next })}
        onOpen={onOpen}
        onRemove={onRemoveLink}
      />
    </div>
  );
}

function FooterEditor({
  draft,
  setDraft,
  remove,
  issue,
  touch,
  warnedPaths,
}: EditorProps & {
  /** Where the footer's warnings are: "footer.columns.0.links.1.target.pageId". */
  warnedPaths: string[];
}) {
  const columns = draft.footer.columns;
  const full = columns.length >= MAX_COLUMNS;
  const setColumns = (next: typeof columns) =>
    setDraft((d) => ({ ...d, footer: { columns: next } }));
  const setColumn = (c: number, next: Column) =>
    setColumns(columns.map((x, k) => (k === c ? next : x)));
  // The column open, and the link open in it: one at a time, like the navbar's.
  const [openColumn, setOpenColumn] = useState<number | null>(null);
  const [openLink, setOpenLink] = useState<number | null>(null);
  const warnedUnder = (prefix: string) => warnedPaths.some((w) => w.startsWith(prefix));

  const addColumn = () => {
    if (full) return;
    setColumns([...columns, { heading: t("navigation.newColumn"), links: [] }]);
    setOpenColumn(columns.length);
    setOpenLink(null);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="footer-columns" className="text-label-sm text-txt-black-900 font-semibold">
            {t("navigation.footer.columns")}{" "}
            <span className="text-txt-black-500 font-normal tabular-nums">
              {t("navigation.count", { count: columns.length, max: MAX_COLUMNS })}
            </span>
          </h2>
          <p className="text-body-sm text-txt-black-700">{t("navigation.footer.hint")}</p>
        </div>
        <Button
          variant="primary-ghost"
          size="small"
          disabled={full}
          onClick={addColumn}
          aria-label={t("navigation.addColumn")}
        >
          <PlusIcon /> {t("navigation.add")}
        </Button>
      </div>
      <SortableList
        ids={sortIds("footer", columns.length)}
        names={columns.map((column) => named(column.heading))}
        onMove={(from, to) => {
          setColumns(moveItem(columns, from, to));
          if (openColumn !== null) setOpenColumn(shifted(openColumn, from, to));
        }}
      >
        <ol aria-labelledby="footer-columns" className="m-0 flex list-none flex-col gap-3 p-0">
          {columns.map((column, c) => {
            const open = openColumn === c;
            return (
              <SortableCard
                // oxlint-disable-next-line react/no-array-index-key -- columns have no ids
                key={c}
                sortId={sortId("footer", c)}
                index={c}
                label={column.heading}
                open={open}
                warned={warnedUnder(`footer.columns.${c}.`)}
                onToggle={() => {
                  setOpenColumn(open ? null : c);
                  setOpenLink(null);
                }}
                onRemove={() => {
                  remove(removedWith(named(column.heading), column.links.length), (d) => ({
                    ...d,
                    footer: { columns: columns.filter((_, k) => k !== c) },
                  }));
                  setOpenColumn(null);
                }}
                editor={
                  <ColumnEditor
                    path={`footer.columns.${c}`}
                    listId={`footer-${c}`}
                    column={column}
                    open={open ? (openLink ?? undefined) : undefined}
                    warnedLink={(j) => warnedUnder(`footer.columns.${c}.links.${j}.`)}
                    checks={{ issue, touch }}
                    onChange={(next) => setColumn(c, next)}
                    onOpen={setOpenLink}
                    onRemoveLink={(j) => {
                      remove(removedWith(column.links[j]?.label ?? "", 0), (d) => ({
                        ...d,
                        footer: {
                          columns: columns.map((x, k) =>
                            k === c ? { ...x, links: x.links.filter((_, m) => m !== j) } : x,
                          ),
                        },
                      }));
                      setOpenLink(null);
                    }}
                  />
                }
              >
                <RowLabel text={column.heading} className="text-label-sm font-medium" />
                <span className="sr-only">, </span>
                <span className="text-label-compact text-txt-black-500 min-w-0 truncate font-normal">
                  {t("navigation.summary.links", { count: column.links.length })}
                </span>
              </SortableCard>
            );
          })}
          {columns.length === 0 && (
            <li
              className={`${card} border-otl-gray-200 text-body-sm text-txt-black-700 border-dashed px-4 py-6 text-center shadow-none`}
            >
              {t("navigation.footer.empty")}
            </li>
          )}
        </ol>
      </SortableList>
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
      focus={part === "footer" ? "footer" : "header"}
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
