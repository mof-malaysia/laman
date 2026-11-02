/**
 * Thumbnails with their file name and, in words, what an officer needs to
 * know without opening each one: no alt text, decorative, not used, not live yet.
 */
import type { Media } from "@fiscal-sb/contracts";
import { PdfIcon } from "@/components/ui/icons/pdf";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** An image with no alt text that isn't marked decorative. */
export const missingAlt = (media: Pick<Media, "kind" | "alt" | "decorative">) =>
  media.kind === "image" && !media.decorative && !media.alt.trim();

export function MediaThumb({ media, className }: { media: Media; className?: string }) {
  if (media.kind === "document")
    return (
      <span
        className={clx("bg-bg-washed text-txt-danger flex items-center justify-center", className)}
      >
        <PdfIcon className="size-10" aria-hidden />
      </span>
    );
  return (
    <img
      src={media.thumbnailUrl}
      alt=""
      loading="lazy"
      className={clx("bg-bg-washed object-contain", className)}
    />
  );
}

/** A file's state as wash tags. A file in Recently deleted shows none: it can't be used. */
export function MediaTags({ media, hideUnused }: { media: Media; hideUnused?: boolean }) {
  if (media.deletedAt) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {media.status === "processing" && <Tag size="small">{t("media.processing")}</Tag>}
      {media.status === "failed" && (
        <Tag size="small" variant="danger">
          {t("media.failed")}
        </Tag>
      )}
      {missingAlt(media) && (
        <Tag size="small" variant="warning">
          {t("media.noAlt")}
        </Tag>
      )}
      {media.notLive && (
        <Tag size="small" variant="warning">
          {t("media.notLiveTag")}
        </Tag>
      )}
      {media.kind === "image" && media.decorative && (
        <Tag size="small">{t("media.decorativeTag")}</Tag>
      )}
      {media.usedBy === 0 && !hideUnused && <Tag size="small">{t("media.unusedTag")}</Tag>}
    </span>
  );
}

export function MediaGrid({
  items,
  selected,
  onChoose,
}: {
  items: Media[];
  selected?: string | null;
  onChoose: (media: Media) => void;
}) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-0">
      {items.map((media) => (
        <li key={media.id}>
          <button
            type="button"
            data-media-id={media.id}
            onClick={() => onChoose(media)}
            aria-pressed={selected === undefined ? undefined : selected === media.id}
            className={clx(
              "focus-ring hover:bg-bg-washed flex w-full flex-col gap-1.5 rounded-md p-1.5 text-left",
              selected === media.id && "bg-bg-primary-50 outline-otl-primary-200 outline-2",
            )}
          >
            <MediaThumb media={media} className="aspect-square w-full rounded-sm" />
            <span className="text-label-compact min-w-0 truncate font-medium">
              {media.filename}
            </span>
            <MediaTags media={media} />
          </button>
        </li>
      ))}
    </ul>
  );
}
