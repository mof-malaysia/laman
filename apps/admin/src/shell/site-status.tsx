/**
 * The site's state, placed by how often it matters: what's waiting to go live
 * in the header, and the renderer, site address and version at the foot of the
 * sidebar.
 */
import { announcementShowing } from "@fiscal-sb/contracts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { type Tone, toneDot } from "@/components/page-status";
import { WaitingList } from "@/components/waiting-list";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { isActive } from "@/lib/api";
import { formatShortDate, useSummary } from "@/lib/pages";
import { useAnnouncementDoc, useWaiting } from "@/lib/publish";

/** A coloured dot and its words. */
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clx(
        "text-body-sm flex min-w-0 items-center gap-2 rounded-md px-2 py-1",
        tone === "danger" ? "text-txt-danger" : "text-txt-black-700",
      )}
    >
      <span aria-hidden className={clx("size-2 shrink-0 rounded-full", toneDot[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** What isn't live yet, in a drawer from the header: the same list as the dashboard's. */
export function WaitingDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer side="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{t("waiting.title")}</DrawerTitle>
          <DrawerDescription>{t("waiting.intro")}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <WaitingList onNavigate={() => onOpenChange(false)} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** What isn't live yet, a running or failed publish, media still processing, the announcement. */
export function PublishState({ onOpenWaiting }: { onOpenWaiting: () => void }) {
  const summary = useSummary();
  const data = summary.data;
  const announcement = useAnnouncementDoc().data?.published;
  const { count, fresh } = useWaiting();
  // New pages are listed, not counted: with nothing else waiting, name them without the warning.
  const [tone, label]: [Tone, string] = count
    ? ["warning", t("status.changes", { count })]
    : fresh
      ? ["neutral", t("status.fresh", { count: fresh })]
      : ["success", t("status.noChanges")];
  const job = data?.publishes[0];
  const running = job && isActive(job);

  return (
    <div className="flex min-w-0 items-center gap-1">
      {summary.isError && <Status tone="danger">{t("status.serverDown")}</Status>}
      {announcement && announcementShowing(announcement) && (
        <Link
          to="/announcement"
          className="focus-ring hover:bg-bg-washed hidden rounded-md no-underline md:block"
        >
          <Status tone="warning">
            {announcement.until
              ? t("status.announcementUntil", {
                  date: formatShortDate(announcement.until),
                })
              : t("status.announcement")}
          </Status>
        </Link>
      )}
      {data && data.media.processing > 0 && (
        <span className="hidden md:block">
          <Status tone="neutral">{t("status.processing", { count: data.media.processing })}</Status>
        </span>
      )}
      {running && <Status tone="neutral">{t("status.publishing")}</Status>}
      {!running && job?.status === "failed" && (
        <Link to="/publishing" className="focus-ring hover:bg-bg-washed rounded-md no-underline">
          <Status tone="danger">{t("status.publishFailed")}</Status>
        </Link>
      )}
      {data && !running && (
        <button
          type="button"
          onClick={onOpenWaiting}
          aria-haspopup="dialog"
          className="focus-ring hover:bg-bg-washed cursor-pointer rounded-md"
        >
          <Status tone={tone}>{label}</Status>
        </button>
      )}
    </div>
  );
}

/** The renderer, the site address and the version: hidden on the icon rail. */
export function SiteInfo() {
  const data = useSummary().data;
  if (!data) return null;
  return (
    <div className="text-body-xs text-txt-black-700 flex flex-col gap-1 px-2 group-data-[collapsible=icon]/sidebar:hidden">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={clx(
            "size-2 shrink-0 rounded-full",
            data.renderer.ok ? toneDot.success : toneDot.danger,
          )}
        />
        {data.renderer.ok ? t("status.renderer.ok") : t("status.renderer.down")}
      </span>
      <span className="truncate">{data.site.url ?? t("status.noSiteUrl")}</span>
      <span>{t("status.version", { version: data.site.version })}</span>
    </div>
  );
}
