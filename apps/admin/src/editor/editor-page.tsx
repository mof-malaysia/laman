/**
 * The editor: a toolbar row, then the Layers and Insert column, the canvas,
 * and the properties panel.
 */
import { type BlockType, type PageDocument, blocksFor, isCollectionBlock } from "@fiscal-sb/blocks";
import type { DraftConflict, Page } from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { redirectTarget } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { DesktopIcon } from "@/components/ui/icons/desktop";
import { ArrowBackIcon } from "@/components/ui/icons/arrow-back";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MobileIcon } from "@/components/ui/icons/mobile";
import { RedoIcon } from "@/components/ui/icons/redo";
import { TabletIcon } from "@/components/ui/icons/tablet";
import { UndoIcon } from "@/components/ui/icons/undo";
import { useCommands } from "@/components/ui/shortcuts";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/app-shell";
import { t } from "@/i18n";
import { blockLabel } from "@/i18n/registry";
import { ConflictDialog } from "@/components/conflict-dialog";
import {
  PageCheckList,
  checksDescription,
  checksKey,
  checksLabel,
  stops,
  usePageChecks,
} from "@/components/page-checks";
import { apiError, conflictOf, pagesApi, statusOf } from "@/lib/api";
import { useCan, useMe } from "@/lib/auth";
import { PageBreadcrumb } from "@/shell/page-breadcrumb";
import { localDrafts } from "@/lib/local-drafts";
import { sessionLost } from "@/lib/session";
import { useStore } from "@/lib/store";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { formatDateTime, isHome, previewHref, usePages, useRefreshPages } from "@/lib/pages";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { EllipsisVerticalIcon } from "@/components/ui/icons/ellipsis-vertical";
import type { SettingsSection } from "@/pages/site/search";
import { PageDrawer, type PanelSearch, type PanelTab } from "./page-drawer";
import { SettingIcon } from "@/components/ui/icons/setting";
import { BlockPicker } from "./block-picker";
import { type BlockAction, Canvas, type CanvasWidth, type CanvasZoom } from "./canvas";
import { LeftColumn } from "./layers";
import { EmptyPanel } from "./empty-panel";
import { PagePanel } from "./page-panel";
import { PropertyPanel } from "./property-panel";
import { type SaveState, PublishControl } from "@/components/publish-control";
import type { LiveState } from "@/lib/publish";
import { editorReducer, initialState } from "./state";
import { useNow } from "@/lib/use-now";

export function EditorPage() {
  const { id } = useParams({ from: "/signed-in/shell/pages/$id/edit" });
  // Loaded once: from here the editor owns the draft and saves it.
  const page = useQuery({
    queryKey: ["page", id],
    queryFn: () => pagesApi.get(id),
    staleTime: Infinity,
  });
  // Loading someone else's version starts the editor again from it.
  const [loads, setLoads] = useState(0);
  const reload = useCallback(async () => {
    await page.refetch();
    setLoads((n) => n + 1);
  }, [page]);

  if (page.isPending)
    return (
      <output className="flex h-full items-center justify-center gap-2">
        <Spinner /> {t("editor.loading")}
      </output>
    );
  if (page.isError)
    return (
      <div className="p-surface mx-auto max-w-xl">
        <Callout variant="danger">
          <CalloutTitle>{t("editor.loadFailed")}</CalloutTitle>
        </Callout>
      </div>
    );
  return <Editor key={`${page.data.id}:${loads}`} page={page.data} onReload={reload} />;
}

const SAVE_DELAY_MS = 800;
const RETRY_MS = 3000;
const RETRY_MAX_MS = 60_000;

/**
 * Saves the draft a moment after the last change, one save at a time, from
 * the version it started from, and keeps unsaved changes in this browser
 * until they're saved. What stops saving is said, not retried: invalid
 * fields, someone else's save in between (`conflict`), the sign-in running
 * out (it carries on once they've signed in again), the page gone or no
 * longer theirs to edit. Only a server that can't be reached is retried,
 * less often each time. Leaving the editor saves what's left.
 */
