/**
 * Backups in Settings: first a card on whether the site is safe, with Back
 * up now beside it and a line on the cloud copies when they're on; then the
 * local backups, with the folder, the archives and what the ICT administrator
 * needs to restore one. Restore itself is the CLI's: it replaces every account
 * and needs the server stopped. Last, for the super admin, the cloud backup.
 */
import type { Summary } from "@laman/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HelpButton } from "@/components/help-drawer";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CrossCircleIcon } from "@/components/ui/icons/cross-circle";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Meter, MeterTrack, MeterValue } from "@/components/ui/meter";
import { Spinner } from "@/components/ui/spinner";
import { Tag } from "@/components/ui/tag";
import {
  SummaryList,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot, type Tone } from "@/components/page-status";
import { type MessageKey, t } from "@/i18n";
import { apiError, siteApi, waitForJob } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { type BackupHealth, backupHealth, backupTone } from "@/lib/backups";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatAgo, formatDateTime, useSummary } from "@/lib/pages";
import { formatBytes } from "@/media/format";
import { BackupsHelp } from "./backups-help";
import { OffsiteCard } from "./offsite-card";

/** Server paths and file names run long: let them break anywhere rather than push the panel wide. */
const pathClass = "break-all";

const ago = (iso: string) => formatAgo(iso, { inline: true });

export function BackupsSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const canSecure = useCan("security.manage");
  // Read once for both cards; undefined while it loads.
  const backup = useSummary().data?.backup;
  return (
    <>
      <BackupStatusCard backup={backup} />
      <LocalBackupCard backup={backup} />
      {canSecure && <OffsiteCard onDirtyChange={onDirtyChange} />}
    </>
  );
}

function BackupStatusCard({ backup }: { backup: Summary["backup"] | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canBackUp = useCan("site.manage");
  const [helping, setHelping] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const backUp = async () => {
    if (!backup || backup.running) return;
    try {
      const job = await siteApi.backUp();
      // Shows "Backing up…" until it's done.
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      const done = await waitForJob(job);
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      const size = queryClient.getQueryData<Summary>(["summary"])?.backup.last?.bytes;
      toast(
        done.status === "failed"
          ? {
              variant: "error",
              title: t("settings.backups.failed"),
              description: done.error || t("settings.backups.noReason"),
            }
          : {
              variant: "success",
              title: t("settings.backups.backedUp"),
              description: size === undefined ? undefined : formatBytes(size),
            },
      );
    } catch (caught) {
      toast({
        variant: "error",
        title: t("settings.backups.couldntStart"),
        description: (await apiError(caught))?.message ?? t("settings.backups.noReason"),
      });
    }
  };

  return (
    <SettingsCard
      title={t("settings.backups.status")}
      aside={<HelpButton onClick={() => setHelping(true)} />}
    >
      <BackupsHelp open={helping} onOpenChange={setHelping} />
      {backup ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Status backup={backup} />
            {canBackUp && (
              <Button
                type="button"
                variant="primary-fill"
                className="shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                // Stays focusable while it runs, so focus isn't dropped mid-backup.
                aria-disabled={backup.running}
                onClick={() => !backup.running && setConfirming(true)}
              >
                {t("settings.backups.backUp")}
              </Button>
            )}
          </div>
          {backup.offsite && <OffsiteLine offsite={backup.offsite} />}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("settings.backups.confirm.title")}
            description={
              backup.offsite
                ? `${t("settings.backups.confirm.description")} ${t("settings.backups.confirm.cloud")}`
                : t("settings.backups.confirm.description")
            }
            confirm={t("settings.backups.backUp")}
            onConfirm={() => void backUp()}
          />
        </>
      ) : (
        <Skeleton className="h-16 w-full rounded-lg" />
      )}
    </SettingsCard>
  );
}

/** Where the archives are, the disk they're on, and the list of them. */
function LocalBackupCard({ backup }: { backup: Summary["backup"] | undefined }) {
  const canBackUp = useCan("site.manage");
  return (
    <SettingsCard title={t("settings.backups.local")}>
      {backup ? (
        <>
          {backup.sameDisk && !backup.offsite?.last && (
            <Callout variant="warning">
              <CalloutTitle>{t("settings.backups.sameDisk")}</CalloutTitle>
            </Callout>
          )}
          {canBackUp && <BackupDetails backup={backup} />}
        </>
      ) : (
        <Skeleton className="h-16 w-full rounded-lg" />
      )}
    </SettingsCard>
  );
}

