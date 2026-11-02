/**
 * Uploads files to the media library with progress, from the Upload button or
 * a drop. Each image is described as it arrives, while the officer still has
 * it in mind: alt text, or marked decorative. What they type is saved when a
 * field is left and when the dialog closes; a save that fails says so on that
 * image and keeps the dialog open, so nothing typed is lost unnoticed.
 */
import type { MediaDetail } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldItem, FieldLabel } from "@/components/ui/field";
import { FileUpload, type FileUploadFile } from "@/components/ui/file-upload";
import { TextArea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { UploadError, mediaApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import { useSummary } from "@/lib/pages";
import { ACCEPT, formatBytes, looksLikePlaceholder } from "./format";

/** An uploaded image being described, and what was last saved for it. */
type Described = {
  media: MediaDetail;
  alt: string;
  decorative: boolean;
  saved: { alt: string; decorative: boolean };
  /** The last save failed: what's typed isn't in the library yet. */
  failed?: boolean;
};

let nextId = 0;
const asUpload = (file: File): FileUploadFile => ({ id: `drop-${nextId++}`, file });

export function UploadDialog({
  open,
  dropped,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  /** Files dropped on the screen, uploaded as soon as the dialog opens. */
  dropped: File[];
  onOpenChange: (open: boolean) => void;
  onUploaded?: (media: MediaDetail) => void;
}) {
  const queryClient = useQueryClient();
  const summary = useSummary();
  const maxBytes = summary.data?.media.maxBytes ?? 10 * 1024 * 1024;
  const { toast } = useToast();
  const [files, setFiles] = useState<FileUploadFile[]>([]);
  const [described, setDescribed] = useState<Described[]>([]);
  const [closing, setClosing] = useState(false);
  const started = useRef(new Set<string>());
  const latestUploaded = useRef(onUploaded);
  useEffect(() => {
    latestUploaded.current = onUploaded;
  });

  const update = (id: string, patch: Partial<FileUploadFile>) =>
    setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const start = (list: FileUploadFile[]) => {
    for (const item of list) {
      if (item.error || started.current.has(item.id)) continue;
      started.current.add(item.id);
      update(item.id, { progress: 0 });
      mediaApi
        .upload(item.file, (progress) => update(item.id, { progress: Math.min(progress, 99) }))
        .then((media) => {
          update(item.id, { progress: 100 });
          if (media.kind === "image")
            setDescribed((current) => [
              ...current,
              { media, alt: "", decorative: false, saved: { alt: "", decorative: false } },
            ]);
          latestUploaded.current?.(media);
          void queryClient.invalidateQueries({ queryKey: ["media"] });
          void queryClient.invalidateQueries({ queryKey: ["summary"] });
        })
        .catch((error: unknown) =>
          update(item.id, {
            progress: undefined,
            error: error instanceof UploadError ? error.error.message : t("media.upload.failed"),
          }),
        );
    }
  };

  // Dropped files start uploading as the dialog opens.
  useEffect(() => {
    if (!open || !dropped.length) return;
    const added = dropped
      .map(asUpload)
      .map((f) =>
        f.file.size > maxBytes
          ? { ...f, error: t("media.upload.tooLarge", { size: formatBytes(maxBytes) }) }
          : f,
      );
    setFiles((current) => [...current, ...added]);
    start(added);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per drop
  }, [open, dropped]);

  const busy = files.some((f) => f.progress !== undefined && f.progress < 100 && !f.error);

  const edit = (id: string, patch: Partial<Pick<Described, "alt" | "decorative">>) =>
    setDescribed((current) => current.map((d) => (d.media.id === id ? { ...d, ...patch } : d)));

  /** Saves what changed for these images; returns how many failed, which stay marked on their image. */
  const persist = async (list: Described[]) => {
    const changed = list.filter(
      (d) => d.alt.trim() !== d.saved.alt || d.decorative !== d.saved.decorative,
    );
    const results = await Promise.all(
      changed.map(async (d) => {
        const body = { alt: d.alt.trim(), decorative: d.decorative };
        const ok = await mediaApi.update(d.media.id, body).then(
          () => true,
          () => false,
        );
        setDescribed((current) =>
          current.map((c) =>
            c.media.id !== d.media.id
              ? c
              : ok
                ? { ...c, saved: body, failed: false }
                : { ...c, failed: true },
          ),
        );
        return ok;
      }),
    );
    if (changed.length) {
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
    return results.filter((ok) => !ok).length;
  };

  /** Closes once everything typed is saved; a failed save keeps the dialog open on that image. */
  const close = async () => {
    setClosing(true);
    const failed = await persist(described);
    setClosing(false);
    if (failed) return;
    const missing = described.filter((d) => !d.decorative && !d.alt.trim()).length;
    if (missing)
      toast({
        variant: "warning",
        title: t("media.upload.stillMissing", { count: missing }),
        description: t("media.upload.stillMissingBody"),
      });
    setFiles([]);
    setDescribed([]);
    started.current.clear();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return onOpenChange(true);
        if (busy || closing) return;
        void close();
      }}
    >
      <DialogBody className="sm:w-lg">
        <DialogHeader>
          <DialogTitle>{t("media.upload.title")}</DialogTitle>
          <DialogDescription>{t("media.upload.description")}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <Field name="files">
            <FieldLabel>{t("media.upload.label")}</FieldLabel>
            <FieldDescription>
              {t("media.upload.hint", { size: formatBytes(maxBytes) })}
            </FieldDescription>
            <FileUpload
              accept={ACCEPT}
              multiple
              maxSize={maxBytes}
              files={files}
              maxSizeMessage={() => t("media.upload.tooLarge", { size: formatBytes(maxBytes) })}
              acceptMessage={() => t("media.upload.wrongType")}
              onFilesChange={(next) => {
                const added = next.filter((f) => !files.some((old) => old.id === f.id));
                setFiles(next);
                start(added);
              }}
            />
          </Field>
          {described.length > 0 && (
            <section aria-labelledby="describe-heading" className="mt-4 flex flex-col gap-3">
              <div>
                <h3 id="describe-heading" className="text-label-md font-semibold">
                  {t("media.upload.describe")}
                </h3>
                <p className="text-body-sm text-txt-black-700">{t("media.altHint")}</p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {described.map((d) => (
                  <li key={d.media.id}>
                    {/* Each image's fields are a group named by its file, so they read in context. */}
                    <fieldset className="m-0 flex min-w-0 gap-3 border-0 p-0">
                      <legend className="sr-only">{d.media.filename}</legend>
                      <img
                        src={d.media.url}
                        alt=""
                        className="bg-bg-washed size-16 shrink-0 rounded-sm object-contain"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {!d.decorative && (
                          <Field name={`alt-${d.media.id}`} invalid={d.failed}>
                            <FieldLabel className="truncate">
                              {t("media.upload.altFor", { name: d.media.filename })}
                            </FieldLabel>
                            <TextArea
                              rows={2}
                              value={d.alt}
                              maxLength={250}
                              onChange={(e) => edit(d.media.id, { alt: e.target.value })}
                              onBlur={() => void persist([d])}
                            />
                            {looksLikePlaceholder(d.alt, d.media.filename) && (
                              <p className="text-body-sm text-txt-warning">
                                {t("media.altPlaceholder")}
                              </p>
                            )}
                          </Field>
                        )}
                        {d.failed && (
                          <p role="alert" className="text-body-sm text-txt-danger">
                            {t("media.upload.notSaved")}
                          </p>
                        )}
                        <Field name={`decorative-${d.media.id}`}>
                          <FieldItem>
                            <Checkbox
                              checked={d.decorative}
                              onCheckedChange={(next) => {
                                const decorative = next === true;
                                edit(d.media.id, { decorative });
                                void persist([{ ...d, decorative }]);
                              }}
                            />
                            <FieldLabel>{t("media.decorative")}</FieldLabel>
                          </FieldItem>
                        </Field>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
              <p className="text-label-compact text-txt-black-500 font-normal">
                {t("media.altHonest")}
              </p>
            </section>
          )}
        </DialogContent>
        <DialogFooter>
          <DialogClose render={<Button variant="default-outline" disabled={busy || closing} />}>
            {busy
              ? t("media.upload.busy")
              : closing
                ? t("media.upload.saving")
                : t("media.upload.done")}
          </DialogClose>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}
