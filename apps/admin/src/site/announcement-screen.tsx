/**
 * The announcement: one sentence in a bar under the navbar, on every page or
 * the home page. It's the urgent path (an office closed by floods, a system
 * down), so it has its own screen and its own document: Publish announcement
 * saves and sends it live in one step, after saying what visitors will see,
 * and never takes navbar changes with it. The form asks three questions
 * (what's happening, until when, where), and the preview shows the bar as
 * it's written. It works on a phone, where the preview is left out.
 */
import { Announcement, type AnnouncementDoc, type AnnouncementVariant } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { card } from "@/components/card";
import { PublishControl } from "@/components/publish-control";
import { linkClass } from "@/components/text-link";
import { useDocConflict } from "@/components/conflict-dialog";
import { DiscardEditsDialog, PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { CharacterCount } from "@/components/character-count";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Input } from "@/components/ui/input";
import { Radio, RadioButton, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { Tag, type TagProps } from "@/components/ui/tag";
import { locale, type MessageKey, t } from "@/i18n";
import { apiError, siteApi } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { clx } from "@/lib/ftds/utils";
import { useAnnouncementDoc, usePublish } from "@/lib/publish";
import { LivePreview } from "./live-preview";
import { SwitchRow, TextInput, Warnings } from "./navigation-screen";
import { TargetField } from "./target-field";

const variants: { value: AnnouncementVariant; label: MessageKey }[] = [
  { value: "primary", label: "navigation.variant.primary" },
  { value: "warning", label: "navigation.variant.warning" },
  { value: "danger", label: "navigation.variant.danger" },
  { value: "success", label: "navigation.variant.success" },
  { value: "default", label: "navigation.variant.default" },
];

// Days start and end in Malaysia time, wherever the officer is: UTC+8, with no daylight saving.
const TIME_ZONE = "Asia/Kuala_Lumpur";
const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const whenOf = new Intl.DateTimeFormat(locale(), {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const formatWhen = (iso: string) => whenOf.format(new Date(iso));

/** A date input's value from an ISO time. */
const dateOf = (iso?: string) => (iso ? dayOf.format(new Date(iso)) : "");
/** Start of the day for "show from", end of it for "show until". */
const isoOf = (date: string, end: boolean) =>
  date ? new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}+08:00`).toISOString() : undefined;
/** The date `days` from today, as a date input's value. */
const dayFrom = (days = 0) => dayOf.format(Date.now() + days * 86_400_000);
const endOfDay = (days: number) => isoOf(dayFrom(days), true) as string;

type Until = "today" | "tomorrow" | "date" | "none";
const untilChoices: Until[] = ["today", "tomorrow", "date", "none"];
/** The end date each choice sets, given the one there is. */
const untilFor: Record<Until, (current?: string) => string | undefined> = {
  today: () => endOfDay(0),
  tomorrow: () => endOfDay(1),
  date: (current) => current ?? endOfDay(7),
  none: () => undefined,
};
const untilOf = (until?: string): Until => {
  if (!until) return "none";
  const day = dateOf(until);
  return day === dayFrom(0) ? "today" : day === dayFrom(1) ? "tomorrow" : "date";
};

/** Whether the bar has anything to show, whatever its dates. */
const visible = (a: Announcement) => a.on && a.message.trim() !== "";

type Bar = "off" | "scheduled" | "ended" | "showing";
const barLook: Record<Bar, { label: MessageKey; tone: TagProps["variant"] }> = {
  off: { label: "announcement.state.off", tone: "default" },
  scheduled: { label: "announcement.state.scheduled", tone: "primary" },
  ended: { label: "announcement.state.ended", tone: "default" },
  showing: { label: "announcement.state.showing", tone: "success" },
};

/** What visitors see now: the bar's own state, apart from whether there are edits to publish. */
function barState(a: Announcement, at = Date.now()): { bar: Bar; text: string } {
  const where = t(`announcement.where.${a.scope}`);
  if (!visible(a)) return { bar: "off", text: t("announcement.state.offText") };
  if (a.from && at < Date.parse(a.from))
    return {
      bar: "scheduled",
      text: t("announcement.state.from", { where, date: formatWhen(a.from) }),
    };
  if (a.until && at > Date.parse(a.until))
    return { bar: "ended", text: t("announcement.state.endedText", { date: formatWhen(a.until) }) };
  return {
    bar: "showing",
    text: a.until
      ? t("announcement.state.until", { where, date: formatWhen(a.until) })
      : t("announcement.state.noEnd", { where }),
  };
}

/** Problems with a link's target are shown on the whole "Goes to" field. */
const fieldOf = (path: string) => (path.startsWith("link.target") ? "link.target" : path);

/**
 * Field problems, by dotted path, from the same rules the server applies on
 * save, and one it doesn't: a bar switched on needs a message.
 */
function problems(a: Announcement): Map<string, string> {
  const out = new Map<string, string>();
  const result = Announcement.safeParse(a);
  for (const issue of result.success ? [] : result.error.issues) {
    const path = fieldOf(issue.path.join("."));
    const pageMissing = path === "link.target" && a.link?.target.kind === "page";
    if (!out.has(path)) out.set(path, pageMissing ? t("nav.target.choosePage") : issue.message);
  }
  if (a.on && !a.message.trim()) out.set("message", t("announcement.message.required"));
  return out;
}

export function AnnouncementScreen() {
  const doc = useAnnouncementDoc();
  if (doc.isError)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("announcement.loadFailed")}</CalloutTitle>
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
        <div className="bg-bg-washed flex flex-1 flex-col gap-4 p-4 md:max-w-[460px]">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  return <Editor doc={doc.data} />;
}

function Editor({ doc }: { doc: AnnouncementDoc }) {
  // Taking the bar down publishes at once.
  const canPublish = useCan("content.publish");
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 768px)");
  const [draft, setDraft] = useState<Announcement>(doc.draft);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<Map<string, string>>(new Map());
  const [showAll, setShowAll] = useState(false);
  // Kept apart from the draft: "on a date I choose" and "start later" can be chosen before a date is.
  const [later, setLater] = useState(Boolean(doc.draft.from));
  const [until, setUntil] = useState<Until>(() => untilOf(doc.draft.until));
  const [discarding, setDiscarding] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(doc.draft);
  const local = useMemo(() => problems(draft), [draft]);
  const issue = (path: string) => serverIssues.get(path) ?? (showAll ? local.get(path) : undefined);
  const set = (next: Partial<Announcement>) => {
    setServerIssues((prev) => (prev.size ? new Map() : prev));
    setDraft((d) => ({ ...d, ...next }));
  };
  /** Starts the form again from `next`: after a save, a discard or a put-back. */
  const load = (next: Announcement) => {
    setDraft(next);
    setLater(Boolean(next.from));
    setUntil(untilOf(next.until));
    setServerIssues(new Map());
    setShowAll(false);
  };
  const leaveGuard = useLeaveGuard(dirty, t("announcement.leave.body"));
  const conflict = useDocConflict<Announcement>("announcement", {
    onLoad: load,
    retry: () => save(),
  });

  const save = async () => {
    // The review stops a publish with problems; this catches anything else that saves.
    if (local.size) {
      setShowAll(true);
      throw new Error("The announcement has problems to fix");
    }
    setSaving(true);
    setServerIssues(new Map());
    try {
      const next = await siteApi.saveAnnouncement(draft);
      queryClient.setQueryData(["announcement"], next);
      setDraft(next.draft);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    } catch (caught) {
      // Stops a publish that saves first, and asks which to keep.
      if (await conflict.handle(caught)) throw caught;
      const body = await apiError(caught);
      setServerIssues(
        body?.code === "announcement_dates"
          ? new Map([["until", body.message]])
          : new Map(
              body?.details?.map((d) => [fieldOf(d.path.replace(/^draft\./, "")), d.message]),
            ),
      );
      // Stops a publish that saves first.
      throw caught;
    } finally {
      setSaving(false);
    }
  };
  const discard = async () => {
    const next = await siteApi.discardAnnouncement();
    queryClient.setQueryData(["announcement"], next);
    load(next.draft);
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const state = barState(doc.published);
  const look = barLook[state.bar];

  const header = (
    <header className="bg-bg-white px-surface border-otl-gray-200 flex flex-wrap items-start gap-x-6 gap-y-3 border-b pt-5 pb-4">
      <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
        <span
          aria-hidden
          className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
        >
          <MegaphoneIcon />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-title text-txt-black-900 truncate font-semibold">
            {t("announcement.title")}
          </h1>
          <p className="text-body-sm text-txt-black-500">{t("announcement.everyPage")}</p>
          <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-2 pt-1">
            <Tag size="small" variant={look.tone} dot>
              {t(look.label)}
            </Tag>
            {state.text}
          </p>
        </div>
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        {canPublish && (state.bar === "showing" || state.bar === "scheduled") && (
          <EndNow doc={doc} onEnded={load} />
        )}
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
          label={t("announcement.publish")}
          beforePublish={dirty ? save : undefined}
          viewPath="/"
          onPublish={() => siteApi.publishDoc("announcement")}
          review={{
            title: t("announcement.review.title"),
            description: t("announcement.review.description"),
            body: <PublishReview draft={draft} issues={local} />,
            blocked: local.size > 0,
          }}
        />
      </div>
    </header>
  );

  const form = (
    <div className="bg-bg-washed flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {doc.warnings.length > 0 && <Warnings warnings={doc.warnings} />}
      <div className={clx(card, "border-otl-gray-200 shrink-0 p-4")}>
        <SwitchRow
          title={t("navigation.announcement.on")}
          hint={draft.on ? t("navigation.announcement.onHint") : t("announcement.offHint")}
          checked={draft.on}
          onCheckedChange={(on) => {
            // An urgent notice shouldn't stay up forever by default.
            if (on && !draft.until) {
              set({ on, until: endOfDay(1) });
              setUntil("tomorrow");
            } else set({ on });
          }}
        />
      </div>
      {draft.on && (
        <>
          <Question n={1} title={t("announcement.q.what")} hint={t("announcement.q.whatHint")}>
            <Field name="message" invalid={Boolean(issue("message"))}>
              <FieldLabel>{t("navigation.announcement.message")}</FieldLabel>
              <FieldDescription>{t("navigation.announcement.messageHint")}</FieldDescription>
              <CharacterCount
                limit={120}
                rows={2}
                value={draft.message}
                onValueChange={(message) => set({ message })}
              />
              <FieldError>{issue("message")}</FieldError>
            </Field>
            <TextInput
              name="tag"
              label={t("navigation.announcement.tag")}
              hint={t("announcement.tagHint")}
              value={draft.tag}
              max={24}
              error={issue("tag")}
              onChange={(tag) => set({ tag })}
            />
            {/* Each colour shows the tag as it will look, named by what it means. */}
            {draft.tag.trim() && (
              <Choice
                name="variant"
                legend={t("navigation.announcement.variant")}
                value={draft.variant}
                onChange={(variant) => set({ variant })}
                options={variants.map((v) => ({
                  value: v.value,
                  label: (
                    <>
                      <Tag size="small" variant={v.value} className="max-w-40">
                        {draft.tag}
                      </Tag>
                      <span className="truncate">{t(v.label)}</span>
                    </>
                  ),
                }))}
              />
            )}
            <div className="border-otl-gray-200 flex flex-col gap-4 border-t pt-4">
              <SwitchRow
                title={t("navigation.announcement.link")}
                checked={Boolean(draft.link)}
                onCheckedChange={(on) =>
                  set({
                    link: on
                      ? {
                          label: t("navigation.announcement.linkDefault"),
                          // Most notices lead to a page of their own; the officer picks it.
                          target: { kind: "page", pageId: "" },
                        }
                      : undefined,
                  })
                }
              />
              {draft.link && (
                <>
                  <TextInput
                    name="link.label"
                    label={t("navigation.label")}
                    value={draft.link.label}
                    max={60}
                    error={issue("link.label")}
                    onChange={(label) => draft.link && set({ link: { ...draft.link, label } })}
                  />
                  <TargetField
                    name="link.target"
                    value={draft.link.target}
                    error={issue("link.target")}
                    onChange={(target) => draft.link && set({ link: { ...draft.link, target } })}
                  />
                </>
              )}
            </div>
          </Question>

          <Question n={2} title={t("announcement.q.when")} hint={t("announcement.q.whenHint")}>
            <Choice
              name="until"
              legend={t("navigation.announcement.until")}
              hideLegend
              value={until}
              error={issue("until")}
              onChange={(next) => {
                setUntil(next);
                set({ until: untilFor[next](draft.until) });
              }}
              options={untilChoices.map((choice) => ({
                value: choice,
                label: t(`announcement.until.${choice}`),
              }))}
            />
            {until === "date" && (
              <Field name="untilDate">
                <FieldLabel>{t("announcement.until.lastDay")}</FieldLabel>
                <Input
                  type="date"
                  min={dayFrom()}
                  value={dateOf(draft.until)}
                  onChange={(e) => set({ until: isoOf(e.target.value, true) })}
                />
              </Field>
            )}
            {until === "none" && (
              <p className="text-body-sm text-txt-warning flex items-start gap-2">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("announcement.until.noneWarning")}
              </p>
            )}
            <div className="border-otl-gray-200 flex flex-col gap-4 border-t pt-4">
              <SwitchRow
                title={t("announcement.later")}
                hint={t("announcement.laterHint")}
                checked={later}
                onCheckedChange={(on) => {
                  setLater(on);
                  if (!on) set({ from: undefined });
                }}
              />
              {later && (
                <Field name="from">
                  <FieldLabel>{t("navigation.announcement.from")}</FieldLabel>
                  <Input
                    type="date"
                    value={dateOf(draft.from)}
                    onChange={(e) => set({ from: isoOf(e.target.value, false) })}
                  />
                </Field>
              )}
            </div>
          </Question>

          <Question n={3} title={t("announcement.q.where")}>
            <Choice
              name="scope"
              legend={t("navigation.announcement.scope")}
              hideLegend
              value={draft.scope}
              onChange={(scope) => set({ scope })}
              options={(["all", "home"] as const).map((scope) => ({
                value: scope,
                label: t(`navigation.announcement.scope.${scope}`),
              }))}
            />
          </Question>
        </>
      )}
      {doc.previous && !dirty && !doc.changed && (
        <PutBackPrevious
          label={t("announcement.previous.load")}
          onPutBack={() => doc.previous && load(doc.previous)}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {header}
      {/* On a phone the form is the whole screen: the preview needs a desktop's width. */}
      {wide ? (
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="admin.announcement.split"
          defaultWidth={460}
          maxWidth={720}
          startLabel={t("navigation.editor")}
          endLabel={t("navigation.preview")}
          start={<div className="flex h-full flex-col">{form}</div>}
          end={<AnnouncementPreview draft={draft} issues={local} />}
        />
      ) : (
        form
      )}
      <DiscardEditsDialog
        open={discarding}
        onOpenChange={setDiscarding}
        body={t("announcement.discardEdits.body")}
        onDiscard={() => load(doc.draft)}
      />
      {leaveGuard}
      {conflict.dialog}
    </div>
  );
}

/** One of the form's three questions, in a card with its number and a heading to jump to. */
function Question({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-4 p-4")}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-bg-primary-100 text-txt-primary text-label-sm grid size-6 shrink-0 place-items-center rounded-full font-semibold"
        >
          {n}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="text-label-lg text-txt-black-900 font-semibold">
            {title}
          </h2>
          {hint && <p className="text-body-sm text-txt-black-700">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A set of radios: one choice, each option labelled and given an id from its value. */
export function Choice<T extends string>({
  name,
  legend,
  hideLegend = false,
  value,
  options,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  /** When the card's heading already asks the question. */
  hideLegend?: boolean;
  value: T;
  options: { value: T; label: ReactNode }[];
  error?: string | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <Field name={name} invalid={Boolean(error)}>
      <Fieldset render={<Radio value={value} onValueChange={(v) => onChange(v as T)} />}>
        <FieldsetLegend className={hideLegend ? "sr-only" : "text-label-md font-medium"}>
          {legend}
        </FieldsetLegend>
        {options.map((option) => (
          <FieldItem key={option.value}>
            <RadioItem>
              <RadioButton value={option.value} id={`${name}-${option.value}`} />
              <RadioLabel
                htmlFor={`${name}-${option.value}`}
                className="flex min-w-0 items-center gap-2"
              >
                {option.label}
              </RadioLabel>
            </RadioItem>
          </FieldItem>
        ))}
      </Fieldset>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** What Publish will put on the site, in words: for anyone, and the only preview a screen reader gets. */
function PublishReview({
  draft,
  issues,
}: {
  draft: Announcement;
  /** The draft's problems, by field. */
  issues: Map<string, string>;
}) {
  const fix = [...issues.values()];
  if (!visible(draft) && !fix.length) return <p>{t("announcement.review.off")}</p>;
  const line = t("announcement.review.on", {
    where: t(`announcement.where.${draft.scope}`),
    from: draft.from
      ? t("announcement.review.fromDate", { date: formatWhen(draft.from) })
      : t("announcement.review.fromNow"),
    until: draft.until
      ? t("announcement.review.untilDate", { date: formatWhen(draft.until) })
      : t("announcement.review.noEnd"),
  });
  return (
    <div className="flex flex-col gap-3">
      {fix.length > 0 && (
        <div className="text-txt-danger" role="alert">
          <p>{t("announcement.review.blocked")}</p>
          <ul className="m-0 list-disc pl-5">
            {fix.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="bg-bg-washed border-otl-gray-200 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
        {draft.tag.trim() && (
          <Tag size="small" variant={draft.variant}>
            {draft.tag}
          </Tag>
        )}
        <span className="text-txt-black-900">
          {draft.message}
          {draft.link && <span className={clx("ml-1", linkClass)}>{draft.link.label}</span>}
        </span>
      </p>
      <p>{line}</p>
      {!draft.until && <p className="text-txt-warning">{t("announcement.review.noEndWarning")}</p>}
      <p className="text-txt-black-700">{t("announcement.review.undo")}</p>
    </div>
  );
}

/** Takes the bar down now: as easy as putting it up. */
function EndNow({
  doc,
  onEnded,
}: {
  doc: AnnouncementDoc;
  onEnded: (draft: Announcement) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ended = { ...doc.published, on: false };
  const { outcome, publish } = usePublish(async () => {
    const saved = await siteApi.saveAnnouncement(ended);
    queryClient.setQueryData(["announcement"], saved);
    onEnded(saved.draft);
    return siteApi.publishDoc("announcement");
  });
  const busy = outcome.status === "publishing";
  return (
    <>
      <Button
        className="whitespace-nowrap"
        variant="default-outline"
        size="small"
        onClick={() => setOpen(true)}
      >
        {t("announcement.end")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent dismissible={!busy}>
          <AlertDialogTitle>{t("announcement.end.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {doc.changed ? t("announcement.end.bodyChanged") : t("announcement.end.body")}
          </AlertDialogDescription>
          {outcome.status === "failed" && (
            <p className="text-txt-danger text-body-sm" role="alert">
              {t("publish.failedHere")}
            </p>
          )}
          <AlertDialogAction>
            <AlertDialogClose render={<Button variant="default-outline" disabled={busy} />}>
              {t("announcement.end.keep")}
            </AlertDialogClose>
            <Button
              variant="primary-fill"
              disabled={busy}
              onClick={() => void publish().then((end) => end.status === "live" && setOpen(false))}
            >
              {busy ? t("publish.busy") : t("announcement.end.confirm")}
            </Button>
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The home page with the announcement being written on it, as visitors will see it once published. */
function AnnouncementPreview({
  draft,
  issues,
}: {
  draft: Announcement;
  /** The draft's problems, by field. */
  issues: Map<string, string>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // A link still being filled in is left out, as the server would refuse it.
  const linkReady = ![...issues.keys()].some((path) => path.startsWith("link."));
  const shown = { ...draft, link: linkReady ? draft.link : undefined };
  return (
    <LivePreview
      frame={frame}
      render={(pageId, signal) => siteApi.renderWithSite(pageId, { announcement: shown }, signal)}
      // Only these reach the bar: the preview ignores dates, and shows the home page.
      renderKey={JSON.stringify([shown.on, shown.message, shown.tag, shown.variant, shown.link])}
      regions={["[data-announcement]"]}
      caption={visible(draft) ? t("announcement.preview.caption") : t("announcement.preview.off")}
      onSwap={() => frame.current?.contentWindow?.scrollTo(0, 0)}
    />
  );
}
