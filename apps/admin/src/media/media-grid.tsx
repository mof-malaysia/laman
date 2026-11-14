/**
 * Thumbnails with their file name and, in words, what an officer needs to
 * know without opening each one: no alt text, decorative, not used, not live yet.
 */
import type { Media } from "@laman/contracts";
import { PdfIcon } from "@/components/ui/icons/pdf";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { formatBytes } from "./format";

/** An image with no alt text that isn't marked decorative. */
export const missingAlt = (media: Pick<Media, "kind" | "alt" | "decorative">) =>
  media.kind === "image" && !media.decorative && !media.alt.trim();

/** A photograph fills its tile; anything smaller (a logo, an icon) is shown whole. */
const fillsTile = (media: Media) => (media.width ?? 0) >= 300 && (media.height ?? 0) >= 200;

export function MediaThumb({
  media,
  className,
  fill = false,
}: {
  media: Media;
  className?: string;
  /** In the library's tiles: crop photographs to the tile so the grid reads as one. */
  fill?: boolean;
}) {
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
      className={clx(
        "bg-bg-washed",
        fill && fillsTile(media) ? "object-cover" : "object-contain",
        fill && !fillsTile(media) && "p-3",
        className,
      )}
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
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-3 gap-y-4 p-0">
      {items.map((media) => (
        <li key={media.id}>
          <button
            type="button"
            data-media-id={media.id}
            onClick={() => onChoose(media)}
            aria-pressed={selected === undefined ? undefined : selected === media.id}
            className="group focus-ring flex w-full cursor-pointer flex-col gap-2 rounded-lg text-left"
          >
            {/* The picture is the tile: it takes the hover and the selection, the words sit under it. */}
            <span
              className={clx(
                "border-otl-gray-200 block w-full overflow-hidden rounded-lg border transition-shadow duration-150 motion-reduce:transition-none",
                selected === media.id
                  ? "ring-otl-primary-300 border-otl-primary-300 ring-2"
                  : "group-hover:shadow-card group-hover:border-otl-gray-300",
              )}
            >
              <MediaThumb media={media} fill className="aspect-[4/3] w-full" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
              <span
                className={clx(
                  "text-label-compact min-w-0 truncate font-medium",
                  selected === media.id && "text-txt-primary",
                )}
                title={media.filename}
              >
                {media.filename}
              </span>
              <span className="text-label-compact text-txt-black-500 truncate tabular-nums">
                {formatBytes(media.size)}
                {media.width && media.height ? ` · ${media.width} × ${media.height}` : ""}
              </span>
            </span>
            <MediaTags media={media} />
          </button>
        </li>
      ))}
    </ul>
  );
}
