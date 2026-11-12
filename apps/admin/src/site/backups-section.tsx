/**
 * Backups in Settings: one line on whether the site is safe, with a backup
 * now beside it, a second on the off-site copies when they're on, and what
 * the ICT administrator needs to restore one behind Technical details.
 * Restore itself is the CLI's: it replaces every account and needs the
 * server stopped. Below it, for the super admin, where copies go off-site.
 */
import type { Summary } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CrossCircleIcon } from "@/components/ui/icons/cross-circle";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Spinner } from "@/components/ui/spinner";
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
import { backupHealth } from "@/lib/backups";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatAgo, formatDateTime, useSummary } from "@/lib/pages";
import { formatBytes } from "@/media/format";
import { OffsiteCard } from "./offsite-card";

/** Server paths and file names run long: let them break anywhere rather than push the panel wide. */
const pathClass = "break-all";

const ago = (iso: string) => formatAgo(iso, { inline: true });

export function BackupsSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const canSecure = useCan("security.manage");
  return (
    <>
      <BackupStatusCard />
      {canSecure && <OffsiteCard onDirtyChange={onDirtyChange} />}
    </>
  );
}

function BackupStatusCard() {
  const summary = useSummary();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canBackUp = useCan("site.manage");
  const backup = summary.data?.backup;

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
    <SettingsCard title={t("settings.backups")}>
      {backup ? (
        <>
          <div className="border-otl-gray-200 flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-5">
            <Status backup={backup} />
            {canBackUp && (
              <Button
                type="button"
                variant="primary-fill"
                className="shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                // Stays focusable while it runs, so focus isn't dropped mid-backup.
                aria-disabled={backup.running}
                onClick={() => void backUp()}
              >
                {t("settings.backups.backUp")}
              </Button>
            )}
          </div>
          {backup.offsite && <OffsiteLine offsite={backup.offsite} />}
          {backup.sameDisk && !backup.offsite?.last && (
            <Callout variant="warning">
              <CalloutTitle>{t("settings.backups.sameDisk")}</CalloutTitle>
            </Callout>
          )}
          <p className="text-body-sm text-txt-black-700 m-0">{t("settings.backups.restore")}</p>
          {canBackUp && <TechnicalDetails backup={backup} />}
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

  const [icon, title, hint]: [ReactNode, string, string] = backup.running
    ? [
        <Spinner key="icon" size="medium" label={null} />,
        t("settings.backups.running"),
        t("settings.backups.runningHint"),
      ]
    : health === "failed"
      ? [
          <CrossCircleIcon key="icon" className="text-txt-danger size-6" />,
          t("settings.backups.failed"),
          t("settings.backups.failedHint", { ago: ago(backup.failed!.at) }),
        ]
      : health === "offsiteFailed"
        ? [
            <CrossCircleIcon key="icon" className="text-txt-danger size-6" />,
            t("settings.backups.offsiteFailed"),
            t("settings.backups.offsiteFailedHint", { ago: ago(backup.last!.at) }),
          ]
        : health === "never"
          ? [
              <WarningCircleIcon key="icon" className="text-txt-warning size-6" />,
              t("settings.backups.never"),
              daily,
            ]
          : health === "stale"
            ? [
                <WarningCircleIcon key="icon" className="text-txt-warning size-6" />,
                t("settings.backups.stale", { ago: ago(backup.last!.at) }),
                backup.schedule ? t("settings.backups.staleHint") : daily,
              ]
            : [
                <CheckCircleIcon key="icon" className="text-txt-success size-6" />,
                t("settings.backups.ok", { ago: ago(backup.last!.at) }),
                daily,
              ];
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
function TechnicalDetails({ backup }: { backup: Summary["backup"] }) {
  const rows: [MessageKey, ReactNode][] = [
    [
      "settings.backups.details.folder",
      <span key="folder" className="flex flex-col gap-1">
        <code className={pathClass}>{backup.dir}</code>
        {backup.sameDisk && (
          <span className="text-body-sm text-txt-black-700">
            {t("settings.backups.details.sameDisk")}
          </span>
        )}
      </span>,
    ],
    [
      "settings.backups.details.schedule",
      <code key="schedule">BACKUP_SCHEDULE={backup.schedule ?? "off"}</code>,
    ],
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
    <Details>
      <DetailsTrigger>{t("settings.backups.details")}</DetailsTrigger>
      <DetailsContent className="gap-stack-md flex flex-col">
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
              {t("settings.backups.details.kept")}
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
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-txt-black-700 m-0">
            {t("settings.backups.details.restore")}
          </p>
          <code className={pathClass}>site-builder restore &lt;file&gt;</code>
        </div>
        {offsite && (
          <div className="flex flex-col gap-1">
            <p className="text-body-sm text-txt-black-700 m-0">
              {t("settings.backups.details.fetch")}
            </p>
            <code className={pathClass}>site-builder backups --remote</code>
            <code className={pathClass}>site-builder fetch &lt;file&gt;</code>
          </div>
        )}
        {offsite && <CheckNow />}
      </DetailsContent>
    </Details>
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
