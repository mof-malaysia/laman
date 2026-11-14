import type { PageSummary } from "@laman/contracts";
import type { SVGProps } from "react";
import { ArrowForwardIcon } from "@/components/ui/icons/arrow-forward";
import { DocumentIcon } from "@/components/ui/icons/document";
import { HomeIcon } from "@/components/ui/icons/home";
import { ListIcon } from "@/components/ui/icons/list";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** Draft, Changed or Published, as a wash tag with words. */
export function PageStatusTag({
  status,
  size = "small",
}: {
  status: PageSummary["status"];
  size?: "small" | "medium";
}) {
  if (status === "draft") return <Tag size={size}>{t("page.status.draft")}</Tag>;
  if (status === "scheduled")
    return (
      <Tag size={size} variant="primary">
        {t("page.status.scheduled")}
      </Tag>
    );
  if (status === "changed")
    return (
      <Tag size={size} variant="warning">
        {t("page.status.changed")}
      </Tag>
    );
  return (
    <Tag size={size} variant="success">
      {t("page.status.published")}
    </Tag>
  );
}

/** Whether visitors can see a page: published, or published with newer edits. */
export const isLive = (page: Pick<PageSummary, "status">) =>
  page.status === "published" || page.status === "changed";

/** Published or Unpublished: for links, which visitors only see once their page is live. */
export function LiveTag({ page }: { page: Pick<PageSummary, "status"> }) {
  const live = isLive(page);
  return (
    <Tag size="small" variant={live ? "success" : "default"} className="shrink-0">
      {t(live ? "pagePicker.published" : "pagePicker.unpublished")}
    </Tag>
  );
}

/** Where a page's redirect goes: another page's path, or a web address. */
export function redirectTarget(page: PageSummary, pages: PageSummary[] | undefined) {
  if (!page.redirect) return null;
  if (page.redirect.to === "url") return page.redirect.url;
  const target = page.redirect.pageId;
  return pages?.find((p) => p.id === target)?.path ?? t("page.redirect.missing");
}

/** A page's icon by kind: the home page, a collection, or a page. */
export function PageKindIcon({
  page,
  ...props
}: { page: { kind: PageSummary["kind"]; parentId?: string | null } } & SVGProps<SVGSVGElement>) {
  if (page.parentId === null) return <HomeIcon {...props} />;
  return page.kind === "listing" ? <ListIcon {...props} /> : <DocumentIcon {...props} />;
}

export type Tone = "neutral" | "success" | "warning" | "danger";

/** The dot beside a status in words, by tone. */
export const toneDot: Record<Tone, string> = {
  neutral: "bg-bg-black-400",
  success: "bg-bg-success-600",
  warning: "bg-bg-warning-600",
  danger: "bg-bg-danger-600",
};

/** The coloured dot itself. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden className={clx("size-2 shrink-0 rounded-full", toneDot[tone], className)} />
  );
}

/** The tree row's right edge: a collection's entry count, and an arrow while a redirect is on. */
export function PageRowMeta({ page, pages }: { page: PageSummary; pages: PageSummary[] }) {
  const target = redirectTarget(page, pages);
  if (page.kind !== "listing" && target === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {target !== null && (
        <span title={`${t("page.redirect.to")} ${target}`} className="text-txt-black-500">
          <ArrowForwardIcon className="size-3.5" aria-hidden />
          <span className="sr-only">{`${t("page.redirect.to")} ${target}`}</span>
        </span>
      )}
      {page.kind === "listing" && (
        <span
          title={t("listing.count", { count: page.entryCount ?? 0 })}
          className="bg-bg-washed text-txt-black-700 text-label-compact rounded-sm px-1.5 py-px tabular-nums"
        >
          <span aria-hidden>{page.entryCount ?? 0}</span>
          <span className="sr-only">{t("listing.count", { count: page.entryCount ?? 0 })}</span>
        </span>
      )}
    </span>
  );
}
