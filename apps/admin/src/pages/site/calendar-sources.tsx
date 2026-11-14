/**
 * A listing's calendar sources, in its Settings: the ICS feeds its events are
 * synced from, how each last read went, and (for admins) adding, changing and
 * removing them. Content Managers can sync now and accept a held drop.
 */
import type { CalendarSource, Job, Page } from "@laman/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { CalendarIcon } from "@/components/ui/icons/calendar";
import { PlusIcon } from "@/components/ui/icons/plus";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { apiError, calendarApi, waitForJob } from "@/lib/api";
import { useCan } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { useFailure } from "@/lib/use-failure";
import { formatDateTime } from "@/lib/pages";
import { useListing } from "./listing";

const sourcesKey = (listingId: string) => ["calendar-sources", listingId];

/** Cached for a while: the editor's card and Settings read the same list one after the other. */
const useSources = (listingId: string) =>
  useQuery({
    queryKey: sourcesKey(listingId),
    queryFn: () => calendarApi.list(listingId),
    staleTime: 30_000,
  });

/** Failing to read, or held back: what SourceStatus shows as a problem. */
const needsAttention = (source: CalendarSource) => source.held !== null || Boolean(source.error);

/**
 * Runs something that queues a sync, then refreshes the list once that sync
 * has finished, so it shows what the sync found.
 */
