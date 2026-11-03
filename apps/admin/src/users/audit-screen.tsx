/**
 * The audit log: sign-ins, account changes and changes to what's live,
 * newest first, 50 at a time. Kept for a year. Each entry says what it was
 * about, by name, and can be downloaded as CSV for an inquiry.
 */
import { AUDIT_PAGE, AuditAction, type AuditEntry } from "@fiscal-sb/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { usersApi, usersQuery } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDateTime } from "@/lib/pages";
import { AgentTag, agentOf, describe, lookedOnly, nextBefore } from "./audit-entry";
import { ANY, PersonFilter } from "./person";
import { UsersHeader } from "./users-tabs";

/** Entries a download asks for at once: the most the server gives. */
const DOWNLOAD_PAGE = 1000;

/**
 * The filters, in the address, so a filtered log can be linked, reloaded and
 * come back to: Users › Manage › View activity links here with `userId`.
 */
export type AuditSearch = { userId?: string; action?: AuditAction; from?: string; to?: string };
const day = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
export const auditSearch = (search: Record<string, unknown>): AuditSearch => {
  const action = AuditAction.safeParse(search.action);
  return {
    ...(typeof search.userId === "string" && search.userId !== ANY && { userId: search.userId }),
    ...(action.success && { action: action.data }),
    ...(day(search.from) && { from: day(search.from) }),
    ...(day(search.to) && { to: day(search.to) }),
  };
};

/** The action filter's headings, so 20 actions read as three short lists. */
const actionGroups = {
  signIn: "access",
  signInFailed: "access",
  signOut: "access",
  passwordChanged: "access",
  passwordReset: "access",
  twoFactorEnrolled: "access",
  recoveryCodesMade: "access",
  securityChanged: "access",
  inviteMade: "people",
  inviteRevoked: "people",
  inviteUsed: "people",
  userChanged: "people",
  resetLinkMade: "people",
  twoFactorCleared: "people",
  userSignedOut: "people",
  published: "site",
  unpublished: "site",
  publishUndone: "site",
  pageDeleted: "site",
  pageRestored: "site",
  backupStarted: "site",
  backupRestored: "site",
  agentConnected: "agents",
  agentRevoked: "agents",
  agentToolCall: "agents",
} as const satisfies Record<AuditAction, "access" | "people" | "site" | "agents">;

const actionOptions = () =>
  (["access", "people", "site", "agents"] as const).flatMap((group) =>
    AuditAction.options
      .filter((action) => actionGroups[action] === group)
      .map((action) => ({
        value: action,
        label: t(`audit.action.${action}`),
        group: t(`audit.group.${group}`),
      })),
  );

export function AuditScreen() {
  const filter = useSearch({ strict: false }) as AuditSearch;
  const navigate = useNavigate();
  const setFilter = (change: Partial<AuditSearch>) =>
    void navigate({
      to: "/users/audit",
      // Leaving out "any" and an emptied date drops them from the address.
      search: auditSearch({ ...filter, ...change }),
      replace: true,
    });
  const people = useQuery(usersQuery);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const filtered = Object.keys(filter).length > 0;
  const log = useInfiniteQuery({
    queryKey: ["audit", filter],
    queryFn: ({ pageParam }) => usersApi.audit({ ...filter, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => nextBefore(last, AUDIT_PAGE),
  });
  const entries = log.data?.pages.flat() ?? [];

  /** Every entry the filters match, not only the pages shown. */
  const download = async () => {
    setDownloading(true);
    try {
      const all: AuditEntry[] = [];
      let before: number | undefined;
      do {
        const page = await usersApi.audit({ ...filter, before, limit: DOWNLOAD_PAGE });
        all.push(...page);
        before = nextBefore(page, DOWNLOAD_PAGE);
      } while (before !== undefined);
      save(toCsv(all), `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast({ variant: "error", title: t("audit.download.failed") });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-surface gap-stack-lg mx-auto flex max-w-6xl flex-col">
      <UsersHeader
        description={t("audit.intro")}
        actions={
          <Button
            variant="default-outline"
            size="small"
            disabled={downloading || entries.length === 0}
            onClick={() => void download()}
          >
            {downloading ? t("audit.download.pending") : t("audit.download")}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <PersonFilter
          name="audit-person"
          people={people.data ?? []}
          value={filter.userId}
          onChange={(userId) => setFilter({ userId })}
        />
        <Field name="audit-action" className="w-64">
          <FieldLabel>{t("audit.filter.action")}</FieldLabel>
          <Select
            items={[{ value: ANY, label: t("audit.filter.anything") }, ...actionOptions()]}
            value={filter.action ?? ANY}
            onValueChange={(action) => setFilter({ action: action as AuditAction })}
          />
        </Field>
        <Field name="audit-from" className="w-44">
          <FieldLabel>{t("audit.filter.from")}</FieldLabel>
          <Input
            type="date"
            value={filter.from ?? ""}
            max={filter.to}
            onChange={(e) => setFilter({ from: e.target.value })}
          />
        </Field>
        <Field name="audit-to" className="w-44">
          <FieldLabel>{t("audit.filter.to")}</FieldLabel>
          <Input
            type="date"
            value={filter.to ?? ""}
            min={filter.from}
            onChange={(e) => setFilter({ to: e.target.value })}
          />
        </Field>
        {filtered && (
          <Button
            variant="default-ghost"
            onClick={() => void navigate({ to: "/users/audit", search: {}, replace: true })}
          >
            {t("audit.filter.clear")}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("audit.column.when")}</TableHead>
            <TableHead>{t("audit.column.who")}</TableHead>
            <TableHead>{t("audit.column.agent")}</TableHead>
            <TableHead>{t("audit.column.what")}</TableHead>
            <TableHead>{t("audit.column.address")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {log.data && entries.length === 0 ? (
            <TableRow>
              <TableEmpty colSpan={5}>
                {filtered ? t("audit.empty.filtered") : t("audit.empty")}
              </TableEmpty>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="tabular-nums whitespace-nowrap">
                  {formatDateTime(entry.at)}
                </TableCell>
                <TableCell>{who(entry)}</TableCell>
                <TableCell>
                  <AgentTag agent={agentOf(entry)} />
                </TableCell>
                <TableCell className={lookedOnly(entry) ? "text-txt-black-500" : undefined}>
                  {describe(entry)}
                </TableCell>
                <TableCell className="text-txt-black-500 tabular-nums">{entry.ip ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {log.hasNextPage && (
        <Button
          variant="default-outline"
          className="self-center"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          {t("audit.more")}
        </Button>
      )}
    </div>
  );
}

/** The person; with no one signed in, the server or an unknown visitor. The agent has its own column. */
function who(entry: AuditEntry) {
  if (entry.user) return entry.user.displayName;
  if (entry.action === "signInFailed") return t("audit.unknown");
  return entry.detail.cli ? t("audit.cli") : t("audit.system");
}

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** When, who, what and from where, one row an entry, for a spreadsheet. */
function toCsv(entries: AuditEntry[]) {
  const header = [
    t("audit.column.when"),
    t("audit.column.who"),
    t("audit.column.agent"),
    t("audit.column.what"),
    t("audit.column.address"),
  ];
  const rows = entries.map((e) => [e.at, who(e), agentOf(e), describe(e), e.ip ?? ""]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function save(csv: string, filename: string) {
  // A byte-order mark, so Excel reads BM and other non-ASCII names as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
