/**
 * One file in a drawer: preview, alt text (or decorative), caption and
 * credit, where it's used, and what can be done to it. Replace asks first,
 * saying which pages change and that visitors see it only after a publish,
 * and can be undone; Delete is refused while the file is in use and moves it
 * to Recently deleted, where it can be restored. Closing with unsaved
 * changes asks before throwing them away.
 */
import type { MediaDetail } from "@laman/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { linkClass } from "@/components/text-link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryList,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { TextArea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { UploadError, apiError, mediaApi, mediaQuery } from "@/lib/api";
import { useCan } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDate, formatDateTime } from "@/lib/pages";
import { ACCEPT, formatBytes, looksLikePlaceholder, typeName } from "./format";
import { MediaThumb, missingAlt } from "./media-grid";

export function MediaDrawer({
  id,
  trashDays = 30,
  onClose,
}: {
  id: string | null;
  /** Days a deleted file stays restorable. */
  trashDays?: number;
  onClose: () => void;
}) {
  // While the drawer slides shut its id is gone; the last file stays shown
  // (keepPreviousData) so focus can go back to its card.
  const media = useQuery({ ...mediaQuery(id), placeholderData: keepPreviousData });
  const shown = media.data && (id === null || media.data.id === id) ? media.data : null;
  const dirty = useRef(false);
  const markDirty = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);
  const [discarding, setDiscarding] = useState(false);
  const close = () => {
    dirty.current = false;
    setDiscarding(false);
    onClose();
  };
  return (
    <>
      <Drawer
        side="right"
        open={id !== null}
        onOpenChange={(open) => {
          if (open) return;
          if (dirty.current) setDiscarding(true);
          else close();
        }}
      >
        <DrawerContent
          className="w-full sm:max-w-md"
          finalFocus={() =>
            (shown && document.querySelector<HTMLElement>(`[data-media-id="${shown.id}"]`)) || true
          }
        >
          {shown ? (
            <FileDetails
              key={shown.updatedAt}
              media={shown}
              trashDays={trashDays}
              onDirty={markDirty}
            />
          ) : (
            <DrawerBody className="flex flex-col gap-3">
              <DrawerTitle className="sr-only">{t("media.detail")}</DrawerTitle>
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-8 w-2/3" />
            </DrawerBody>
          )}
        </DrawerContent>
      </Drawer>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent className="sm:w-md">
          <AlertDialogTitle>{t("media.discard.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("media.discard.body", { name: shown?.filename ?? "" })}
          </AlertDialogDescription>
          <AlertDialogAction>
            <AlertDialogClose render={<Button variant="default-outline" />}>
              {t("media.discard.keep")}
            </AlertDialogClose>
            <Button variant="danger-fill" onClick={close}>
              {t("media.discard.confirm")}
            </Button>
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FileDetails({
  media,
  trashDays,
  onDirty,
}: {
  media: MediaDetail;
  trashDays: number;
  onDirty: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [alt, setAlt] = useState(media.alt);
  const [decorative, setDecorative] = useState(media.decorative);
  const [caption, setCaption] = useState(media.caption);
  const [credit, setCredit] = useState(media.credit);
  // The missing-alt error waits until the officer has had a go: leaving the field, or saving.
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [puttingBack, setPuttingBack] = useState(false);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const inUseHint = useId();
  const formId = useId();
  const inUse = media.usedOn.length > 0 || media.usedBySettings;
  const deleted = media.deletedAt !== null;
  const changed =
    alt !== media.alt ||
    decorative !== media.decorative ||
    caption !== media.caption ||
    credit !== media.credit;
  const altMissing = missingAlt({ kind: media.kind, alt, decorative });

  useEffect(() => onDirty(changed), [changed, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["media"] }),
      queryClient.invalidateQueries({ queryKey: ["summary"] }),
    ]);

  /** Runs an action, showing its error in the drawer. */
  const run = async (action: () => Promise<void>) => {
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof UploadError
          ? caught.error.message
          : ((await apiError(caught))?.message ?? t("common.tryAgain")),
      );
    }
  };

  const save = async () => {
    setTouched(true);
    if (altMissing) return;
    setSaving(true);
    await run(async () => {
      await mediaApi.update(media.id, { alt, decorative, caption, credit });
      onDirty(false);
      await refresh();
      toast({ variant: "success", title: t("media.saved") });
    });
    setSaving(false);
  };

  const canPublish = useCan("content.publish");
  const replace = async (file: File) => {
    setPending(null);
    setReplacing(0);
    await run(async () => {
      await mediaApi.replace(media.id, file, setReplacing);
      await refresh();
      toast({
        variant: "success",
        title: t("media.replaced"),
        description: t("media.replacedBody"),
      });
    });
    setReplacing(null);
  };

  const putBack = () =>
    run(async () => {
      await mediaApi.restorePrevious(media.id);
      await refresh();
      toast({
        variant: "success",
        title: t("media.previous.restored", { name: media.previous?.filename ?? "" }),
      });
    });

  const remove = () =>
    run(async () => {
      await mediaApi.delete(media.id);
      await refresh();
      toast({
        variant: "success",
        title: t("media.deleted", { name: media.filename }),
        description: t("media.deletedBody", { days: trashDays }),
      });
    });

  const restore = () =>
    run(async () => {
      await mediaApi.restore(media.id);
      await refresh();
      toast({ variant: "success", title: t("media.restored", { name: media.filename }) });
    });

  const purgeAt = media.deletedAt
    ? new Date(Date.parse(media.deletedAt) + trashDays * 86_400_000).toISOString()
    : null;

  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="truncate pr-8">{media.filename}</DrawerTitle>
        <DrawerDescription>
          {typeName(media.type)} · {formatBytes(media.size)}
          {media.width && media.height ? ` · ${media.width} × ${media.height}` : ""}
        </DrawerDescription>
      </DrawerHeader>
      {/* Four groups, in the order an officer needs them: what the file is
          (and its status), how it's described, where it's used, and the
          technical details. Groups sit 24px apart; inside a group, 12px. */}
      <DrawerBody className="flex flex-col gap-6">
        {deleted && purgeAt && (
          <Callout variant="warning">
            <CalloutTitle>{t("media.deletedNotice")}</CalloutTitle>
            <CalloutContent>
              {t("media.deletedNoticeBody", { date: formatDate(purgeAt) })}
            </CalloutContent>
            <CalloutAction>
              <Button variant="default-outline" onClick={() => void restore()}>
                {t("media.restore")}
              </Button>
            </CalloutAction>
          </Callout>
        )}
        {!deleted && media.status === "failed" && (
          <Callout variant="warning">
            <CalloutTitle>{t("media.failedNotice")}</CalloutTitle>
            <CalloutContent>{t("media.failedNoticeBody")}</CalloutContent>
          </Callout>
        )}
        {!deleted && media.notLive && media.previous && (
          <Callout variant="info">
            <CalloutTitle>{t("media.notLive.title")}</CalloutTitle>
            <CalloutContent>
              {t("media.notLive.body", { time: formatDateTime(media.previous.replacedAt) })}
            </CalloutContent>
            <CalloutAction>
              <Link to="/publishing" className={linkClass}>
                {t("media.notLive.link")}
              </Link>
            </CalloutAction>
          </Callout>
        )}

        <section aria-label={t("media.section.file")} className="flex flex-col gap-3">
          {media.kind === "image" ? (
            // At its own size when it's small: a logo blown up to the drawer's width only blurs.
            <span className="bg-bg-washed flex min-h-24 items-center justify-center overflow-hidden rounded-md">
              <img src={media.url} alt="" className="max-h-64 max-w-full object-contain" />
            </span>
          ) : (
            <a href={media.url} target="_blank" rel="noreferrer" className="focus-ring rounded-md">
              <MediaThumb media={media} className="h-40 w-full rounded-md" />
              <span className="sr-only">{t("media.open")}</span>
            </a>
          )}
          {replacing !== null && <Progress value={replacing} aria-label={t("media.replacing")} />}
          {!deleted && (
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-sm text-txt-black-700 min-w-0">
                {media.previous ? (
                  <>
                    {/* While the notice above says when, this only names the file. */}
                    {media.notLive
                      ? t("media.previous.name", { name: media.previous.filename })
                      : t("media.previous", {
                          time: formatDateTime(media.previous.replacedAt),
                          name: media.previous.filename,
                        })}{" "}
                    {canPublish && (
                      <button
                        type="button"
                        className={`${linkClass} cursor-pointer`}
                        onClick={() => setPuttingBack(true)}
                      >
                        {t("media.previous.restoreShort")}
                      </button>
                    )}
                  </>
                ) : (
                  t("media.uploadedOn", { time: formatDateTime(media.createdAt) })
                )}
              </p>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPending(file);
                  e.target.value = "";
                }}
              />
              {/* A replaced file is live at once, so it's a Content Manager's call. */}
              {canPublish && (
                <Button
                  variant="default-outline"
                  size="small"
                  className="shrink-0"
                  disabled={replacing !== null}
                  onClick={() => fileInput.current?.click()}
                >
                  {t("media.replace")}
                </Button>
              )}
            </div>
          )}
        </section>

        {deleted ? (
          // A deleted file can't be edited: its description reads as text.
          <section aria-labelledby="describe" className="flex flex-col gap-3">
            <h3 id="describe" className="text-body-md font-semibold">
              {t("media.section.describe")}
            </h3>
            <SummaryList>
              <SummaryListBody>
                {media.kind === "image" && (
                  <SummaryListRow>
                    <SummaryListTerm>{t("media.alt")}</SummaryListTerm>
                    <SummaryListDetail>
                      {media.decorative ? t("media.decorativeTag") : media.alt || t("media.noAlt")}
                    </SummaryListDetail>
                  </SummaryListRow>
                )}
                <SummaryListRow>
                  <SummaryListTerm>{t("media.caption")}</SummaryListTerm>
                  <SummaryListDetail>{media.caption || t("media.none.value")}</SummaryListDetail>
                </SummaryListRow>
                <SummaryListRow>
                  <SummaryListTerm>{t("media.credit")}</SummaryListTerm>
                  <SummaryListDetail>{media.credit || t("media.none.value")}</SummaryListDetail>
                </SummaryListRow>
              </SummaryListBody>
            </SummaryList>
          </section>
        ) : (
          <section aria-labelledby="describe" className="flex flex-col gap-3">
            <h3 id="describe" className="text-body-md font-semibold">
              {t("media.section.describe")}
            </h3>
            <form
              id={formId}
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {media.kind === "image" && (
                <div className="flex flex-col gap-3">
                  {!decorative && (
                    <Field name="alt" invalid={touched && altMissing}>
                      <FieldLabel>{t("media.alt")}</FieldLabel>
                      <FieldDescription>{t("media.altHint")}</FieldDescription>
                      <TextArea
                        rows={3}
                        value={alt}
                        maxLength={250}
                        disabled={deleted}
                        onChange={(e) => setAlt(e.target.value)}
                        onBlur={() => setTouched(true)}
                      />
                      <FieldError>
                        {touched && altMissing ? t("media.altMissing") : undefined}
                      </FieldError>
                      {looksLikePlaceholder(alt, media.filename) ? (
                        <p className="text-label-compact text-txt-warning font-normal">
                          {t("media.altPlaceholder")}
                        </p>
                      ) : (
                        alt.trim() && (
                          <p className="text-label-compact text-txt-black-500 font-normal">
                            {t("media.altHonest")}
                          </p>
                        )
                      )}
                    </Field>
                  )}
                  <Field name="decorative">
                    <FieldItem>
                      <Checkbox
                        checked={decorative}
                        disabled={deleted}
                        onCheckedChange={(next) => setDecorative(next === true)}
                      />
                      <FieldLabel>{t("media.decorative")}</FieldLabel>
                    </FieldItem>
                    <FieldDescription className="pl-7">
                      {t("media.decorativeHint")}
                    </FieldDescription>
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field name="caption">
                  <FieldLabel>{t("media.caption")}</FieldLabel>
                  <Input
                    value={caption}
                    maxLength={300}
                    disabled={deleted}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </Field>
                <Field name="credit">
                  <FieldLabel>{t("media.credit")}</FieldLabel>
                  <Input
                    value={credit}
                    maxLength={200}
                    disabled={deleted}
                    onChange={(e) => setCredit(e.target.value)}
                  />
                </Field>
              </div>
            </form>
          </section>
        )}

        <section className="flex flex-col gap-2" aria-labelledby="used-on">
          <h3 id="used-on" className="text-body-md font-semibold">
            {t("media.usedOn")}
          </h3>
          {inUse ? (
            <ul className="text-body-sm divide-otl-gray-200 m-0 flex list-none flex-col divide-y p-0">
              {media.usedOn.map((page) => (
                <li key={page.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  {page.deleted ? (
                    <Link to="/pages/trash/$id" params={{ id: page.id }} className={linkClass}>
                      {page.title}
                    </Link>
                  ) : (
                    <Link to="/pages/$id/edit" params={{ id: page.id }} className={linkClass}>
                      {page.title}
                    </Link>
                  )}
                  <span className="text-txt-black-500 truncate">
                    {page.deleted ? t("media.usedOn.deleted") : page.path}
                  </span>
                </li>
              ))}
              {media.usedBySettings && <li className="py-1.5">{t("media.usedBySettings")}</li>}
            </ul>
          ) : (
            <p className="text-body-sm text-txt-black-700">{t("media.unused")}</p>
          )}
          {inUse && !deleted && (
            <p id={inUseHint} className="text-label-compact text-txt-black-500 font-normal">
              {t("media.deleteInUseHint")}
            </p>
          )}
        </section>

        <Details>
          <DetailsTrigger>{t("media.detail")}</DetailsTrigger>
          <DetailsContent>
            <SummaryList>
              <SummaryListBody>
                <SummaryListRow>
                  <SummaryListTerm>{t("media.original")}</SummaryListTerm>
                  <SummaryListDetail>
                    <a href={media.url} target="_blank" rel="noreferrer" className={linkClass}>
                      {media.width ? `${media.width} px` : typeName(media.type)}
                    </a>
                  </SummaryListDetail>
                </SummaryListRow>
                {media.kind === "image" && (
                  <SummaryListRow>
                    <SummaryListTerm>{t("media.variants")}</SummaryListTerm>
                    <SummaryListDetail className="tabular-nums">
                      {media.variants.length
                        ? media.variants.map((w) => `${w} px`).join(", ")
                        : t("media.noVariants")}
                    </SummaryListDetail>
                  </SummaryListRow>
                )}
                <SummaryListRow>
                  <SummaryListTerm>{t("media.uploaded")}</SummaryListTerm>
                  <SummaryListDetail className="tabular-nums">
                    {formatDateTime(media.createdAt)}
                  </SummaryListDetail>
                </SummaryListRow>
              </SummaryListBody>
            </SummaryList>
          </DetailsContent>
        </Details>
      </DrawerBody>

      {/* Save always in reach at the foot, away from Delete. */}
      {!deleted && (
        <DrawerFooter className="border-otl-gray-200 border-t pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {error && (
              <p role="alert" className="text-body-sm text-txt-danger">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="submit"
                form={formId}
                // Quiet until there's something to save.
                variant={changed ? "primary-fill" : "default-outline"}
                disabled={!changed || saving}
              >
                {t("common.saveChanges")}
              </Button>
              {/* Stays focusable while in use, so its reason is reached and read. */}
              <Button
                variant="danger-outline"
                aria-disabled={inUse || undefined}
                aria-describedby={inUse ? inUseHint : undefined}
                className={inUse ? "cursor-not-allowed opacity-60" : undefined}
                onClick={() => !inUse && void remove()}
              >
                {t("media.delete")}
              </Button>
            </div>
          </div>
        </DrawerFooter>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        {pending && (
          <ReplaceConfirm media={media} file={pending} onConfirm={() => void replace(pending)} />
        )}
      </AlertDialog>
      <AlertDialog open={puttingBack} onOpenChange={setPuttingBack}>
        {puttingBack && media.previous && (
          <SwapConfirm
            media={media}
            title={t("media.previous.title", { name: media.previous.filename })}
            incoming={{
              label: t("media.previous.label"),
              name: media.previous.filename,
              kind: media.previous.kind,
              src: media.previous.url,
            }}
            confirm={t("media.previous.confirm")}
            onConfirm={() => {
              setPuttingBack(false);
              void putBack();
            }}
          />
        )}
      </AlertDialog>
    </>
  );
}

/** A replace: the chosen file, read for its preview. */
function ReplaceConfirm({
  media,
  file,
  onConfirm,
}: {
  media: MediaDetail;
  file: File;
  onConfirm: () => void;
}) {
  // A data URL rather than an object URL: nothing to revoke, so a re-run effect can't break it.
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => setPreview(String(reader.result)));
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return (
    <SwapConfirm
      media={media}
      title={t("media.replace.title", { name: media.filename })}
      incoming={{
        label: t("media.replace.new"),
        name: file.name,
        kind: file.type.startsWith("image/") ? "image" : "document",
        src: preview,
      }}
      confirm={t("media.replace.confirm")}
      onConfirm={onConfirm}
    />
  );
}

/**
 * What swapping the file changes, for a replace or for putting the previous
 * file back: the file now and the one coming in side by side, the pages that
 * show it, and that visitors see it after the next publish.
 */
function SwapConfirm({
  media,
  title,
  incoming,
  confirm,
  onConfirm,
}: {
  media: MediaDetail;
  title: string;
  incoming: { label: string; name: string; kind: "image" | "document"; src: string | undefined };
  confirm: string;
  onConfirm: () => void;
}) {
  const pages = media.usedOn;
  return (
    <AlertDialogContent className="sm:w-lg">
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{t("media.replace.live")}</AlertDialogDescription>
      <div className="flex flex-col gap-4 pt-3">
        <div className="grid grid-cols-2 gap-3">
          <figure className="m-0 flex min-w-0 flex-col gap-1.5">
            <MediaThumb media={media} className="aspect-square w-full rounded-sm" />
            <figcaption className="text-label-compact flex min-w-0 flex-col font-normal">
              <span className="font-semibold">{t("media.replace.current")}</span>
              <span className="text-txt-black-700 truncate">{media.filename}</span>
            </figcaption>
          </figure>
          <figure className="m-0 flex min-w-0 flex-col gap-1.5">
            {incoming.kind === "image" && incoming.src ? (
              <img
                src={incoming.src}
                alt=""
                className="bg-bg-washed aspect-square w-full rounded-sm object-contain"
              />
            ) : (
              <MediaThumb
                media={{ ...media, kind: "document" }}
                className="aspect-square w-full rounded-sm"
              />
            )}
            <figcaption className="text-label-compact flex min-w-0 flex-col font-normal">
              <span className="font-semibold">{incoming.label}</span>
              <span className="text-txt-black-700 truncate">{incoming.name}</span>
            </figcaption>
          </figure>
        </div>
        <div className="text-body-sm flex flex-col gap-1">
          {pages.length > 0 ? (
            <>
              <p className="font-medium">{t("media.replace.pages", { count: pages.length })}</p>
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5">
                {pages.map((page) => (
                  <li key={page.id}>
                    {page.title}{" "}
                    <span className="text-txt-black-500">
                      {page.deleted ? t("media.usedOn.deleted") : page.path}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !media.usedBySettings && <p>{t("media.replace.none")}</p>
          )}
          {media.usedBySettings && <p>{t("media.replace.settings")}</p>}
        </div>
      </div>
      <AlertDialogAction>
        <AlertDialogClose render={<Button variant="default-outline" />}>
          {t("common.cancel")}
        </AlertDialogClose>
        <Button variant="primary-fill" onClick={onConfirm}>
          {confirm}
        </Button>
      </AlertDialogAction>
    </AlertDialogContent>
  );
}
