/** A media field: the chosen image (or an empty slot), its alt text, and Change or Remove. */
import type { MediaKind } from "@fiscal-sb/blocks";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { GalleryIcon } from "@/components/ui/icons/gallery";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { mediaQuery } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import { MediaThumb } from "@/media/media-grid";
import { type MediaChoice, MediaPicker } from "@/media/media-picker";

export function MediaField({
  title,
  hint,
  value,
  required,
  kind = "image",
  surface = "sheet",
  error,
  onChange,
}: {
  title: string;
  /** What the image is for, read with the field. */
  hint?: string | undefined;
  /** What it sits on, so its row stands out: washed on a Sheet, white on a Well. */
  surface?: "sheet" | "well";
  /** "any" also offers documents (PDFs). */
  kind?: MediaKind;
  value: MediaChoice | undefined;
  required: boolean;
  error: string | undefined;
  onChange: (value: MediaChoice | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const media = useQuery(mediaQuery(value?.mediaId));
  const alt = value?.alt ?? media.data?.alt ?? "";
  const id = useId();

  // What's chosen, in words: the file and its alt text, a missing file, or nothing yet.
  const summary =
    value && media.data ? (
      <>
        <span className="text-body-sm truncate font-medium">{media.data.filename}</span>
        {alt ? (
          <span className="text-body-xs text-txt-black-700 line-clamp-2">
            {t("media.field.alt", { alt })}
            {value.alt && ` ${t("media.field.ownAlt")}`}
          </span>
        ) : media.data.decorative ? (
          <span className="text-body-xs text-txt-black-700">{t("media.field.decorative")}</span>
        ) : (
          <Tag size="small" variant="warning" className="self-start">
            {t("media.noAlt")}
          </Tag>
        )}
      </>
    ) : value && media.isError ? (
      <span className="text-body-sm text-txt-danger">{t("media.field.missing")}</span>
    ) : (
      <span className="text-body-sm text-txt-black-700">{t("media.field.none")}</span>
    );

  return (
    <fieldset
      aria-describedby={hint ? `${id}-hint` : undefined}
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
    >
      <legend className="text-label-md p-0 font-medium">{title}</legend>
      {hint && (
        <span id={`${id}-hint`} className="text-body-sm text-txt-black-700 -mt-1">
          {hint}
        </span>
      )}
      {/* One row: the image or an empty slot, what it is, and its buttons (below it when narrow). */}
      <div
        className={clx(
          "flex flex-wrap items-center gap-3 rounded-md p-2",
          surface === "well" ? "bg-bg-white" : "bg-bg-washed",
        )}
      >
        {value && media.data ? (
          <MediaThumb media={media.data} className="size-12 shrink-0 rounded-sm" />
        ) : (
          <span
            className={clx(
              "text-txt-black-700 grid size-12 shrink-0 place-content-center rounded-sm",
              surface === "well" ? "bg-bg-washed" : "bg-bg-white",
            )}
          >
            <GalleryIcon aria-hidden className="size-5" />
          </span>
        )}
        <span className="flex min-w-32 flex-1 flex-col gap-0.5">{summary}</span>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="default-outline"
            size="small"
            className={surface === "sheet" ? "bg-bg-white hover:bg-bg-gray-50" : undefined}
            onClick={() => setOpen(true)}
          >
            {t(
              value
                ? "media.field.change"
                : kind === "image"
                  ? "media.field.choose"
                  : "media.field.chooseFile",
            )}
          </Button>
          {value && !required && (
            <Button variant="default-ghost" size="small" onClick={() => onChange(undefined)}>
              {t("media.field.remove")}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-body-sm text-txt-danger">{error}</p>}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        value={value}
        kind={kind}
        onChoose={onChange}
      />
    </fieldset>
  );
}
