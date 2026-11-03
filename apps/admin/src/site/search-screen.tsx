/**
 * Site search: the Cari button and the /carian page on the published site,
 * which search a Pagefind index the publisher writes. Its own document, like
 * the announcement: Publish search saves and sends it live in one step, after
 * saying what visitors will get. Officers switch it on or off, choose whether
 * results can be narrowed by collection, and pin a page first for the words
 * visitors search for most. "Try a search" runs a query against the live
 * index with the draft's pins on top, so a pin can be checked before it's
 * published.
 */
import { type PageSummary, type SearchDoc, SiteSearch, searchLimits } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";
import { card } from "@/components/card";
import { PagePicker } from "@/components/page-picker";
import { PublishControl } from "@/components/publish-control";
import { useDocConflict } from "@/components/conflict-dialog";
import { DiscardEditsDialog, PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons/plus";
import { SearchIcon } from "@/components/ui/icons/search";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { apiError, siteApi } from "@/lib/api";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { clx } from "@/lib/ftds/utils";
import { usePages, useSummary } from "@/lib/pages";
import { useSearchDoc } from "@/lib/publish";
import { SwitchRow, Warnings } from "./navigation-screen";

/** The words in a "borang, permohonan" field, as the server will keep them. */
const wordsOf = (text: string) =>
  [...new Set(text.split(",").map((w) => w.trim().toLowerCase()))].filter(Boolean);

/** Field problems, by dotted path ("pins.0.terms"), from the rules the server applies on save. */
function problems(draft: SiteSearch): Map<string, string> {
  const out = new Map<string, string>();
  const result = SiteSearch.safeParse(draft);
  for (const issue of result.success ? [] : result.error.issues) {
    const path = issue.path.join(".");
    const field = issue.path.at(-1);
    if (out.has(path)) continue;
    if (field === "pageId") out.set(path, t("search.pins.pageRequired"));
    else if (field === "terms" && issue.code === "too_small")
      out.set(path, t("search.pins.wordsRequired"));
    else out.set(path, issue.message);
  }
  return out;
}

/** Words a pin shares with a pin above it: the server keeps them with the first. */
function takenWords(draft: SiteSearch): Map<number, string[]> {
  const seen = new Set<string>();
  const out = new Map<number, string[]>();
  draft.pins.forEach((pin, i) => {
    const taken = pin.terms.filter((w) => seen.has(w));
    if (taken.length) out.set(i, taken);
    for (const w of pin.terms) seen.add(w);
  });
  return out;
}

export function SearchScreen() {
  const doc = useSearchDoc();
  if (doc.isError)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("search.loadFailed")}</CalloutTitle>
        </Callout>
      </div>
    );
  if (!doc.data)
    return (
      <div className="flex h-full flex-col" aria-busy>
        <div className="px-surface border-otl-gray-200 flex items-start gap-3 border-b pt-5 pb-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="bg-bg-washed flex flex-1 flex-col gap-4 p-4 md:max-w-[520px]">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  return <Editor doc={doc.data} />;
}

/** A pin as it's edited: the words as typed, so a trailing comma isn't tidied away mid-word. */
type PinRow = { key: number; text: string; pageId: string };

let nextKey = 0;
const rowsOf = (search: SiteSearch): PinRow[] =>
  search.pins.map((pin) => ({ key: nextKey++, text: pin.terms.join(", "), pageId: pin.pageId }));
const searchOf = (base: SiteSearch, rows: PinRow[]): SiteSearch => ({
  ...base,
  pins: rows.map((row) => ({ terms: wordsOf(row.text), pageId: row.pageId })),
});