function useSync(listingId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fail = useFailure();
  const [busy, setBusy] = useState(false);
  const run = async (start: () => Promise<Job>, done: MessageKey) => {
    setBusy(true);
    try {
      const job = await start();
      toast({ variant: "success", title: t(done) });
      await waitForJob(job);
      await queryClient.invalidateQueries({ queryKey: sourcesKey(listingId) });
    } catch (caught) {
      await fail(t("calendars.syncFailed"), caught);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/**
 * In the editor, beside a selected Event calendar: where its events come from,
 * and the way to its calendar sources in the listing's Settings.
 */
export function CalendarSourcesCta({
  listingId,
  onOpen,
}: {
  listingId: string;
  onOpen: () => void;
}) {
  const sources = useSources(listingId).data;
  const attention = sources?.filter(needsAttention).length ?? 0;
  return (
    <div className="bg-bg-washed m-4 flex flex-col items-start gap-2 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <CalendarIcon aria-hidden className="text-txt-black-700 size-4 shrink-0" />
        <h3 className="text-label-md text-txt-black-900 font-semibold">
          {t("settings.calendars.title")}
        </h3>
      </div>
      {sources && (
        <p className="text-body-sm text-txt-black-700">
          {sources.length === 0
            ? t("calendars.cta.none")
            : t("calendars.cta.count", { count: sources.length })}
          {attention > 0 && (
            <span className="text-txt-danger">
              {" "}
              {t("calendars.cta.attention", { count: attention })}
            </span>
          )}
        </p>
      )}
      <Button variant="default-outline" size="small" onClick={onOpen}>
        {t("calendars.cta.open")}
      </Button>
    </div>
  );
}

/** "Sync now": reads every calendar. Not offered until the listing has one. */
export function SyncNowButton({ listing }: { listing: Page }) {
  const { busy, run } = useSync(listing.id);
  if (!useSources(listing.id).data?.length) return null;
  return (
    <Button
      variant="default-outline"
      disabled={busy}
      onClick={() => void run(calendarApi.sync, "calendars.syncQueued")}
    >
      {t("calendars.syncNow")}
    </Button>
  );
}

export function CalendarSources({ listing }: { listing: Page }) {
  const manage = useCan("site.manage");
  const sources = useSources(listing.id);
  const settings = useListing(listing.id).data?.settings;
  const [editing, setEditing] = useState<CalendarSource | "new">();
  const [removing, setRemoving] = useState<CalendarSource>();
  const addButton = manage && (
    <Button variant="default-outline" onClick={() => setEditing("new")}>
      <PlusIcon /> {t("calendars.add")}
    </Button>
  );

  if (!sources.data)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      {sources.data.length === 0 ? (
        <EmptyState className="border-otl-gray-200 rounded-lg border border-dashed py-8">
          <EmptyStateIcon>
            <CalendarIcon />
          </EmptyStateIcon>
          <EmptyStateTitle as="p">{t("calendars.none")}</EmptyStateTitle>
          <EmptyStateDescription>
            {manage ? t("calendars.none.body") : t("calendars.none.ask")}
          </EmptyStateDescription>
          {addButton && <EmptyStateActions>{addButton}</EmptyStateActions>}
        </EmptyState>
      ) : (
        <ul className="divide-otl-gray-200 border-otl-gray-200 flex flex-col divide-y rounded-lg border">
          {sources.data.map((source) => {
            const category = settings?.categories.find((c) => c.slug === source.category)?.name;
            return (
              <li key={source.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-3">
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-content text-txt-black-900 font-medium">
                      {source.name}
                    </span>
                    {category && <Tag size="small">{category}</Tag>}
                    {!source.enabled && <Tag size="small">{t("calendars.off")}</Tag>}
                  </div>
                  <span className="text-body-sm text-txt-black-500 truncate">{source.address}</span>
                  <SourceStatus source={source} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {source.held !== null && <AcceptButton source={source} />}
                  {manage && (
                    <>
                      <Button
                        variant="default-ghost"
                        size="small"
                        onClick={() => setEditing(source)}
                      >
                        {t("calendars.change")}
                      </Button>
                      <Button
                        variant="danger-ghost"
                        size="small"
                        onClick={() => setRemoving(source)}
                      >
                        {t("calendars.remove")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {addButton && sources.data.length > 0 && <div>{addButton}</div>}
      <HowItWorks />
      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        {editing !== undefined && (
          <SourceForm
            listing={listing}
            source={editing === "new" ? undefined : editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Dialog>
      <AlertDialog
        variant="danger"
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        {removing && <RemoveDialog source={removing} onDone={() => setRemoving(undefined)} />}
      </AlertDialog>
    </div>
  );
}

/** The Outlook steps and the sync's rules, for whoever needs them. */
function HowItWorks() {
  return (
    <Details>
      <DetailsTrigger>{t("calendars.help")}</DetailsTrigger>
      <DetailsContent className="flex flex-col gap-3">
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          <li>{t("calendars.help.step1")}</li>
          <li>{t("calendars.help.step2")}</li>
          <li>{t("calendars.help.step3")}</li>
        </ol>
        <p className="text-txt-black-900 font-medium">{t("calendars.help.notes")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("calendars.help.edit")}</li>
          <li>{t("calendars.help.shared")}</li>
          <li>{t("calendars.help.held")}</li>
          <li>{t("calendars.help.private")}</li>
        </ul>
      </DetailsContent>
    </Details>
  );
}

/** How the last read went: synced, failing, or held back. */
function SourceStatus({ source }: { source: CalendarSource }) {
  if (source.held !== null)
    return (
      <p className="text-body-sm text-txt-warning">
        {t("calendars.held", { found: source.held, had: source.events })}
      </p>
    );
  if (source.error)
    return (
      <p className="text-body-sm text-txt-danger">
        {t("calendars.failing", { error: source.error, count: source.failures })}
        {source.syncedAt && ` ${t("calendars.lastGood", { at: formatDateTime(source.syncedAt) })}`}
      </p>
    );
  if (!source.syncedAt)
    return <p className="text-body-sm text-txt-black-500">{t("calendars.waiting")}</p>;
  return (
    <p className="text-body-sm text-txt-black-700">
      {t("calendars.synced", { at: formatDateTime(source.syncedAt), count: source.events })}
    </p>
  );
}

function AcceptButton({ source }: { source: CalendarSource }) {
  const { busy, run } = useSync(source.listingId);
  return (
    <Button
      variant="default-outline"
      size="small"
      disabled={busy}
      onClick={() => void run(() => calendarApi.accept(source.id), "calendars.accepted")}
    >
      {t("calendars.accept")}
    </Button>
  );
}

function SourceForm({
  listing,
  source,
  onDone,
}: {
  listing: Page;
  source: CalendarSource | undefined;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settings = useListing(listing.id).data?.settings;
  const [name, setName] = useState(source?.name ?? "");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState(source?.category ?? "");
  const [location, setLocation] = useState(source?.location ?? "");
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("calendars.name.required"));
    if (!source && !address.trim()) return setError(t("calendars.address.required"));
    setBusy(true);
    const body = {
      name: name.trim(),
      ...(address.trim() && { address: address.trim() }),
      category: category || null,
      location: location || null,
      enabled,
    };
    try {
      if (source) await calendarApi.save(source.id, body);
      else await calendarApi.add(listing.id, body);
      await queryClient.invalidateQueries({ queryKey: sourcesKey(listing.id) });
      toast({ variant: "success", title: t("calendars.saved") });
      onDone();
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
      setBusy(false);
    }
  };

  return (
    <DialogBody className="sm:w-lg">
      <form noValidate onSubmit={(e) => void submit(e)} className="w-full">
        <DialogHeader>
          <DialogTitle>{source ? t("calendars.edit") : t("calendars.add")}</DialogTitle>
        </DialogHeader>
        <DialogContent className="flex flex-col gap-4">
          <Field name="calendar-name">
            <FieldLabel>{t("calendars.name")}</FieldLabel>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field name="calendar-address">
            <FieldLabel>{t("calendars.address")}</FieldLabel>
            <Input
              value={address}
              type="url"
              autoComplete="off"
              placeholder={
                source
                  ? source.address
                  : "https://outlook.office365.com/owa/calendar/…/calendar.ics"
              }
              onChange={(e) => setAddress(e.target.value)}
            />
            <p className="text-body-sm text-txt-black-500">
              {source ? t("calendars.address.keep") : t("calendars.address.hint")}
            </p>
          </Field>
          {settings && settings.categories.length > 0 && (
            <Field name="calendar-category">
              <FieldLabel>{t("calendars.category")}</FieldLabel>
              <Select
                items={settings.categories.map((c) => ({ value: c.slug, label: c.name }))}
                value={category}
                clearable
                placeholder={t("calendars.none.choice")}
                aria-label={t("calendars.category")}
                onValueChange={(v: string) => setCategory(v ?? "")}
              />
            </Field>
          )}
          {settings && settings.locations.length > 0 && (
            <Field name="calendar-location">
              <FieldLabel>{t("calendars.location")}</FieldLabel>
              <Select
                items={settings.locations.map((l) => ({ value: l.slug, label: l.name }))}
                value={location}
                clearable
                placeholder={t("calendars.none.choice")}
                aria-label={t("calendars.location")}
                onValueChange={(v: string) => setLocation(v ?? "")}
              />
              <p className="text-body-sm text-txt-black-500">{t("calendars.location.hint")}</p>
            </Field>
          )}
          {source && (
            <Field name="calendar-enabled">
              <FieldItem>
                <Checkbox checked={enabled} onCheckedChange={setEnabled} />
                <FieldLabel>{t("calendars.enabled")}</FieldLabel>
              </FieldItem>
            </Field>
          )}
          {error && (
            <Field name="calendar-error" invalid>
              <FieldError>{error}</FieldError>
            </Field>
          )}
        </DialogContent>
        <DialogFooter>
          <DialogClose render={<Button variant="default-outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button type="submit" variant="default-outline" disabled={busy}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </form>
    </DialogBody>
  );
}

function RemoveDialog({ source, onDone }: { source: CalendarSource; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fail = useFailure();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await calendarApi.remove(source.id);
      await queryClient.invalidateQueries({ queryKey: sourcesKey(source.listingId) });
      toast({ variant: "success", title: t("calendars.removed") });
      onDone();
    } catch (caught) {
      await fail(t("calendars.removeFailed"), caught);
      setBusy(false);
    }
  };
  return (
    <AlertDialogContent dismissible={!busy} className="sm:w-lg">
      <AlertDialogTitle>{t("calendars.remove.title", { name: source.name })}</AlertDialogTitle>
      <AlertDialogDescription>{t("calendars.remove.body")}</AlertDialogDescription>
      <AlertDialogAction>
        <AlertDialogClose render={<Button variant="default-outline" disabled={busy} />}>
          {t("common.cancel")}
        </AlertDialogClose>
        <Button variant="danger-fill" disabled={busy} onClick={() => void remove()}>
          {t("calendars.remove")}
        </Button>
      </AlertDialogAction>
    </AlertDialogContent>
  );
}