/** The one answer an officer comes for: is the site safe, and if not, what to do. */
function Status({ backup }: { backup: Summary["backup"] }) {
  const health = backupHealth(backup);
  const daily =
    backup.schedule && backup.next
      ? t("settings.backups.daily", { next: formatDateTime(backup.next) })
      : t("settings.backups.dailyOff");

  const [title, hint] = backup.running
    ? [t("settings.backups.running"), t("settings.backups.runningHint")]
    : statusText(backup, health, daily);
  const tone = backupTone(health);
  const icon = backup.running ? (
    <Spinner size="medium" label={null} />
  ) : tone === "danger" ? (
    <CrossCircleIcon className="text-txt-danger size-6" />
  ) : tone === "warning" ? (
    <WarningCircleIcon className="text-txt-warning size-6" />
  ) : (
    <CheckCircleIcon className="text-txt-success size-6" />
  );
  return (
    <div className="flex min-w-0 grow items-start gap-3">
      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
        {icon}
      </span>
      {/* Announced as it changes: running, done, failed. */}
      <output className="flex min-w-0 flex-col">
        <span className="text-body-md text-txt-black-900 font-semibold">{title}</span>
        <span className="text-body-sm text-txt-black-700">{hint}</span>
      </output>
    </div>
  );
}

/** The status card's title and hint for each state. */
function statusText(backup: Summary["backup"], health: BackupHealth, daily: string) {
  switch (health) {
    case "failed":
      return [
        t("settings.backups.failed"),
        t("settings.backups.failedHint", { ago: ago(backup.failed!.at) }),
      ];
    case "never":
      return [t("settings.backups.never"), daily];
    case "stale":
      return [
        t("settings.backups.stale", { ago: ago(backup.last!.at) }),
        backup.schedule ? t("settings.backups.staleHint") : daily,
      ];
    case "offsiteFailed":
      return [
        t("settings.backups.offsiteFailed"),
        t("settings.backups.offsiteFailedHint", { ago: ago(backup.last!.at) }),
      ];
    case "diskLow":
      return [
        t("settings.backups.diskLow"),
        t("settings.backups.diskLowHint", { free: formatBytes(backup.disk!.free) }),
      ];
    case "ok":
      return [t("settings.backups.ok", { ago: ago(backup.last!.at) }), daily];
  }
}

/** The second line: where the copies off the server stand, and the last check of one. */
function OffsiteLine({ offsite }: { offsite: NonNullable<Summary["backup"]["offsite"]> }) {
  const where = {
    where: `${t(`settings.offsite.provider.${offsite.provider}`)}, ${offsite.bucket}`,
  };
  const [tone, copy]: [Tone, string] = offsite.running
    ? ["neutral", t("settings.backups.offsite.running")]
    : offsite.failed
      ? ["danger", t("settings.backups.offsite.failed", { ago: ago(offsite.failed.at) })]
      : offsite.last
        ? ["success", t("settings.backups.offsite.ok", { ago: ago(offsite.last.at), ...where })]
        : ["warning", t("settings.backups.offsite.never", where)];
  const check = offsite.verified
    ? offsite.verified.ok
      ? t("settings.backups.offsite.checked", { ago: ago(offsite.verified.at) })
      : t("settings.backups.offsite.checkFailed", { ago: ago(offsite.verified.at) })
    : t("settings.backups.offsite.notChecked");
  return (
    <div className="text-body-sm text-txt-black-700 flex min-w-0 items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center">
        <StatusDot tone={tone} />
      </span>
      <output className="flex min-w-0 flex-col">
        <span className={tone === "danger" ? "text-txt-danger" : "text-txt-black-900"}>{copy}</span>
        <span className={offsite.verified?.ok === false ? "text-txt-danger" : undefined}>
          {check}
          {offsite.encrypt && <> · {t("settings.backups.offsite.encrypted")}</>}
        </span>
      </output>
    </div>
  );
}