function useAutosave(page: Page, doc: PageDocument) {
  const refresh = useRefreshPages();
  const queryClient = useQueryClient();
  const { username } = useMe();
  const [state, setState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(page.updatedAt);
  const [conflict, setConflict] = useState<DraftConflict>();
  // Failed tries in a row while the server can't be reached; each waits longer.
  const [failures, setFailures] = useState(0);
  const saved = useRef(page.draft);
  const version = useRef(page.draftVersion);
  const latestDoc = useRef(doc);
  const latestState = useRef(state);
  useLayoutEffect(() => {
    latestDoc.current = doc;
    latestState.current = state;
  });
  const inFlight = useRef<Promise<unknown> | null>(null);

  const keepLocally = useCallback(() => {
    if (latestDoc.current === saved.current) localDrafts.clear(page.id);
    else
      localDrafts.write(page.id, {
        doc: latestDoc.current,
        base: version.current,
        at: new Date().toISOString(),
        username,
      });
  }, [page.id, username]);

  const save = useCallback(async () => {
    while (inFlight.current) await inFlight.current;
    const draft = latestDoc.current;
    if (draft === saved.current || halted.has(latestState.current)) return;
    setState("saving");
    const request = pagesApi.saveDraft(page.id, draft, version.current);
    inFlight.current = request;
    try {
      const result = await request;
      saved.current = draft;
      version.current = result.draftVersion;
      setFailures(0);
      setSavedAt(result.updatedAt);
      setState(latestDoc.current === draft ? "saved" : "unsaved");
      keepLocally();
      void refresh();
      void queryClient.invalidateQueries({ queryKey: checksKey(page.id) });
    } catch (error) {
      const [body, conflicted, status] = [
        await apiError(error),
        await conflictOf(error),
        statusOf(error),
      ];
      if (conflicted) {
        setConflict(conflicted);
        setState("conflict");
      } else if (body?.code === "validation_error") setState("invalid");
      else if (status === 401) setState("signedOut");
      else if (status === 403 || status === 404) setState(status === 403 ? "forbidden" : "gone");
      else {
        console.error(body ?? error);
        setState("retrying");
        setFailures((n) => n + 1);
      }
    } finally {
      inFlight.current = null;
    }
  }, [page.id, refresh, keepLocally, queryClient]);

  useEffect(() => {
    if (doc === saved.current) return;
    setState((current) => (halted.has(current) ? current : "unsaved"));
    const timer = setTimeout(() => {
      keepLocally();
      void save();
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, save, keepLocally]);

  // Signed out mid-save: carry on once they've signed in again (SignInAgain).
  const lost = useStore(sessionLost);
  const wasLost = useRef(false);
  useEffect(() => {
    if (lost) wasLost.current = true;
  }, [lost]);
  useEffect(() => {
    if (state !== "signedOut" || lost || !wasLost.current) return;
    wasLost.current = false;
    void save();
  }, [state, lost, save]);

  useEffect(() => {
    if (failures === 0) return;
    const timer = setTimeout(
      () => void save(),
      Math.min(RETRY_MS * 2 ** (failures - 1), RETRY_MAX_MS),
    );
    return () => clearTimeout(timer);
  }, [failures, save]);

  // Leaving the editor saves the rest.
  const latestSave = useRef(save);
  useLayoutEffect(() => {
    latestSave.current = save;
  });
  useEffect(() => () => void latestSave.current(), []);

  /** Keep mine: save again from their version, replacing it. */
  const keepMine = useCallback(async () => {
    if (conflict) version.current = conflict.version;
    setConflict(undefined);
    latestState.current = "unsaved";
    setState("unsaved");
    await save();
  }, [conflict, save]);

  /** For publishing: saves, and throws when what's on screen isn't saved after all. */
  const ensureSaved = useCallback(async () => {
    await save();
    if (latestDoc.current !== saved.current) throw new Error(`Not saved: ${state}`);
  }, [save, state]);

  /** Saves from `base` from now on: for changes brought back from the browser. */
  const rebase = useCallback((from: string) => {
    version.current = from;
  }, []);

  return { state, savedAt, conflict, flush: save, ensureSaved, keepMine, rebase };
}

/** Save states that only a person can clear: nothing more is sent until they do. */
const halted: ReadonlySet<SaveState> = new Set(["conflict", "forbidden", "gone"]);

/** A listing page's entry list (or event calendar) can move, but not go: adding the other replaces it. */
const required = (block: { type: BlockType }) => isCollectionBlock(block.type);

const liveState: Record<Page["status"], LiveState> = {
  published: "live",
  changed: "changed",
  draft: "new",
  scheduled: "scheduled",
};

/** When the live copy was published, for the status tooltip. */
const publishedDetail = (page: Pick<Page, "status" | "publishedAt">) =>
  page.status === "draft" || !page.publishedAt
    ? t("editor.status.draft")
    : t("editor.status.published", { date: formatDateTime(page.publishedAt) });

const widthIcons = { desktop: DesktopIcon, tablet: TabletIcon, mobile: MobileIcon };

function Editor({ page, onReload }: { page: Page; onReload: () => Promise<void> }) {
  const [state, dispatch] = useReducer(editorReducer, page.draft, initialState);
  const me = useMe();
  // Changes this browser kept from last time that never reached the server.
  const [kept, setKept] = useState(() => {
    const local = localDrafts.read(page.id, me.username);
    // Kept from this very version and the same as it: nothing was lost after all.
    const same =
      local?.base === page.draftVersion && JSON.stringify(local.doc) === JSON.stringify(page.draft);
    return local && !same ? local : undefined;
  });
  const autosave = useAutosave(page, state.doc);
  // Checked as saved: each save refreshes it, and Publish shows it first.
  const checks = usePageChecks(page.id);
  const stopped = stops(checks.data);
  const canPublish = useCan("content.publish");
  // What the checks found, on hand while editing; open on arrival from the publish list.
  // Open while the address says so, as the publish list's link does: closing it
  // drops `?checks`, so a reload or Back doesn't bring it back.
  const search = useSearch({ strict: false }) as { checks?: boolean } & PanelSearch;
  const showChecks = search.checks === true;
  const navigate = useNavigate();
  /** Opens the page drawer at a tab (and a Settings section), or closes it. */
  const setPanel = (panel?: PanelTab, section?: SettingsSection) =>
    void navigate({
      to: "/pages/$id/edit",
      params: { id: page.id },
      search: panel ? { panel, ...(section && { section }) } : {},
      replace: true,
    });
  const setShowChecks = (open: boolean) =>
    void navigate({
      to: "/pages/$id/edit",
      params: { id: page.id },
      search: open ? { checks: true } : {},
      replace: true,
    });
  /** Selects the block a check is about, then closes whatever listed it. */
  const showCheck = (close: () => void) => (blockId: string) => {
    dispatch({ type: "select", id: blockId });
    close();
  };
  const pages = usePages();
  const [width, setWidth] = useState<CanvasWidth>("desktop");
  const [zoom, setZoom] = useState<CanvasZoom>("fit");
  const wide = useMediaQuery("(min-width: 768px)");
  // The page structure gives its column to the canvas on a laptop, where a desktop page
  // would otherwise run off the side. Once the officer chooses, their choice stands.
  const roomy = useMediaQuery("(min-width: 1640px)");
  const [structureChoice, setStructureChoice] = useState<boolean | null>(() => {
    try {
      const stored = localStorage.getItem(STRUCTURE_KEY);
      return stored === null ? null : stored === "1";
    } catch {
      return null;
    }
  });
  const showStructure = structureChoice ?? roomy;
  const toggleStructure = () => {
    const next = !showStructure;
    setStructureChoice(next);
    try {
      localStorage.setItem(STRUCTURE_KEY, next ? "1" : "0");
    } catch {
      // Blocked storage: the choice lasts for this visit.
    }
  };
  // On a phone, whether the page's own settings are open in place of the block list.
  // The canvas needs the room: the sidebar folds to its icons while editing, and is put
  // back as the officer had it when they leave.
  const sidebar = useSidebar();
  const sidebarWas = useRef(sidebar.open);
  const setSidebar = sidebar.setOpen;
  useEffect(() => {
    const was = sidebarWas.current;
    const restore = () => setSidebar(was);
    setSidebar(false);
    // The shell remembers the sidebar per browser: a reload or a closed tab mid-edit
    // must not leave it folded everywhere else.
    window.addEventListener("pagehide", restore);
    return () => {
      window.removeEventListener("pagehide", restore);
      restore();
    };
  }, [setSidebar]);
  // The Add block picker, open with where the block goes.
  const [picker, setPicker] = useState<{ at: number } | null>(null);
  const blocks = state.doc.ms.blocks;
  const selected = blocks.find((b) => b.id === state.selected) ?? null;
  const summary = pages.data?.find((p) => p.id === page.id) ?? page;
  const allowed = blocksFor(page.kind);
  const isRequired = (id: string) => blocks.some((b) => b.id === id && required(b));
  const entry = state.doc.entry;
  const now = useNow();
  const future = entry ? Date.parse(entry.publishAt) > now : false;
  const redirect = redirectTarget({ ...summary, redirect: state.doc.redirect ?? null }, pages.data);

  const add = (blockType: BlockType, at?: number) => dispatch({ type: "add", blockType, at });
  const remove = (id: string) => {
    if (!isRequired(id)) dispatch({ type: "remove", id });
  };
  const duplicate = (id: string) => {
    if (!isRequired(id)) dispatch({ type: "duplicate", id });
  };
  const blockAction = (action: BlockAction, id: string) => {
    if (action === "duplicate") duplicate(id);
    else if (action === "delete") remove(id);
    else dispatch({ type: "select", id });
  };
  const preview = () => {
    void autosave.flush();
    window.open(previewHref(page.id), "_blank", "noopener");
  };

  const group = t("editor.commands");
  useCommands([
    {
      id: "editor.addBlock",
      title: t("editor.insert.here"),
      group,
      combo: "a",
      run: () => setPicker({ at: blocks.length }),
    },
    {
      id: "editor.save",
      title: t("editor.save"),
      group,
      combo: "mod+s",
      allowInInput: true,
      run: () => void autosave.flush(),
    },
    {
      id: "editor.undo",
      title: t("editor.undo"),
      group,
      combo: "mod+z",
      run: () => dispatch({ type: "undo" }),
    },
    {
      id: "editor.redo",
      title: t("editor.redo"),
      group,
      combo: "mod+shift+z",
      run: () => dispatch({ type: "redo" }),
    },
    {
      id: "editor.duplicate",
      title: t("editor.block.duplicate"),
      group,
      combo: "mod+d",
      run: () => selected && dispatch({ type: "duplicate", id: selected.id }),
    },
    {
      id: "editor.delete",
      title: t("editor.block.delete"),
      group,
      combo: "backspace",
      run: () => selected && remove(selected.id),
    },
    {
      id: "editor.next",
      title: t("editor.next"),
      group,
      combo: "arrowdown",
      hidden: true,
      run: () => dispatch({ type: "step", by: 1 }),
    },
    {
      id: "editor.previous",
      title: t("editor.previous"),
      group,
      combo: "arrowup",
      hidden: true,
      run: () => dispatch({ type: "step", by: -1 }),
    },
    {
      id: "editor.deselect",
      title: t("editor.deselect"),
      group,
      combo: "escape",
      hidden: true,
      run: () => dispatch({ type: "select", id: null }),
    },
    {
      id: "editor.width.desktop",
      title: t("editor.width.desktop"),
      group,
      combo: "1",
      run: () => setWidth("desktop"),
    },
    {
      id: "editor.width.tablet",
      title: t("editor.width.tablet"),
      group,
      combo: "2",
      run: () => setWidth("tablet"),
    },
    {
      id: "editor.width.mobile",
      title: t("editor.width.mobile"),
      group,
      combo: "3",
      run: () => setWidth("mobile"),
    },
    { id: "editor.preview", title: t("editor.preview"), group, run: preview },
    {
      id: "editor.pageSettings",
      title: t("editor.drawer.open"),
      group,
      combo: "shift+s",
      run: () => setPanel("details"),
    },
    ...allowed.map((type) => ({
      id: `editor.insert.${type}`,
      title: t("editor.insert.block", { block: blockLabel(type) }),
      group: t("editor.insert.group"),
      run: () => add(type),
    })),
  ]);

  // Where the publish control puts its status: by undo and redo, once the bar is drawn.
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const publishControl = (
    <PublishControl
      live={liveState[summary.status]}
      save={autosave.state}
      savedAt={autosave.savedAt}
      detail={publishedDetail(summary)}
      beforePublish={autosave.ensureSaved}
      review={
        checks.data?.length
          ? {
              title: t("checks.review.title"),
              description: checksDescription(checks.data),
              blocked: stopped,
              confirm: t("checks.publishAnyway"),
              renderBody: (close) => (
                <PageCheckList checks={checks.data} onShow={showCheck(close)} />
              ),
            }
          : undefined
      }
      onPublish={() => pagesApi.publish(page.id)}
      viewPath={summary.path}
      pageId={page.id}
      statusIn={statusSlot}
      compact
      badge={
        checks.data?.length
          ? { count: checks.data.length, label: checksLabel(checks.data), danger: stopped }
          : undefined
      }
      label={
        page.kind !== "entry"
          ? t("editor.publish")
          : future
            ? summary.status === "scheduled"
              ? t("editor.schedule.update")
              : t("editor.schedule")
            : t("editor.publishEntry")
      }
    />
  );
  // Whether Publish can be pressed: something to publish, by someone who may.
  const publishable =
    canPublish && !(liveState[summary.status] === "live" && autosave.state === "saved");
  const bringBack = () => {
    if (!kept) return;
    // Saved from the version they started from, so a page someone has saved since asks first.
    autosave.rebase(kept.base);
    dispatch({ type: "setDoc", update: () => kept.doc, key: "kept", rerender: true });
    setKept(undefined);
  };
  /** Nothing more can be saved here: the page is gone, or no longer theirs to edit. */
  const stoppedNotice = (autosave.state === "forbidden" || autosave.state === "gone") && (
    <div className="bg-bg-danger-50 flex shrink-0 items-center gap-3 px-3 py-2">
      <p className="text-body-sm text-txt-danger flex-1">
        {t(autosave.state === "gone" ? "editor.gone" : "editor.forbidden")}
      </p>
    </div>
  );
  /** Changes from last time, kept in this browser: bring them back, or let them go. */
  const keptNotice = kept && (
    <div className="bg-bg-primary-50 flex shrink-0 items-center gap-3 px-3 py-2">
      <p className="text-body-sm text-txt-primary flex-1">
        {t("editor.kept", { when: formatDateTime(kept.at) })}
      </p>
      <Button
        variant="default-ghost"
        size="small"
        onClick={() => {
          localDrafts.clear(page.id);
          setKept(undefined);
        }}
      >
        {t("editor.kept.discard")}
      </Button>
      <Button variant="primary-outline" size="small" onClick={bringBack}>
        {t("editor.kept.bringBack")}
      </Button>
    </div>
  );
  const redirectNotice = redirect !== null && (
    <div className="bg-bg-warning-50 flex shrink-0 items-center gap-3 px-3 py-2">
      <p className="text-body-sm text-txt-warning flex-1">
        {t("editor.redirect.notice", { target: redirect })}
      </p>
      <Button
        variant="default-outline"
        size="small"
        onClick={() =>
          dispatch({
            type: "setDoc",
            update: (d) => ({ ...d, redirect: null }),
            key: "redirect",
          })
        }
      >
        {t("editor.redirect.off")}
      </Button>
    </div>
  );
  const leftColumn = (
    <LeftColumn
      blocks={blocks}
      selected={state.selected}
      onSelect={(id) => dispatch({ type: "select", id })}
      onAddBlock={() => setPicker({ at: blocks.length })}
      onMove={(from, to) => dispatch({ type: "move", from, to })}
      onDuplicate={duplicate}
      required={required}
      onRemove={remove}
    />
  );
  const propertyPanel = selected && (
    <PropertyPanel
      key={selected.id}
      block={selected}
      onChange={(props, key) =>
        dispatch({ type: "setProps", id: selected.id, props, source: "panel", key })
      }
      onRemove={() => remove(selected.id)}
    />
  );
  const pagePanel = (
    <PagePanel
      page={{ ...page, ...summary }}
      doc={state.doc}
      onDoc={(update, key, rerender) => dispatch({ type: "setDoc", update, key, rerender })}
    />
  );
  const blockPicker = (
    <BlockPicker
      open={picker !== null}
      allowed={allowed}
      onOpenChange={(open) => !open && setPicker(null)}
      onPick={(type) => {
        add(type, picker?.at);
        setPicker(null);
      }}
    />
  );
  const conflictDialog = (
    <ConflictDialog
      conflict={autosave.conflict}
      what={t("conflict.thisPage")}
      keptInHistory
      onLoadTheirs={async () => {
        localDrafts.clear(page.id);
        await onReload();
      }}
      onKeepMine={autosave.keepMine}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* One bar, three parts: where am I (and undo), how I see it, the page itself. */}
      <div
        role="toolbar"
        aria-label={t("editor.toolbar")}
        className="bg-bg-gray-50 border-otl-gray-200 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:gap-3 md:py-0"
      >
        {/* The part that gives way when the bar is narrow. On a phone the shell's bar has the path. */}
        <div className="flex min-w-0 items-center gap-2 md:flex-1">
          <div className="hidden min-w-0 md:block">
            <PageBreadcrumb page={summary} />
          </div>
          <span aria-hidden className="bg-otl-gray-200 hidden h-5 w-px shrink-0 md:block" />
          <div className="flex shrink-0 items-center">
            <ToolButton
              label={t("editor.undo")}
              disabled={state.past.length === 0}
              onClick={() => dispatch({ type: "undo" })}
            >
              <UndoIcon />
            </ToolButton>
            <ToolButton
              label={t("editor.redo")}
              disabled={state.future.length === 0}
              onClick={() => dispatch({ type: "redo" })}
            >
              <RedoIcon />
            </ToolButton>
          </div>
          {/* Saved, live, and what Publish just did: beside undo, with the editing it reports on. */}
          <div ref={setStatusSlot} className="flex shrink-0 items-center gap-2" />
        </div>
        {/* How the canvas is shown: its own group, set apart by a hairline either side. */}
        <span aria-hidden className="bg-otl-gray-200 hidden h-5 w-px shrink-0 md:block" />
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          {wide && (
            <Toggle
              pressed={showStructure}
              onPressedChange={toggleStructure}
              aria-label={t("editor.layers")}
              // The toolbar's buttons draw their icons at 20px; the toggle's own default is 16.
              className="[&_svg]:size-5"
            >
              <LayersIcon />
              <span className="max-xl:sr-only">{t("editor.layers")}</span>
            </Toggle>
          )}
          <CanvasMenu width={width} zoom={zoom} onWidth={setWidth} onZoom={setZoom} />
        </div>
        <span aria-hidden className="bg-otl-gray-200 hidden h-5 w-px shrink-0 md:block" />
        {/* The page: its other screens, a preview, then its state and Publish. */}
        <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">
          {/* With Publish unavailable, the checks keep a way in of their own. */}
          {checks.data && checks.data.length > 0 && !publishable && (
            <Button
              variant="default-ghost"
              size="small"
              aria-haspopup="dialog"
              aria-label={checksLabel(checks.data)}
              title={checksLabel(checks.data)}
              onClick={() => setShowChecks(true)}
            >
              <WarningCircleIcon className={stopped ? "text-txt-danger" : "text-txt-warning"} />
              <span className="tabular-nums">{checks.data.length}</span>
            </Button>
          )}
          {/* Quiet icons first (the page's settings, then everything else), then the two that
              act: Preview, and Publish in blue. */}
          <Button
            variant="default-ghost"
            size="small"
            aria-haspopup="dialog"
            aria-expanded={search.panel !== undefined}
            title={t("editor.drawer.hint")}
            onClick={() => setPanel("details")}
          >
            <SettingIcon /> <span className="max-xl:sr-only">{t("editor.drawer.button")}</span>
          </Button>
          <PageMoreMenu page={page} onPanel={setPanel} />
          <Button variant="default-outline" size="small" onClick={preview}>
            <EyeShowIcon /> {t("editor.preview")}
          </Button>
          {publishControl}
        </div>
      </div>
      {stoppedNotice || keptNotice}
      <PageDrawer
        page={{ ...page, ...summary }}
        panel={search.panel}
        section={search.section}
        onPanel={setPanel}
        fields={pagePanel}
        draft={{
          redirect: state.doc.redirect ?? null,
          setRedirect: (next) =>
            dispatch({
              type: "setDoc",
              update: (doc) => ({ ...doc, redirect: next }),
              key: "page.redirect",
              rerender: true,
            }),
          beforeChange: autosave.ensureSaved,
          afterChange: onReload,
        }}
      />
      {checks.data?.length ? (
        <Drawer side="right" open={showChecks} onOpenChange={setShowChecks}>
          <DrawerContent className="w-full sm:max-w-md">
            <DrawerHeader>
              <DrawerTitle>{t("checks.review.title")}</DrawerTitle>
              <DrawerDescription>{checksDescription(checks.data)}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <PageCheckList checks={checks.data} onShow={showCheck(() => setShowChecks(false))} />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      ) : null}
      {/* On a phone: no canvas. The list of blocks, then one block's fields (or the page's) at a time. */}
      {wide ? (
        <div className="flex min-h-0 flex-1">
          {showStructure && (
            <nav
              aria-label={t("editor.left")}
              className="border-otl-gray-200 w-64 shrink-0 border-r"
            >
              {leftColumn}
            </nav>
          )}
          <section aria-label={t("editor.canvas")} className="flex min-w-0 flex-1 flex-col">
            {redirectNotice}
            <div className="min-h-0 flex-1">
              <Canvas
                pageId={page.id}
                page={state.doc.ms}
                entry={entry}
                selected={state.selected}
                renderVersion={state.renderVersion}
                width={width}
                zoom={zoom}
                onSelect={(id) => dispatch({ type: "select", id })}
                onFieldInput={(blockId, field, value) =>
                  dispatch({ type: "setField", id: blockId, field, value })
                }
                onBlockAction={blockAction}
                onInsertAt={(index) => setPicker({ at: index })}
                onKey={(key) => {
                  if (key === "undo" || key === "redo") dispatch({ type: key });
                  else if (key === "save") void autosave.flush();
                  else if (key === "up" || key === "down")
                    dispatch({ type: "step", by: key === "up" ? -1 : 1 });
                  else if (key === "escape") dispatch({ type: "select", id: null });
                  else if (key === "delete" && selected) remove(selected.id);
                  else if (key === "duplicate" && selected)
                    dispatch({ type: "duplicate", id: selected.id });
                }}
              />
            </div>
          </section>
          <aside
            aria-label={t("editor.properties")}
            className="border-otl-gray-200 flex w-[22rem] shrink-0 flex-col border-l"
          >
            {/* The selected block's properties. The page's own fields are in the drawer. */}
            {selected ? (
              <>
                <h2 className="border-otl-gray-200 text-label-md text-txt-black-900 shrink-0 border-b px-4 py-3 font-semibold">
                  {blockLabel(selected.type)}
                </h2>
                <div className="relative min-h-0 flex-1 overflow-y-auto">{propertyPanel}</div>
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <EmptyPanel
                  blocks={blocks.length}
                  checks={checks.data?.length ?? 0}
                  checksLabel={checks.data ? checksLabel(checks.data) : ""}
                  stopped={stopped}
                  layers={showStructure}
                  onAddBlock={() => setPicker({ at: blocks.length })}
                  onPageDetails={() => setPanel("details")}
                  onChecks={() => setShowChecks(true)}
                />
              </div>
            )}
          </aside>
        </div>
      ) : (
        <>
          {redirectNotice}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <>
                <div className="border-otl-gray-200 flex items-center gap-2 border-b px-3 py-2">
                  <Button
                    variant="default-ghost"
                    size="small"
                    onClick={() => {
                      dispatch({ type: "select", id: null });
                    }}
                  >
                    <ArrowBackIcon /> {t("editor.phone.back")}
                  </Button>
                  <h2 className="text-label-md text-txt-black-900 font-semibold">
                    {blockLabel(selected.type)}
                  </h2>
                </div>
                {propertyPanel}
              </>
            ) : (
              <nav aria-label={t("editor.left")} className="flex flex-col">
                <div className="border-otl-gray-200 border-b p-3">
                  <Button variant="default-outline" onClick={() => setPanel("details")}>
                    {t("editor.panel.pageDetails")}
                  </Button>
                </div>
                {leftColumn}
              </nav>
            )}
          </div>
        </>
      )}
      {blockPicker}
      {conflictDialog}
    </div>
  );
}

