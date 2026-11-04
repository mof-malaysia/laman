/**
 * Publishing: publish now (with what it will change), scheduled publishes,
 * and the log of every publish, each with what happened to every page and a
 * way to put back what was live before it.
 */
import {
  type Job,
  type PageSummary,
  type PublishLogEntry,
  type PublishPayload,
  type PublishTrigger,
  canUndo,
} from "@fiscal-sb/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Tone, toneDot } from "@/components/page-status";
import { SiteStateHeading, useSiteState } from "@/components/site-state";
import { linkClass } from "@/components/text-link";
import { WaitingList } from "@/components/waiting-list";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import { Field, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Radio, RadioButton, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { blockLabel } from "@/i18n/registry";
import { siteDocQuery, useSiteHref } from "@/lib/publish";
import { apiError, jobsApi, siteApi, waitForJob } from "@/lib/api";
import { useCan } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { clx } from "@/lib/ftds/utils";
import {
  formatAgo,
  formatDateTime,
  formatDayDate,
  formatTime,
  useRefreshPages,
  usePages,
} from "@/lib/pages";

/** A publish job's payload, as `PublishPayload` in the contract describes it. */
const payloadOf = (job: Job) => job.payload as PublishPayload;
const swapsOf = (job: Job) => payloadOf(job).swaps ?? [];
const isUndone = (job: Job) => Boolean(payloadOf(job).undoneAt);

const triggers: Record<PublishTrigger, MessageKey> = {
  manual: "publishing.trigger.manual",
  page: "publishing.trigger.page",
  entry: "publishing.trigger.entry",
  settings: "publishing.trigger.settings",
  navigation: "publishing.trigger.navigation",
  tree: "publishing.trigger.tree",
  scheduled: "publishing.trigger.scheduled",
  announcement: "publishing.trigger.announcement",
  search: "publishing.trigger.search",
  theme: "publishing.trigger.theme",
  retry: "publishing.trigger.retry",
  undo: "publishing.trigger.undo",
  rebuild: "publishing.trigger.rebuild",
  restore: "publishing.trigger.restore",
};
const triggerOf = (job: Job) => t(triggers[payloadOf(job).trigger ?? "manual"]);

/** Pages a finished publish couldn't build, so the site kept their last version. */
const skippedCount = (job: Job) => (job.status === "done" ? (job.result?.failed ?? 0) : 0);

function ResultTag({ job }: { job: Job }) {
  if (job.status === "done" && isUndone(job))
    return <Tag size="small">{t("publishing.undone")}</Tag>;
  if (skippedCount(job))
    return (
      <Tag size="small" variant="warning">
        {t("job.doneSkipped", { count: skippedCount(job) })}
      </Tag>
    );
  if (job.status === "done")
    return (
      <Tag size="small" variant="success">
        {t("job.done")}
      </Tag>
    );
  if (job.status === "failed")
    return (
      <Tag size="small" variant="danger">
        {t("job.failed")}
      </Tag>
    );
  return <Tag size="small">{t("job.running")}</Tag>;
}

export function PublishingScreen() {
  const canManage = useCan("site.manage");
  const { lastAt } = useSiteState();
  const siteUrl = useSiteHref("/");
  return (
    // Body Compact is the admin's reading size; headings and labels set their own.
    <div className="p-surface gap-stack-lg text-body-sm mx-auto flex max-w-6xl flex-col">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.publishing")}</PageHeaderTitle>
          <PageHeaderDescription>{t("publishing.intro")}</PageHeaderDescription>
        </PageHeaderContent>
        {lastAt && (
          <PageHeaderActions>
            <Button
              variant="default-outline"
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
              render={<a href={siteUrl} target="_blank" rel="noopener" />}
            >
              {t("publish.view")}
              <span className="sr-only"> {t("publish.newTab")}</span>
            </Button>
          </PageHeaderActions>
        )}
      </PageHeader>

      {/*
        Phone order: where the site stands and what's waiting, then what happened.
        Rebuilding is about the live site, so it sits under its history.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="gap-stack-lg flex flex-col">
          <section aria-labelledby="status-heading" className="gap-stack-md flex flex-col">
            <SiteStatus />
            <WaitingList />
          </section>
          <Scheduled />
        </div>
        <div className="gap-stack-lg flex flex-col">
          <Log />
          {canManage && <Rebuild />}
        </div>
      </div>
    </div>
  );
}

/**
 * Where the site stands, and when it last changed. It names the section, so
 * the waiting list under it needs no heading, and it doesn't repeat what the
 * list already shows (how many new pages there are, what to tick).
 */
function SiteStatus() {
  const { state, waiting, lastAt, loaded } = useSiteState();
  if (!loaded) return <Skeleton className="h-20 w-full rounded-lg" />;
  return (
    <div className="bg-bg-washed flex flex-col gap-1 rounded-lg px-5 py-4">
      <SiteStateHeading state={state} count={waiting.count}>
        {state === "failed" && t("publishing.status.failedBody")}
      </SiteStateHeading>
      <p className="text-txt-black-700 pl-8" title={lastAt ? formatDateTime(lastAt) : undefined}>
        {lastAt ? t("home.lastPublished", { ago: formatAgo(lastAt) }) : t("home.neverPublished")}
      </p>
    </div>
  );
}

/**
 * Scheduling a site publish for later is hidden for now: publishing is manual
 * only. The form, its strings and the server's `runAt` support stay in place;
 * set this to true to bring the form back. Publishes scheduled elsewhere (an
 * entry dated in the future, a timed announcement) are still listed below so
 * they can be seen and cancelled.
 */
const SCHEDULING_ENABLED = false;

function Scheduled() {
  const canPublish = useCan("content.publish");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pages = usePages();
  const settings = useQuery(siteDocQuery("settings"));
  const jobs = useQuery({
    queryKey: ["jobs", "scheduled"],
    queryFn: () => jobsApi.list({ scheduled: true, page: 1, pageSize: 50 }),
  });
  const [date, setDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  });
  const [time, setTime] = useState<string>();
  const [scope, setScope] = useState<"all" | "pages">("all");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  // Each error belongs to the field that caused it.
  const [error, setError] = useState<{ field: "when" | "pages" | "form"; message: string }>();
  const [busy, setBusy] = useState(false);
  const candidates = pages.data?.filter((p) => p.status !== "published") ?? [];
  const at = time ?? settings.data?.published.publishing.scheduleTime ?? "08:00";
  const titles = useMemo(() => byId(pages.data), [pages.data]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["summary"] }),
    ]);

  const schedule = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const runAt = new Date(`${date}T${at}:00`);
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now())
      return setError({ field: "when", message: t("publishing.schedule.future") });
    if (scope === "pages" && chosen.size === 0)
      return setError({ field: "pages", message: t("publishing.schedule.choosePages") });
    setBusy(true);
    try {
      await siteApi.publish({
        runAt: runAt.toISOString(),
        ...(scope === "pages" && { pageIds: [...chosen] }),
      });
      await refresh();
      setChosen(new Set());
      toast({
        variant: "success",
        title: t("publishing.schedule.done", { time: formatDateTime(runAt.toISOString()) }),
      });
    } catch (caught) {
      setError({
        field: "form",
        message: (await apiError(caught))?.message ?? t("common.tryAgain"),
      });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (job: Job) => {
    try {
      await jobsApi.cancel(job.id);
      await refresh();
      toast({ variant: "success", title: t("publishing.schedule.cancelled") });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("publishing.schedule.cancelFailed"),
        description: (await apiError(caught))?.message,
      });
    }
  };

  const upcoming = jobs.data?.items ?? [];
  if (!SCHEDULING_ENABLED && upcoming.length === 0) return null;
  return (
    <section aria-labelledby="scheduled-heading" className="gap-stack-sm flex flex-col">
      <h2 id="scheduled-heading" className="text-title font-semibold">
        {t("publishing.scheduled")}
      </h2>
      {upcoming.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("publishing.column.when")}</TableHead>
              <TableHead>{t("publishing.column.covers")}</TableHead>
              <TableHead>{t("publishing.column.why")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("dashboard.column.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcoming.map((job) => {
              const ids = job.payload.pageIds as string[] | undefined;
              return (
                <TableRow key={job.id}>
                  <TableCell className="tabular-nums">
                    {formatDateTime(job.runAt ?? job.createdAt)}
                  </TableCell>
                  <TableCell>
                    {ids
                      ? ids.map((id) => titleOf(titles, id)).join(", ")
                      : t("publishing.everything")}
                  </TableCell>
                  <TableCell>{triggerOf(job)}</TableCell>
                  <TableCell className="text-right">
                    {canPublish && (
                      <Button variant="default-ghost" size="small" onClick={() => void cancel(job)}>
                        {t("common.cancel")}
                        <span className="sr-only">
                          {" "}
                          {t("publishing.schedule.cancelFor", {
                            time: formatDateTime(job.runAt ?? job.createdAt),
                          })}
                        </span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {/* Few officers schedule, so the form waits behind a toggle; what's scheduled stays in view. */}
      {SCHEDULING_ENABLED && canPublish && (
        <Details>
          <DetailsTrigger>
            {upcoming.length > 0
              ? t("publishing.schedule.another")
              : t("publishing.schedule.later")}
          </DetailsTrigger>
          <DetailsContent>
            <form
              noValidate
              onSubmit={(e) => void schedule(e)}
              className="flex flex-col gap-4 pt-2"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-4">
                  <Field name="schedule-date" invalid={error?.field === "when"}>
                    <FieldLabel>{t("publishing.schedule.date")}</FieldLabel>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  <Field name="schedule-time" invalid={error?.field === "when"}>
                    <FieldLabel>{t("publishing.schedule.time")}</FieldLabel>
                    <Input type="time" value={at} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                </div>
                {error?.field === "when" && (
                  <Field name="schedule-when-error" invalid>
                    <FieldError>{error.message}</FieldError>
                  </Field>
                )}
              </div>
              <Field name="schedule-scope">
                <Fieldset
                  render={
                    <Radio value={scope} onValueChange={(v) => setScope(v as "all" | "pages")} />
                  }
                >
                  <FieldsetLegend className="text-label-md font-medium">
                    {t("publishing.schedule.what")}
                  </FieldsetLegend>
                  <FieldItem>
                    <RadioItem>
                      <RadioButton value="all" id="scope-all" />
                      <RadioLabel htmlFor="scope-all">{t("publishing.schedule.all")}</RadioLabel>
                    </RadioItem>
                  </FieldItem>
                  <FieldItem>
                    <RadioItem>
                      <RadioButton value="pages" id="scope-pages" />
                      <RadioLabel htmlFor="scope-pages">
                        {t("publishing.schedule.pages")}
                      </RadioLabel>
                    </RadioItem>
                  </FieldItem>
                </Fieldset>
              </Field>
              {scope === "pages" && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-label-sm text-txt-black-700 mb-1">
                    {t("publishing.schedule.pagesHint")}
                  </legend>
                  {candidates.length === 0 && (
                    <p className="m-0">{t("publishing.schedule.noCandidates")}</p>
                  )}
                  {candidates.map((page) => (
                    <Field key={page.id} name={`page-${page.id}`}>
                      <FieldItem>
                        <Checkbox
                          checked={chosen.has(page.id)}
                          onCheckedChange={(on) =>
                            setChosen((current) => {
                              const next = new Set(current);
                              if (on) next.add(page.id);
                              else next.delete(page.id);
                              return next;
                            })
                          }
                        />
                        <FieldLabel>
                          {page.title} <span className="text-txt-black-700">{page.path}</span>
                        </FieldLabel>
                      </FieldItem>
                    </Field>
                  ))}
                  {error?.field === "pages" && (
                    <Field name="schedule-pages-error" invalid>
                      <FieldError>{error.message}</FieldError>
                    </Field>
                  )}
                </fieldset>
              )}
              {error?.field === "form" && (
                <Field name="schedule-error" invalid>
                  <FieldError>{error.message}</FieldError>
                </Field>
              )}
              <p className="text-txt-black-700">{t("publishing.schedule.hint")}</p>
              <div>
                {/* Not the grey tone: the Details panel behind it is that grey already. */}
                <Button type="submit" variant="primary-outline" disabled={busy}>
                  {t("publishing.schedule.action")}
                </Button>
              </div>
            </form>
          </DetailsContent>
        </Details>
      )}
    </section>
  );
}

/**
 * Writing every file again, for when the live site looks out of step with
 * what's published. Publishing only writes what changed, so editors rarely
 * need it; it waits behind a toggle and asks first.
 */
function Rebuild() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rebuild = async () => {
    setBusy(true);
    try {
      await siteApi.rebuild();
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ variant: "success", title: t("publishing.rebuild.done") });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("publishing.rebuild.failed"),
        description: (await apiError(caught))?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Details>
        <DetailsTrigger>{t("publishing.rebuild.toggle")}</DetailsTrigger>
        <DetailsContent className="flex flex-col items-start gap-3">
          <p className="text-txt-black-700">{t("publishing.rebuild.hint")}</p>
          <Button variant="primary-outline" disabled={busy} onClick={() => setConfirming(true)}>
            {busy ? t("publishing.rebuild.busy") : t("publishing.rebuild.action")}
          </Button>
        </DetailsContent>
      </Details>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("publishing.rebuild.title")}
        description={t("publishing.rebuild.description")}
        confirm={t("publishing.rebuild.confirm")}
        onConfirm={() => void rebuild()}
      />
    </section>
  );
}

