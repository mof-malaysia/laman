/**
 * Picks an image from the library for a media field: search, upload in
 * place, and the alt text for the chosen file. Alt text is required unless
 * the image is decorative: a file without one gets it saved to the library;
 * text that differs from the library's is kept as this use's own alt.
 * Decorative is a property of the image, so it's saved to the library too.
 */
import type { MediaKind } from "@fiscal-sb/blocks";
import type { Media } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { UploadIcon } from "@/components/ui/icons/upload";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { UploadError, mediaApi } from "@/lib/api";
import { ACCEPT, looksLikePlaceholder } from "./format";
import { MediaGrid } from "./media-grid";
import { useMediaList } from "./media-screen";

export type MediaChoice = { mediaId: string; alt?: string };

export function MediaPicker({
  open,
  onOpenChange,
  value,
  kind = "image",
  onChoose,
}: {
  /** "any" also offers documents (PDFs). */
  kind?: MediaKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: MediaChoice | undefined;
  onChoose: (choice: MediaChoice) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Picker value={value} kind={kind} onChoose={onChoose} onDone={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
}

function Picker({
  value,
  kind,
  onChoose,
  onDone,
}: {
  value: MediaChoice | undefined;
  kind: MediaKind;
  onChoose: (choice: MediaChoice) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const media = useMediaList({
    search,
    kind: kind === "any" ? "all" : kind,
    page: 1,
    pageSize: 60,
  });
  const [chosen, setChosen] = useState<Media | null>(null);
  const [alt, setAlt] = useState(value?.alt ?? "");
  const [decorative, setDecorative] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const current = chosen ?? media.data?.items.find((m) => m.id === value?.mediaId) ?? null;
  // Until the officer ticks or unticks it, it's what the library says.
  const isDecorative = decorative ?? current?.decorative ?? false;

  const choose = (item: Media) => {
    setChosen(item);
    setAlt(item.id === value?.mediaId && value.alt ? value.alt : item.alt);
    setDecorative(null);
    setError(undefined);
  };

  const upload = async (file: File) => {
    setUploading(0);
    setError(undefined);
    try {
      const item = await mediaApi.upload(file, setUploading);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      choose(item);
    } catch (caught) {
      setError(caught instanceof UploadError ? caught.error.message : t("media.upload.failed"));
    } finally {
      setUploading(null);
    }
  };

  const confirm = async () => {
    if (!current) return;
    // Documents have no alt text: the link text describes them.
    if (current.kind === "document") {
      onChoose({ mediaId: current.id });
      return onDone();
    }
    if (isDecorative !== current.decorative) {
      await mediaApi.update(current.id, { decorative: isDecorative });
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    }
    // A decorative image is published with empty alt text.
    if (isDecorative) {
      onChoose({ mediaId: current.id });
      return onDone();
    }
    const text = alt.trim();
    if (!text) return setError(t("media.altMissing"));
    // The library's alt text is the default for every use; fill it in when it's missing.
    if (!current.alt.trim()) {
      await mediaApi.update(current.id, { alt: text });
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    }
    const library = current.alt.trim() || text;
    onChoose(text === library ? { mediaId: current.id } : { mediaId: current.id, alt: text });
    onDone();
  };

  return (
    <DialogBody className="sm:w-[48rem] sm:max-w-[calc(100dvw-36px)]">
      <DialogHeader>
        <DialogTitle>
          {kind === "image" ? t("media.picker.title") : t("media.picker.titleAny")}
        </DialogTitle>
      </DialogHeader>
      <DialogContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("media.search")}
            aria-label={t("media.search")}
          />
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="default-outline"
            disabled={uploading !== null}
            onClick={() => fileInput.current?.click()}
          >
            <UploadIcon /> {t("media.upload")}
          </Button>
        </div>
        {uploading !== null && <Progress value={uploading} aria-label={t("media.upload.busy")} />}
        <div className="max-h-[45dvh] overflow-y-auto">
          {media.data ? (
            media.data.items.length ? (
              <MediaGrid
                items={media.data.items}
                selected={current?.id ?? null}
                onChoose={choose}
              />
            ) : (
              <p className="text-body-sm text-txt-black-700">{t("media.picker.empty")}</p>
            )
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
        {current?.kind === "image" && (
          <div className="flex flex-col gap-3">
            {!isDecorative && (
              <Field name="picker-alt" invalid={Boolean(error)}>
                <FieldLabel>{t("media.alt")}</FieldLabel>
                <FieldDescription>{t("media.picker.altHint")}</FieldDescription>
                <Input value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} />
                <FieldError>{error}</FieldError>
                {looksLikePlaceholder(alt, current.filename) && (
                  <p className="text-body-sm text-txt-warning">{t("media.altPlaceholder")}</p>
                )}
              </Field>
            )}
            <Field name="picker-decorative">
              <FieldItem>
                <Checkbox
                  checked={isDecorative}
                  onCheckedChange={(next) => {
                    setDecorative(next === true);
                    setError(undefined);
                  }}
                />
                <FieldLabel>{t("media.decorative")}</FieldLabel>
              </FieldItem>
              <FieldDescription>{t("media.decorativeHint")}</FieldDescription>
            </Field>
          </div>
        )}
        {!current && error && <p className="text-body-sm text-txt-danger">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <DialogClose render={<Button variant="default-outline" />}>
          {t("common.cancel")}
        </DialogClose>
        <Button variant="primary-fill" disabled={!current} onClick={() => void confirm()}>
          {t("media.picker.choose")}
        </Button>
      </DialogFooter>
    </DialogBody>
  );
}