function Editor({ doc }: { doc: SearchDoc }) {
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 768px)");
  const pages = usePages();
  const [base, setBase] = useState<SiteSearch>(doc.draft);
  const [rows, setRows] = useState<PinRow[]>(() => rowsOf(doc.draft));
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<Map<string, string>>(new Map());
  const [showAll, setShowAll] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const draft = useMemo(() => searchOf(base, rows), [base, rows]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(doc.draft);
  const local = useMemo(() => problems(draft), [draft]);
  const taken = useMemo(() => takenWords(draft), [draft]);
  const issue = (path: string) => serverIssues.get(path) ?? (showAll ? local.get(path) : undefined);
  const touched = () => setServerIssues((prev) => (prev.size ? new Map() : prev));
  const set = (next: Partial<SiteSearch>) => {
    touched();
    setBase((b) => ({ ...b, ...next }));
  };
  const setRow = (key: number, next: Partial<PinRow>) => {
    touched();
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));
  };
  /** Starts the form again from `next`: after a save, a discard or a put-back. */
  const load = (next: SiteSearch) => {
    setBase(next);
    setRows(rowsOf(next));
    setServerIssues(new Map());
    setShowAll(false);
  };
  const leaveGuard = useLeaveGuard(dirty, t("search.leave.body"));
  const conflict = useDocConflict<SiteSearch>("search", { onLoad: load, retry: () => save() });

  const save = async () => {
    if (local.size) {
      setShowAll(true);
      throw new Error("Site search has problems to fix");
    }
    setSaving(true);
    setServerIssues(new Map());
    try {
      const next = await siteApi.saveSearch(draft);
      queryClient.setQueryData(["search"], next);
      load(next.draft);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    } catch (caught) {
      // Stops a publish that saves first, and asks which to keep.
      if (await conflict.handle(caught)) throw caught;
      const body = await apiError(caught);
      setServerIssues(
        new Map(body?.details?.map((d) => [d.path.replace(/^draft\./, ""), d.message])),
      );
      // Stops a publish that saves first.
      throw caught;
    } finally {
      setSaving(false);
    }
  };
  const discard = async () => {
    const next = await siteApi.discardSearch();
    queryClient.setQueryData(["search"], next);
    load(next.draft);
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const live = doc.published.on;
  const collections = (pages.data ?? []).filter((p) => p.kind === "listing");

  const header = (
    <header className="bg-bg-white px-surface border-otl-gray-200 flex flex-wrap items-start gap-x-6 gap-y-3 border-b pt-5 pb-4">
      <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
        <span
          aria-hidden
          className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
        >
          <SearchIcon />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-title text-txt-black-900 truncate font-semibold">
            {t("search.title")}
          </h1>
          <p className="text-body-sm text-txt-black-500">{t("search.subtitle")}</p>
          <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-2 pt-1">
            <Tag size="small" variant={live ? "success" : "default"} dot>
              {live ? t("search.state.on") : t("search.state.off")}
            </Tag>
            {live ? t("search.state.onText") : t("search.state.offText")}
          </p>
        </div>
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        {dirty ? (
          <Button variant="default-ghost" size="small" onClick={() => setDiscarding(true)}>
            {t("navigation.discardEdits")}
          </Button>
        ) : (
          doc.changed && (
            <Button variant="default-ghost" size="small" onClick={() => void discard()}>
              {t("settings.discard")}
            </Button>
          )
        )}
        <PublishControl
          live={doc.changed ? "changed" : "live"}
          save={conflict.saveState(saving, dirty)}
          label={t("search.publish")}
          beforePublish={dirty ? save : undefined}
          viewPath={draft.on ? "/carian" : "/"}
          onPublish={() => siteApi.publishDoc("search")}
          review={{
            title: t("search.review.title"),
            description: t("search.review.description"),
            body: <PublishReview draft={draft} issues={local} />,
            blocked: local.size > 0,
          }}
        />
      </div>
    </header>
  );

  const form = (
    <div className="bg-bg-washed flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {doc.warnings.length > 0 && <Warnings warnings={doc.warnings} title={t("search.warnings")} />}
      <div className={clx(card, "border-otl-gray-200 shrink-0 p-4")}>
        <SwitchRow
          title={t("search.on")}
          hint={draft.on ? t("search.onHint") : t("search.offHint")}
          checked={draft.on}
          onCheckedChange={(on) => set({ on })}
        />
      </div>
      {draft.on && (
        <>
          <div className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-3 p-4")}>
            <SwitchRow
              title={t("search.filters")}
              hint={t("search.filtersHint")}
              checked={draft.filters}
              onCheckedChange={(filters) => set({ filters })}
            />
            {draft.filters && (
              <p className="text-body-sm text-txt-black-700 border-otl-gray-200 border-t pt-3">
                {collections.length
                  ? t("search.filters.list", {
                      list: [
                        t("search.collection.pages"),
                        ...collections.map((c) => c.title || t("page.untitled")),
                      ].join(", "),
                    })
                  : t("search.filters.none")}
              </p>
            )}
          </div>
          <Pins
            rows={rows}
            pages={pages.data ?? []}
            issue={issue}
            taken={taken}
            onChange={setRow}
            onAdd={() => {
              touched();
              setRows((rs) => [...rs, { key: nextKey++, text: "", pageId: "" }]);
            }}
            onRemove={(key) => {
              touched();
              setRows((rs) => rs.filter((r) => r.key !== key));
            }}
          />
        </>
      )}
      {doc.previous && !dirty && !doc.changed && (
        <PutBackPrevious
          label={t("search.previous.load")}
          onPutBack={() => doc.previous && load(doc.previous)}
        />
      )}
    </div>
  );

  const tryIt = <TrySearch draft={draft} pages={pages.data ?? []} live={live} />;

  return (
    <div className="flex h-full flex-col">
      {header}
      {wide ? (
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="admin.search.split"
          defaultWidth={520}
          maxWidth={760}
          startLabel={t("search.editor")}
          endLabel={t("search.try.title")}
          start={<div className="flex h-full flex-col">{form}</div>}
          end={tryIt}
        />
      ) : (
        <div className="bg-bg-washed flex min-h-0 flex-1 flex-col overflow-y-auto">
          {form}
          {tryIt}
        </div>
      )}
      <DiscardEditsDialog
        open={discarding}
        onOpenChange={setDiscarding}
        body={t("search.discardEdits.body")}
        onDiscard={() => load(doc.draft)}
      />
      {leaveGuard}
      {conflict.dialog}
    </div>
  );
}