const PAGE_SIZE = 25;

/** Pages by id, for naming the pages a publish touched. */
type Titles = Map<string, PageSummary>;
const byId = (pages: PageSummary[] | undefined): Titles => new Map(pages?.map((p) => [p.id, p]));

const titleOf = (titles: Titles, id: string) => {
  const page = titles.get(id);
  return page ? page.title || t("page.untitled") : t("publishing.missingPage");
};

/** What a publish did, in words: "Soalan Lazim published", "Hubungi Kami and 2 more published". */
function lineOf(job: Job, titles: Titles) {
  const payload = payloadOf(job);
  const ids = swapsOf(job).map((s) => s.pageId);
  const pageId = payload.pageId ?? (ids.length === 1 ? ids[0] : undefined);
  if (pageId && titles.has(pageId))
    return t("publishing.line.page", { title: titleOf(titles, pageId) });
  if (ids.length > 1)
    return t("publishing.line.pages", {
      title: titleOf(titles, ids[0] ?? ""),
      count: ids.length - 1,
    });
  return t(lines[payload.trigger ?? "manual"]);
}

const lines: Record<PublishTrigger, MessageKey> = {
  manual: "publishing.line.manual",
  page: "publishing.line.pageUnknown",
  entry: "publishing.line.pageUnknown",
  settings: "publishing.line.settings",
  navigation: "publishing.line.navigation",
  announcement: "publishing.line.announcement",
  search: "publishing.line.search",
  theme: "publishing.line.theme",
  tree: "publishing.line.tree",
  scheduled: "publishing.line.scheduled",
  retry: "publishing.line.retry",
  undo: "publishing.line.undo",
  rebuild: "publishing.line.rebuild",
  restore: "publishing.line.restore",
};

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** "Today", "Yesterday", or the date: "Sat, 1 Nov". */
function dayOf(iso: string) {
  const yesterday = new Date(Date.now() - 86_400_000);
  if (isToday(iso)) return t("publishing.log.today");
  if (new Date(iso).toDateString() === yesterday.toDateString())
    return t("publishing.log.yesterday");
  return formatDayDate(iso);
}

