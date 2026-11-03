/**
 * The site's state, placed by how often it matters: what's waiting to go live
 * (and a backup that's missing or failed) in the header, and the renderer and
 * version at the foot of the sidebar.
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
import { StatusDot, type Tone } from "@/components/page-status";
import { SidebarMenuItem } from "@/components/ui/app-shell";
import { WaitingList } from "@/components/waiting-list";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { isActive } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { backupHealth } from "@/lib/backups";
import { formatShortDate, useSummary } from "@/lib/pages";
import { useAnnouncementDoc, useWaiting } from "@/lib/publish";
import { sessionLost } from "@/lib/session";
import { useStore } from "@/lib/store";

/** A coloured dot and its words. */
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clx(
        "text-body-sm flex min-w-0 items-center gap-2 rounded-md px-2 py-1",
        tone === "danger" ? "text-txt-danger" : "text-txt-black-700",
      )}
    >
      <StatusDot tone={tone} />
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

  const lost = useStore(sessionLost);
  // Only for those who can back up: anyone else can't act on it from here.
  const canBackUp = useCan("site.manage");
  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Signed out, the summary fails too: that's said by Sign in again, not as a server fault. */}
      {summary.isError && !lost && <Status tone="danger">{t("status.serverDown")}</Status>}
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
      {data && canBackUp && backupHealth(data.backup) !== "ok" && (
        <Link
          to="/settings"
          search={{ section: "backups" }}
          className="focus-ring hover:bg-bg-washed hidden rounded-md no-underline md:block"
        >
          <Status tone={data.backup.failed ? "danger" : "warning"}>
            {data.backup.failed ? t("status.backupFailed") : t("status.backupMissing")}
          </Status>
        </Link>
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

/**
 * The renderer's health and the version, as the last sidebar item. It shows
 * a state, so it looks like an item but isn't one you can click. On the icon
 * rail only the dot stays.
 */
export function SiteInfo() {
  const data = useSummary().data;
  if (!data) return null;
  const ok = data.renderer.ok;
  return (
    <SidebarMenuItem>
      <div
        className={clx(
          "text-label-md text-txt-black-700 flex h-[var(--ctl-h-sm)] w-full min-w-0 items-center gap-3 px-3",
          "group-data-[collapsible=icon]/sidebar:w-[var(--ctl-h-sm)] group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0",
        )}
      >
        {/* Sits in the icon column, so the label lines up with the items above. */}
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
          <StatusDot tone={ok ? "success" : "danger"} />
        </span>
        <span className="min-w-0 grow truncate group-data-[collapsible=icon]/sidebar:sr-only">
          {ok ? t("status.renderer.ok") : t("status.renderer.down")}
        </span>
        <span className="text-label-compact text-txt-black-500 shrink-0 tabular-nums group-data-[collapsible=icon]/sidebar:hidden">
          {t("status.version", { version: data.site.version })}
        </span>
      </div>
    </SidebarMenuItem>
  );
}