/** Paths, the schedule setting, the raw error and the archive names: what restoring takes. */
function BackupDetails({ backup }: { backup: Summary["backup"] }) {
  const rows: [MessageKey, ReactNode][] = [
    [
      "settings.backups.details.folder",
      <code key="folder" className={pathClass}>
        {backup.dir}
      </code>,
    ],
    [
      "settings.backups.details.schedule",
      <code key="schedule">BACKUP_SCHEDULE={backup.schedule ?? "off"}</code>,
    ],
    ["settings.backups.details.disk", <DiskSpace key="disk" disk={backup.disk} />],
  ];
  if (backup.failed)
    rows.push([
      "settings.backups.details.error",
      <span key="error" className={pathClass}>
        {backup.failed.error}
      </span>,
    ]);
  const offsite = backup.offsite;
  if (offsite?.failed)
    rows.push([
      "settings.backups.details.offsiteError",
      <span key="offsite-error" className={pathClass}>
        {offsite.failed.error}
      </span>,
    ]);
  if (offsite?.verified && !offsite.verified.ok)
    rows.push([
      "settings.backups.details.checkError",
      <span key="check-error" className={pathClass}>
        {offsite.verified.error}
      </span>,
    ]);
  return (
    <div className="gap-stack-md flex flex-col">
      <SummaryList>
        <SummaryListBody>
          {rows.map(([label, value]) => (
            <SummaryListRow key={label}>
              <SummaryListTerm>{t(label)}</SummaryListTerm>
              <SummaryListDetail>{value}</SummaryListDetail>
            </SummaryListRow>
          ))}
        </SummaryListBody>
      </SummaryList>
      {backup.archives.length > 0 && (
        <Table>
          <caption className="text-body-md text-txt-black-900 caption-top pb-2 text-left font-semibold">
            {t("settings.backups.details.kept")}{" "}
            <Tag size="small" className="ml-1 align-middle">
              {backup.archives.length}
            </Tag>
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.backups.details.date")}</TableHead>
              <TableHead>{t("settings.backups.details.type")}</TableHead>
              <TableHead>{t("settings.backups.details.size")}</TableHead>
              <TableHead>{t("settings.backups.details.file")}</TableHead>
              {offsite && <TableHead>{t("settings.backups.details.offsite")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {backup.archives.map((archive) => (
              <TableRow key={archive.file}>
                <TableCell>{formatDateTime(archive.at)}</TableCell>
                <TableCell>
                  {t(
                    archive.dbOnly
                      ? "settings.backups.details.dbOnly"
                      : "settings.backups.details.full",
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatBytes(archive.bytes)}
                </TableCell>
                <TableCell>
                  <code className={pathClass}>{archive.file}</code>
                </TableCell>
                {offsite && (
                  <TableCell className="whitespace-nowrap">
                    {offsite.copied.includes(archive.file)
                      ? t("settings.backups.details.copied")
                      : t("settings.backups.details.notCopied")}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {offsite && <CheckNow />}
    </div>
  );
}

/** Queues the weekly check of the newest off-site copy now. */
function CheckNow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const done = await waitForJob(await siteApi.verifyOffsite());
      toast(
        done.status === "failed"
          ? {
              variant: "error",
              title: t("settings.backups.offsite.checkFailedNow"),
              description: done.error || t("settings.backups.noReason"),
            }
          : { variant: "success", title: t("settings.backups.offsite.checkedNow") },
      );
    } catch (caught) {
      toast({
        variant: "error",
        title: t("settings.backups.offsite.checkFailedNow"),
        description: (await apiError(caught))?.message ?? t("settings.backups.noReason"),
      });
    } finally {
      setChecking(false);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="default-outline"
        size="small"
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        aria-disabled={checking}
        onClick={() => !checking && void check()}
      >
        {t("settings.backups.offsite.checkNow")}
      </Button>
      {checking && (
        <output className="text-body-sm text-txt-black-700 flex items-center gap-2">
          <Spinner size="small" label={null} />
          {t("settings.backups.offsite.checking")}
        </output>
      )}
    </div>
  );
}

/** How full the backup disk is, red when it's running low. */
function DiskSpace({ disk }: { disk: Summary["backup"]["disk"] }) {
  if (!disk)
    return <span className="text-txt-black-700">{t("settings.backups.details.diskUnknown")}</span>;
  const text = t("settings.backups.details.diskFree", {
    free: formatBytes(disk.free),
    total: formatBytes(disk.total),
  });
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Meter
        aria-label={t("settings.backups.details.disk")}
        value={disk.total - disk.free}
        max={disk.total}
        tone={disk.low ? "danger" : "default"}
        toneLabels={{ danger: t("settings.backups.details.diskLow") }}
        getAriaValueText={() =>
          disk.low ? `${text}, ${t("settings.backups.details.diskLow")}` : text
        }
      >
        <MeterValue className="col-start-1 justify-self-start">{() => text}</MeterValue>
        <MeterTrack size="small" />
      </Meter>
      {disk.low && (
        <span className="text-body-sm text-txt-danger">
          {t("settings.backups.details.diskLowHint")}
        </span>
      )}
    </div>
  );
}