/** Only publishes with nothing to undo fold together: each undoable one keeps its own row. */
const plain = (job: Job) => job.status === "done" && swapsOf(job).length === 0 && !isUndone(job);

/** A log row: one publish, or several identical ones in a row (three "Site settings published"). */
type Row = { job: Job; line: string; repeats: number };

/** Groups the log by day and folds runs of the same plain publish into one row. */
function daysOf(jobs: Job[], titles: Titles) {
  const days: { label: string; rows: Row[] }[] = [];
  for (const job of jobs) {
    const label = dayOf(job.createdAt);
    let day = days.at(-1);
    if (day?.label !== label) days.push((day = { label, rows: [] }));
    const line = lineOf(job, titles);
    const last = day.rows.at(-1);
    if (last && last.line === line && plain(last.job) && plain(job)) last.repeats++;
    else day.rows.push({ job, line, repeats: 1 });
  }
  return days;
}

const toneOf = (job: Job): Tone =>
  job.status === "failed"
    ? "danger"
    : skippedCount(job)
      ? "warning"
      : job.status === "done" && !isUndone(job)
        ? "success"
        : "neutral";

function Log() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ["jobs", "log", page],
    queryFn: () => jobsApi.list({ scheduled: false, kind: "publish", page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((j) => j.status === "queued" || j.status === "running")
        ? 1000
        : 15_000,
  });
  const items = jobs.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((jobs.data?.total ?? 0) / PAGE_SIZE));
  const pageList = usePages().data;
  const titles = useMemo(() => byId(pageList), [pageList]);
  const days = useMemo(() => daysOf(jobs.data?.items ?? [], titles), [jobs.data, titles]);
  return (
    <section aria-labelledby="log-heading" className="gap-stack-md flex flex-col">
      <h2 id="log-heading" className="text-title font-semibold">
        {t("publishing.log")}
      </h2>
      {jobs.isError ? (
        <Callout variant="danger">
          <CalloutTitle>{t("publishing.loadFailed")}</CalloutTitle>
          <CalloutContent>
            <Button variant="default-outline" size="small" onClick={() => void jobs.refetch()}>
              {t("publishing.reload")}
            </Button>
          </CalloutContent>
        </Callout>
      ) : (
        <div className="gap-stack-sm flex flex-col">
          {!jobs.data ? (
            <Skeleton className="h-40 w-full" />
          ) : items.length === 0 ? (
            <p className="text-txt-black-700 m-0">{t("publishing.log.none")}</p>
          ) : (
            days.map((day, i) => (
              <section key={day.label} aria-labelledby={`log-day-${i}`} className="flex flex-col">
                <h3 id={`log-day-${i}`} className="text-txt-black-700 mb-1 font-medium">
                  {day.label}
                </h3>
                {/* A timeline: the line joins the day's publishes, the dot says how each went. */}
                <ol className="before:bg-otl-gray-200 relative m-0 list-none p-0 before:absolute before:top-5 before:bottom-5 before:left-[11px] before:w-px">
                  {day.rows.map((row) => (
                    <li key={row.job.id} className="relative">
                      <span
                        aria-hidden
                        className={clx(
                          "ring-bg-white absolute top-4 left-2 size-2 rounded-full ring-4",
                          toneDot[toneOf(row.job)],
                        )}
                      />
                      {/* The whole row opens what the publish did. */}
                      <button
                        type="button"
                        onClick={() => setOpen(row.job.id)}
                        className="focus-ring hover:bg-bg-washed group flex w-full items-center gap-3 rounded-md py-2.5 pr-2 pl-7 text-left transition-colors duration-150 motion-reduce:transition-none"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium group-hover:underline">
                            {row.line}
                          </span>
                          {/* Under the line, so a tag never cuts the title short. */}
                          <span className="text-label-compact text-txt-black-700 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                            {formatTime(row.job.createdAt)}
                            {row.repeats > 1 &&
                              ` · ${t("publishing.log.times", { count: row.repeats })}`}
                            {/* Words only where it didn't simply go live; the dot carries the rest. */}
                            {(row.job.status !== "done" ||
                              isUndone(row.job) ||
                              Boolean(row.job.result?.failed)) && <ResultTag job={row.job} />}
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden
                          className="text-txt-black-700 size-4 shrink-0"
                        />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label={t("publishing.paging")} className="flex items-center justify-end gap-2">
          <span className="text-txt-black-700 tabular-nums">
            {t("media.pageOf", { page, pages })}
          </span>
          <Button
            variant="default-outline"
            size="small"
            disabled={page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            {t("common.previous")}
          </Button>
          <Button
            variant="default-outline"
            size="small"
            disabled={page === pages}
            onClick={() => setPage((n) => n + 1)}
          >
            {t("common.next")}
          </Button>
        </nav>
      )}
      <JobDrawer id={open} titles={titles} onClose={() => setOpen(null)} />
    </section>
  );
}

const outcomes: Record<
  PublishLogEntry["outcome"],
  { label: MessageKey; variant: "success" | "default" | "warning" | "danger" }
> = {
  written: { label: "publishing.outcome.written", variant: "success" },
  redirect: { label: "publishing.outcome.redirect", variant: "default" },
  removed: { label: "publishing.outcome.removed", variant: "warning" },
  failed: { label: "publishing.outcome.failed", variant: "danger" },
};

function JobDrawer({
  id,
  titles,
  onClose,
}: {
  id: string | null;
  titles: Titles;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Undo changes pages, not the site documents.
  const refresh = useRefreshPages();
  const { toast } = useToast();
  const job = useQuery({
    queryKey: ["jobs", "one", id],
    queryFn: () => jobsApi.detail(id ?? ""),
    enabled: id !== null,
  });
  const data = job.data?.id === id ? job.data : undefined;
  const failed = data?.log.filter((e) => e.outcome === "failed") ?? [];
  const swaps = data ? swapsOf(data) : [];
  const canManage = useCan("site.manage");
  const undoable = canManage && data !== undefined && canUndo(data);
  // Pages a publish left as they were: it only writes what changed.
  const unchanged = data?.result?.unchanged ?? 0;
  const [busy, setBusy] = useState<"retry" | "undo" | null>(null);
  const [confirming, setConfirming] = useState(false);

  const retry = async () => {
    if (!data) return;
    setBusy("retry");
    try {
      await jobsApi.retry(data.id);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ variant: "success", title: t("publishing.retried") });
      onClose();
    } catch (caught) {
      // The drawer stays open, so the officer can try again.
      toast({
        variant: "error",
        title: t("publishing.retryFailed"),
        description: (await apiError(caught))?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (!data) return;
    setBusy("undo");
    try {
      const result = await siteApi.undo(data.id);
      void refresh();
      const done = await waitForJob(result.job);
      await Promise.all(
        ["jobs", "summary"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      if (done.status === "failed") throw new Error(done.error ?? "The rebuild failed");
      toast({
        variant: "success",
        title: t("publishing.undo.done", { count: result.putBack }),
        ...(result.skipped > 0 && {
          description: t("publishing.undo.skipped", { count: result.skipped }),
        }),
      });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("publishing.undo.failed"),
        description: (await apiError(caught))?.message ?? t("common.tryAgain"),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer side="right" open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="w-full sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{data ? lineOf(data, titles) : t("publishing.job")}</DrawerTitle>
          {data && (
            <DrawerDescription>
              {formatDateTime(data.createdAt)} · {triggerOf(data)} · <ResultTag job={data} />
            </DrawerDescription>
          )}
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4">
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {isUndone(data) && (
                <p className="text-body-sm text-txt-black-700">{t("publishing.undoneNote")}</p>
              )}
              {failed.length > 0 && (
                <Callout variant={data.status === "failed" ? "danger" : "warning"}>
                  <CalloutTitle>
                    {data.status === "failed"
                      ? t("publishing.failedTitle")
                      : t("publishing.skippedTitle")}
                  </CalloutTitle>
                  <CalloutContent className="flex flex-col gap-2">
                    {failed.map((entry) => (
                      <div key={entry.path} className="flex flex-col items-start gap-1">
                        <p>
                          {t("publishing.failedAt", {
                            title: entry.title,
                            path: entry.path,
                            block: entry.blockType
                              ? blockLabel(entry.blockType)
                              : t("publishing.unknownBlock"),
                          })}
                        </p>
                        {entry.pageId && (
                          <Link
                            to="/pages/$id/edit"
                            params={{ id: entry.pageId }}
                            className={linkClass}
                          >
                            {t("publishing.openEditor")}
                            <span className="sr-only"> {entry.title}</span>
                          </Link>
                        )}
                      </div>
                    ))}
                    {data.error && (
                      <Details>
                        <DetailsTrigger>{t("publishing.technical")}</DetailsTrigger>
                        <DetailsContent>
                          <p className="text-body-sm break-words">{data.error}</p>
                        </DetailsContent>
                      </Details>
                    )}
                  </CalloutContent>
                </Callout>
              )}
              {data.log.length === 0 ? (
                <p className="text-body-sm text-txt-black-700">
                  {unchanged > 0
                    ? t("publishing.unchangedOnly", { count: unchanged })
                    : t("publishing.noLog")}
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("publishing.column.page")}</TableHead>
                        <TableHead>{t("publishing.column.result")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.log.map((entry) => (
                        <TableRow key={`${entry.outcome}-${entry.path}`}>
                          <TableCell>
                            <span className="flex min-w-0 flex-col">
                              {entry.pageId ? (
                                <Link
                                  to="/pages/$id"
                                  params={{ id: entry.pageId }}
                                  className={clx("truncate", linkClass)}
                                >
                                  {entry.title || t("page.untitled")}
                                </Link>
                              ) : (
                                <span className="truncate font-medium">
                                  {entry.title || entry.path}
                                </span>
                              )}
                              <span className="text-body-sm text-txt-black-700 truncate">
                                {entry.path}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell>
                            <Tag size="small" variant={outcomes[entry.outcome].variant}>
                              {t(outcomes[entry.outcome].label)}
                            </Tag>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {unchanged > 0 && (
                    <p className="text-body-sm text-txt-black-700">
                      {t("publishing.unchanged", { count: unchanged })}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </DrawerBody>
        {canManage && data?.status === "failed" && (
          <DrawerFooter>
            <Button variant="primary-fill" disabled={busy !== null} onClick={() => void retry()}>
              {busy === "retry" ? t("publish.busy") : t("publishing.retry")}
            </Button>
          </DrawerFooter>
        )}
        {undoable && (
          <DrawerFooter>
            <Button
              variant="default-outline"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              {busy === "undo" ? t("publishing.undo.busy") : t("publishing.undo.action")}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("publishing.undo.title")}
        description={t("publishing.undo.description")}
        confirm={t("publishing.undo.confirm")}
        onConfirm={() => void undo()}
      >
        <div className="flex flex-col gap-3">
          <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0">
            {swaps.map((swap) => (
              <li key={swap.pageId}>
                <span className="font-medium">{titleOf(titles, swap.pageId)}</span>{" "}
                <span className="text-txt-black-700">
                  {t(swap.previous ? "publishing.undo.wasLive" : "publishing.undo.wasNew")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-txt-black-700">{t("publishing.undo.docs")}</p>
        </div>
      </ConfirmDialog>
    </Drawer>
  );
}