/** Whether the page structure column is shown, remembered per browser. */
const STRUCTURE_KEY = "admin.editor.structure";

function ToolButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  /** For a button that switches something on and off. */
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="default-ghost"
            size="small"
            iconOnly
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
            aria-pressed={pressed}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The page's other screens and actions, from the editor: its settings and analytics,
 * then duplicate, move, unpublish and delete (each opens where it's done today, on
 * the page's Settings tab).
 */
function PageMoreMenu({
  page,
  onPanel,
}: {
  page: Page;
  onPanel: (panel: PanelTab, section?: SettingsSection) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="default-ghost" size="small" iconOnly aria-label={t("detail.more")} />
        }
      >
        <EllipsisVerticalIcon />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onClick={() => onPanel("settings", "duplicate")}>
          {t("settings.duplicate.title")}
        </MenuItem>
        {page.kind !== "entry" && (
          <MenuItem disabled={isHome(page)} onClick={() => onPanel("settings", "move")}>
            {t("detail.moveTo")}
          </MenuItem>
        )}
        <MenuItem
          disabled={isHome(page) || page.status === "draft"}
          onClick={() => onPanel("settings", "unpublish")}
        >
          {t("settings.unpublish.title")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          variant="danger"
          disabled={isHome(page)}
          onClick={() => onPanel("settings", "delete")}
        >
          {t("settings.delete.title")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The layers column's toggle: stacked layers, drawn like the FTDS icons (20px, 1.5px stroke). */
function LayersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-5">
      <path
        d="m10 3.5 6.5 3.25L10 10 3.5 6.75 10 3.5ZM3.5 10.25 10 13.5l6.5-3.25M3.5 13.5 10 16.75l6.5-3.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** How the canvas is shown, in one menu: the device's width, then the zoom. */
function CanvasMenu({
  width,
  zoom,
  onWidth,
  onZoom,
}: {
  width: CanvasWidth;
  zoom: CanvasZoom;
  onWidth: (width: CanvasWidth) => void;
  onZoom: (zoom: CanvasZoom) => void;
}) {
  const Icon = widthIcons[width];
  return (
    <Menu>
      <MenuTrigger render={<Button variant="default-ghost" size="small" />}>
        <Icon />
        <span className="max-xl:sr-only">{t(`editor.width.${width}`)}</span>
        <span className="text-txt-black-500 max-xl:hidden">
          · {zoom === "fit" ? t("editor.zoom.fit") : "100%"}
        </span>
        <ChevronDownIcon className="text-txt-black-500 size-4" />
      </MenuTrigger>
      <MenuContent align="center">
        <MenuGroup>
          <MenuGroupLabel>{t("editor.width")}</MenuGroupLabel>
          <MenuRadioGroup value={width} onValueChange={(value) => onWidth(value as CanvasWidth)}>
            {(["desktop", "tablet", "mobile"] as const).map((w) => (
              <MenuRadioItem key={w} value={w} closeOnClick>
                {t(`editor.width.${w}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>{t("editor.zoom")}</MenuGroupLabel>
          <MenuRadioGroup value={zoom} onValueChange={(value) => onZoom(value as CanvasZoom)}>
            <MenuRadioItem value="fit" closeOnClick>
              {t("editor.zoom.fit")}
            </MenuRadioItem>
            <MenuRadioItem value="100" closeOnClick>
              100%
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
