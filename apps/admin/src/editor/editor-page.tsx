/**
 * The editor: a toolbar row, then the Layers and Insert column, the canvas,
 * and the properties panel.
 */
import { type BlockType, type PageDocument, blockDefinition, blocksFor } from "@fiscal-sb/blocks";
import type { DraftConflict, Page } from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { redirectTarget } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { DesktopIcon } from "@/components/ui/icons/desktop";
import { ArrowBackIcon } from "@/components/ui/icons/arrow-back";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { MobileIcon } from "@/components/ui/icons/mobile";
import { RedoIcon } from "@/components/ui/icons/redo";
import { TabletIcon } from "@/components/ui/icons/tablet";
import { UndoIcon } from "@/components/ui/icons/undo";
import { useCommands } from "@/components/ui/shortcuts";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/app-shell";
import { t } from "@/i18n";
import { ConflictDialog } from "@/components/conflict-dialog";
import { PageCheckList, checksKey, stops, usePageChecks } from "@/components/page-checks";
import { apiError, conflictOf, pagesApi, statusOf } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { localDrafts } from "@/lib/local-drafts";
import { sessionLost } from "@/lib/session";
import { useStore } from "@/lib/store";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { formatDateTime, previewHref, usePages, useRefreshPages } from "@/lib/pages";
import { BlockPicker } from "./block-picker";
import { type BlockAction, Canvas, type CanvasWidth, type CanvasZoom } from "./canvas";
import { LeftColumn } from "./layers";
import { PagePanel } from "./page-panel";
import { PropertyPanel } from "./property-panel";
import { type SaveState, PublishControl } from "@/components/publish-control";
import type { LiveState } from "@/lib/publish";
import { editorReducer, initialState } from "./state";

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

/** A listing page's entry list can move, but not go. */
const required = (block: { type: string }) => block.type === "entryList";

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

/** The time, every minute: whether an entry's date has come changes the publish button. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

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
  const pages = usePages();
  const [width, setWidth] = useState<CanvasWidth>("desktop");
  const [zoom, setZoom] = useState<CanvasZoom>("fit");
  const wide = useMediaQuery("(min-width: 768px)");
  // On a phone, whether the page's own settings are open in place of the block list.
  const [phonePage, setPhonePage] = useState(false);
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
  // The Block switch returns to the block last worked on.
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    if (state.selected) lastSelected.current = state.selected;
  }, [state.selected]);
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
  const moveBy = (id: string, by: number) => {
    const from = blocks.findIndex((b) => b.id === id);
    dispatch({ type: "move", from, to: from + by });
  };
  const blockAction = (action: BlockAction, id: string) => {
    if (action === "up") moveBy(id, -1);
    else if (action === "down") moveBy(id, 1);
    else if (action === "duplicate") duplicate(id);
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
    ...allowed.map((type) => ({
      id: `editor.insert.${type}`,
      title: t("editor.insert.block", { block: blockDefinition(type).label }),
      group: t("editor.insert.group"),
      run: () => add(type),
    })),
  ]);

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
              description: stopped
                ? t("checks.review.stopped")
                : t("checks.review.warnings", { count: checks.data.length }),
              blocked: stopped,
              confirm: t("checks.publishAnyway"),
              renderBody: (close) => (
                <PageCheckList
                  checks={checks.data}
                  onShow={(blockId) => {
                    dispatch({ type: "select", id: blockId });
                    close();
                  }}
                />
              ),
            }
          : undefined
      }
      onPublish={() => pagesApi.publish(page.id)}
      viewPath={summary.path}
      pageId={page.id}
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
      <div
        role="toolbar"
        aria-label={t("editor.toolbar")}
        className="border-otl-gray-200 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:gap-3 md:py-0"
      >
        <div className="flex shrink-0 items-center gap-1">
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
        {/* How the canvas is shown: one quiet group, apart from the page's own actions. */}
        <div className="bg-bg-washed hidden shrink-0 items-center gap-1 rounded-md p-0.5 md:flex">
          <ToggleGroup
            value={[width]}
            onValueChange={(value) => value[0] && setWidth(value[0] as CanvasWidth)}
            aria-label={t("editor.width")}
            size="small"
          >
            {(["desktop", "tablet", "mobile"] as const).map((w) => {
              const Icon = widthIcons[w];
              return (
                <Tooltip key={w}>
                  <TooltipTrigger render={<Toggle value={w} aria-label={t(`editor.width.${w}`)} />}>
                    <Icon />
                  </TooltipTrigger>
                  <TooltipContent>{t(`editor.width.${w}`)}</TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
          <span aria-hidden className="bg-otl-gray-200 h-5 w-px" />
          <ToggleGroup
            value={[zoom]}
            onValueChange={(value) => value[0] && setZoom(value[0] as CanvasZoom)}
            aria-label={t("editor.zoom")}
            size="small"
          >
            <Toggle value="fit">{t("editor.zoom.fit")}</Toggle>
            <Toggle value="100">100%</Toggle>
          </ToggleGroup>
        </div>
        <span className="flex-1" />
        <Button
          variant="default-ghost"
          size="small"
          className="max-md:hidden"
          render={<Link to="/pages/$id" params={{ id: page.id }} search={{ tab: "history" }} />}
        >
          {t("detail.tab.history")}
        </Button>
        <Button variant="default-outline" size="small" onClick={preview}>
          <EyeShowIcon /> {t("editor.preview")}
        </Button>
        {publishControl}
      </div>
      {stoppedNotice || keptNotice}
      {/* On a phone: no canvas. The list of blocks, then one block's fields (or the page's) at a time. */}
      {wide ? (
        <div className="flex min-h-0 flex-1">
          <nav aria-label={t("editor.left")} className="border-otl-gray-200 w-64 shrink-0 border-r">
            {leftColumn}
          </nav>
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
            {/* The panel does one of two jobs; the switch says which, and changes it. */}
            <Tabs
              value={selected ? "block" : "page"}
              onValueChange={(value) =>
                dispatch({
                  type: "select",
                  id: value === "page" ? null : (lastSelected.current ?? blocks[0]?.id ?? null),
                })
              }
            >
              <TabsList width="full" className="shrink-0 px-2">
                <TabsTrigger value="page">{t("editor.panel.page")}</TabsTrigger>
                <TabsTrigger value="block" disabled={blocks.length === 0}>
                  {selected ? blockDefinition(selected.type).label : t("editor.panel.block")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              {selected ? propertyPanel : pagePanel}
            </div>
          </aside>
        </div>
      ) : (
        <>
          {redirectNotice}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected || phonePage ? (
              <>
                <div className="border-otl-gray-200 border-b px-3 py-2">
                  <Button
                    variant="default-ghost"
                    size="small"
                    onClick={() => {
                      setPhonePage(false);
                      dispatch({ type: "select", id: null });
                    }}
                  >
                    <ArrowBackIcon /> {t("editor.phone.back")}
                  </Button>
                </div>
                {selected ? propertyPanel : pagePanel}
              </>
            ) : (
              <nav aria-label={t("editor.left")} className="flex flex-col">
                <div className="border-otl-gray-200 border-b p-3">
                  <Button variant="default-outline" onClick={() => setPhonePage(true)}>
                    {t("editor.panel.page")}
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

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
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
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