function Pins({
  rows,
  pages,
  issue,
  taken,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: PinRow[];
  pages: PageSummary[];
  issue: (path: string) => string | undefined;
  taken: Map<number, string[]>;
  onChange: (key: number, next: Partial<PinRow>) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
}) {
  const id = useId();
  const full = rows.length >= searchLimits.pins;
  return (
    <section
      aria-labelledby={id}
      className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-4 p-4")}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-label-lg text-txt-black-900 font-semibold">
          {t("search.pins.title")}
        </h2>
        <p className="text-body-sm text-txt-black-700">{t("search.pins.hint")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-body-sm text-txt-black-500">{t("search.pins.empty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row, i) => (
            <PinEditor
              key={row.key}
              n={i + 1}
              row={row}
              pages={pages}
              wordsError={issue(`pins.${i}.terms`)}
              pageError={issue(`pins.${i}.pageId`)}
              taken={taken.get(i)}
              onChange={(next) => onChange(row.key, next)}
              onRemove={() => onRemove(row.key)}
            />
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="default-outline" size="small" onClick={onAdd} disabled={full}>
          <PlusIcon aria-hidden />
          {t("search.pins.add")}
        </Button>
        {full && (
          <p className="text-body-sm text-txt-black-500">
            {t("search.pins.limit", { max: searchLimits.pins })}
          </p>
        )}
      </div>
    </section>
  );
}

function PinEditor({
  n,
  row,
  pages,
  wordsError,
  pageError,
  taken,
  onChange,
  onRemove,
}: {
  n: number;
  row: PinRow;
  pages: PageSummary[];
  wordsError?: string | undefined;
  pageError?: string | undefined;
  taken?: string[] | undefined;
  onChange: (next: Partial<PinRow>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <li
      aria-labelledby={id}
      className="border-otl-gray-200 flex flex-col gap-3 rounded-md border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-label-md text-txt-black-700 font-medium">
          {t("search.pins.item", { n })}
        </h3>
        <Button
          variant="default-ghost"
          size="small"
          onClick={onRemove}
          aria-label={t("search.pins.removeLabel", { n })}
        >
          {t("search.pins.remove")}
        </Button>
      </div>
      <Field name={`pins.${n - 1}.terms`} invalid={Boolean(wordsError)}>
        <FieldLabel>{t("search.pins.words")}</FieldLabel>
        <FieldDescription>{t("search.pins.wordsHint")}</FieldDescription>
        <Input
          value={row.text}
          // Every word at its longest, with ", " between them.
          maxLength={searchLimits.terms * (searchLimits.term + 2)}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <FieldError>{wordsError}</FieldError>
        {!wordsError &&
          taken?.map((word) => (
            <p key={word} className="text-body-sm text-txt-warning">
              {t("search.pins.taken", { word })}
            </p>
          ))}
      </Field>
      <Field name={`pins.${n - 1}.pageId`} invalid={Boolean(pageError)}>
        <FieldLabel>{t("search.pins.page")}</FieldLabel>
        <PagePicker
          pages={pages}
          value={row.pageId || null}
          showStatus
          onValueChange={(pageId) => onChange({ pageId: pageId ?? "" })}
        />
        <FieldError>{pageError}</FieldError>
      </Field>
    </li>
  );
}

/** What Publish will change, in words. */
function PublishReview({ draft, issues }: { draft: SiteSearch; issues: Map<string, string> }) {
  const fix = [...new Set(issues.values())];
  const words = draft.pins.reduce((n, pin) => n + pin.terms.length, 0);
  return (
    <div className="flex flex-col gap-3">
      {fix.length > 0 && (
        <div className="text-txt-danger" role="alert">
          <p>{t("search.review.blocked")}</p>
          <ul className="m-0 list-disc pl-5">
            {fix.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.on ? (
        <>
          <p>{t("search.review.on")}</p>
          <p>{draft.filters ? t("search.review.filtersOn") : t("search.review.filtersOff")}</p>
          {words > 0 && <p>{t("search.review.pins", { count: words })}</p>}
        </>
      ) : (
        <p>{t("search.review.off")}</p>
      )}
      <p className="text-txt-black-700">{t("search.review.undo")}</p>
    </div>
  );
}

/** Pagefind's browser API, as far as this screen uses it. */
type Pagefind = {
  options: (o: Record<string, unknown>) => Promise<void>;
  search: (q: string) => Promise<{
    results: { data: () => Promise<{ url: string; excerpt: string; meta: { title?: string } }> }[];
  } | null>;
};

type Found = { url: string; title: string; excerpt?: string; pin?: "live" | "draft" };
type Trial =
  | { status: "idle" | "busy" | "notLive" | "noIndex" | "failed" }
  | { status: "done"; q: string; found: Found[]; total: number };
const trialText: Record<Exclude<Trial["status"], "idle" | "done">, MessageKey> = {
  busy: "publish.busy",
  notLive: "search.try.notLive",
  noIndex: "search.try.noIndex",
  failed: "search.try.failed",
};

/** A Pagefind excerpt (text with <mark> around the matches) as React nodes, never as HTML. */
function Excerpt({ html }: { html: string }) {
  const parts = useMemo(() => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return [...template.content.childNodes].map((node) => ({
      mark: node.nodeName === "MARK",
      text: node.textContent ?? "",
    }));
  }, [html]);
  return (
    <p className="text-body-sm text-txt-black-700">
      {parts.map((part, i) =>
        part.mark ? (
          <mark key={i} className="bg-bg-warning-100 text-txt-black-900">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

/**
 * Runs a query against the live index, as /carian would, with the draft's
 * pins on top. The index is loaded from this server, which serves the live site.
 */
function TrySearch({
  draft,
  pages,
  live,
}: {
  draft: SiteSearch;
  pages: PageSummary[];
  live: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [trial, setTrial] = useState<Trial>({ status: "idle" });
  // The live index, loaded again only after a publish, which may have changed it.
  const lastPublish = useSummary().data?.publishes.find((j) => j.status === "done")?.id ?? "";
  const engine = useRef<{ key: string; loaded: Promise<Pagefind> } | undefined>(undefined);

  const run = async (query: string) => {
    const words = query.trim();
    if (!words) return setTrial({ status: "idle" });
    if (!live) return setTrial({ status: "notLive" });
    setTrial({ status: "busy" });
    try {
      if (engine.current?.key !== lastPublish)
        engine.current = {
          key: lastPublish,
          loaded: import(
            /* webpackIgnore: true */ `/pagefind/pagefind.js?v=${encodeURIComponent(lastPublish)}`
          ).then(async (module: Pagefind) => {
            await module.options({ excerptLength: 24 });
            return module;
          }),
        };
      const results = (await (await engine.current.loaded).search(words))?.results ?? [];
      const data = await Promise.all(results.slice(0, 8).map((r) => r.data()));
      const found = data.map((d) => ({
        url: d.url.replace(/\/$/, "") || "/",
        title: d.meta.title ?? d.url,
        excerpt: d.excerpt,
      }));
      setTrial({ status: "done", q: words, found, total: results.length });
    } catch {
      engine.current = undefined;
      // No index on the site yet (it's written by the next publish), or something else went wrong.
      const index = await fetch("/pagefind/pagefind.js", { method: "HEAD" }).catch(() => undefined);
      setTrial({ status: index?.status === 404 ? "noIndex" : "failed" });
    }
  };

  // The draft's pin for the query goes on top, so editing a pin shows here at once.
  const done = trial.status === "done" ? trial : undefined;
  const pin = done && draft.pins.find((p) => p.terms.includes(done.q.toLowerCase()));
  const pinned = pin && pages.find((p) => p.id === pin.pageId);
  const found: Found[] = !done
    ? []
    : pinned
      ? [
          {
            url: pinned.path,
            title: pinned.title || t("page.untitled"),
            pin: pinned.status === "draft" ? "draft" : "live",
          },
          ...done.found.filter((f) => f.url !== pinned.path),
        ]
      : done.found;
  const total = done ? done.total || (pinned ? 1 : 0) : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(q);
  };

  const message =
    trial.status === "idle"
      ? null
      : trial.status !== "done"
        ? t(trialText[trial.status])
        : total
          ? t("search.try.count", { count: total, q: trial.q })
          : t("search.try.none", { q: trial.q });

  return (
    <section
      aria-labelledby={id}
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-label-lg text-txt-black-900 font-semibold">
          {t("search.try.title")}
        </h2>
        <p className="text-body-sm text-txt-black-700">{t("search.try.hint")}</p>
      </div>
      <search>
        <form onSubmit={submit} className="flex items-end gap-2">
          <Field name="try" className="min-w-0 flex-1">
            <FieldLabel>{t("search.try.label")}</FieldLabel>
            <Input type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Button type="submit" variant="default-outline">
            <SearchIcon aria-hidden />
            {t("search.try.button")}
          </Button>
        </form>
      </search>
      <output aria-live="polite" className="text-body-sm text-txt-black-900 font-medium">
        {message}
      </output>
      {found.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {found.map((f) => (
            <li
              key={f.url}
              className={clx(
                "flex flex-col gap-1",
                f.pin && "border-otl-primary-200 bg-bg-primary-50 rounded-md border p-3",
              )}
            >
              {f.pin && (
                <Tag
                  size="small"
                  variant={f.pin === "live" ? "primary" : "warning"}
                  className="self-start"
                >
                  {f.pin === "live" ? t("search.try.pinned") : t("search.try.draftPin")}
                </Tag>
              )}
              <span className="text-body-md text-txt-primary font-semibold">{f.title}</span>
              <span className="text-label-compact text-txt-black-500">{f.url}</span>
              {f.excerpt && <Excerpt html={f.excerpt} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
