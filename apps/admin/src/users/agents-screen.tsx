/**
 * Agents: the AI agents officers have connected over MCP (docs/mcp.md). An
 * Admin comes here to ask two things: is anything connected now (and should
 * it be cut off), and what have agents done. So: one person filter for the
 * page, then live connections first and full width, a row each with End at
 * its edge; then an open log of recent calls grouped by person and agent,
 * older calls on Load more.
 */
import { type AgentConnection, type AuditEntry, CONNECTION_DAYS } from "@fiscal-sb/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusDot } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { EditIcon } from "@/components/ui/icons/edit";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { agentsApi, useMe, usersApi, usersQuery } from "@/lib/auth";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, formatDateTime } from "@/lib/pages";
import { useRun } from "@/lib/use-run";
import { AgentTag, agentOf, describe, failed, lookedOnly, nextBefore } from "./audit-entry";
import { ANY, PersonAvatar, PersonCell, PersonFilter } from "./person";
import { UsersHeader } from "./users-tabs";

/** Tool calls a page of Recent activity shows; Load more brings the next. */
const RECENT = 15;
const DAY_MS = 86_400_000;

export type AgentsSearch = { userId?: string };
export const agentsSearch = (search: Record<string, unknown>): AgentsSearch =>
  typeof search.userId === "string" && search.userId !== ANY ? { userId: search.userId } : {};

/** "6m ago", with the full date on hover. */
const ago = (iso: string) => (
  <time dateTime={iso} title={formatDateTime(iso)}>
    {formatAgo(iso, { inline: true })}
  </time>
);

/** "Ends today", "Ends in 1 day", "Ends in 7 days". */
function endsIn(iso: string) {
  if (new Date(iso).toDateString() === new Date().toDateString()) return t("agents.endsToday");
  return t("agents.endsIn", {
    count: Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / DAY_MS)),
  });
}

/** Consecutive calls by the same person through the same agent, so each pair is named once. */
function byPersonAndAgent(entries: AuditEntry[]) {
  const groups: { who: string; key: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const who = `${entry.user?.id ?? ""}/${agentOf(entry)}`;
    const last = groups.at(-1);
    if (last?.who === who) last.entries.push(entry);
    // The same pair can come back later in the list, so the key adds where.
    else groups.push({ who, key: `${who}-${entry.id}`, entries: [entry] });
  }
  return groups;
}

export function AgentsScreen() {
  const { userId } = useSearch({ strict: false }) as AgentsSearch;
  const navigate = useNavigate();
  const people = useQuery(usersQuery);
  const connections = useQuery({
    queryKey: ["agents", userId],
    queryFn: () => agentsApi.connections(userId),
  });
  // A page at a time, older ones on Load more, until a page comes back short.
  const activity = useInfiniteQuery({
    queryKey: ["audit", { action: "agentToolCall", userId, limit: RECENT }],
    queryFn: ({ pageParam }) =>
      usersApi.audit({ action: "agentToolCall", userId, limit: RECENT, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => nextBefore(last, RECENT),
    // Coming back from another tab shouldn't fetch every loaded page again at once.
    staleTime: 30_000,
  });
  const calls = activity.data?.pages.flat();
  // Each connection's newest call among those loaded (the list is newest first).
  const lastCall = useMemo(() => {
    const last = new Map<unknown, AuditEntry>();
    for (const entry of calls ?? [])
      if (!last.has(entry.detail.connection)) last.set(entry.detail.connection, entry);
    return last;
  }, [calls]);
  const live = connections.data?.filter((c) => c.status === "live");
  // Only people who may connect agents, and whoever is chosen (access may since be off).
  const choices = (people.data ?? []).filter((p) => p.mcpEnabled || p.id === userId);
  const chosen = people.data?.find((p) => p.id === userId)?.displayName;
  const setPerson = (value: string) =>
    void navigate({ to: "/users/agents", search: agentsSearch({ userId: value }), replace: true });

  return (
    <div className="p-surface gap-stack-lg mx-auto flex max-w-6xl flex-col">
      <UsersHeader description={t("agents.intro", { days: CONNECTION_DAYS })} />

      {/* What's live comes first and full width: it's what an Admin may need to act on. */}
      <section aria-labelledby="agents-live" className="flex flex-col gap-3">
        {/* The filter scopes the whole page; it sits at the end of the first section's header. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="agents-live"
            className="text-title text-txt-black-900 m-0 flex items-center gap-2.5 font-semibold"
          >
            <StatusDot tone={live?.length ? "success" : "neutral"} className="size-2.5" />
            {t("agents.live")}
            {live && live.length > 0 && (
              <span className="text-body-sm text-txt-black-500 font-normal">
                {t("agents.live.count", { count: live.length })}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {userId && (
              <Button variant="default-ghost" size="small" onClick={() => setPerson(ANY)}>
                {t("audit.filter.clear")}
              </Button>
            )}
            <PersonFilter
              name="agents-person"
              people={choices}
              value={userId}
              onChange={setPerson}
              hideLabel
            />
          </div>
        </div>
        {!live ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : live.length === 0 ? (
          <p className="text-body-sm text-txt-black-700 m-0">
            {chosen ? t("agents.live.emptyFor", { name: chosen }) : t("agents.live.empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.column.who")}</TableHead>
                <TableHead>{t("audit.column.agent")}</TableHead>
                <TableHead>{t("agents.column.last")}</TableHead>
                <TableHead>{t("agents.column.connected")}</TableHead>
                <TableHead>{t("agents.column.ends")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("agents.end")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {live.map((connection) => (
                <LiveRow
                  key={connection.id}
                  connection={connection}
                  last={lastCall.get(connection.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="agents-activity" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="agents-activity" className="text-title text-txt-black-900 m-0 font-semibold">
            {t("agents.activity")}
          </h2>
          <Link
            to="/users/audit"
            search={{ action: "agentToolCall", ...(userId && { userId }) }}
            className="text-body-sm text-txt-primary underline"
          >
            {t("agents.activity.all")}
          </Link>
        </div>
        {!calls ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : calls.length === 0 ? (
          <p className="text-body-sm text-txt-black-700 m-0">
            {chosen ? t("agents.activity.emptyFor", { name: chosen }) : t("agents.activity.empty")}
          </p>
        ) : (
          // A reading measure, so a call's words and its time stay within one glance.
          <ol className="m-0 flex max-w-3xl list-none flex-col gap-5 p-0 pt-2">
            {byPersonAndAgent(calls).map((group) => (
              <ActivityGroup key={group.key} entries={group.entries} />
            ))}
          </ol>
        )}
        {activity.hasNextPage && (
          <Button
            variant="default-outline"
            size="small"
            className="mt-2 self-start"
            disabled={activity.isFetchingNextPage}
            onClick={() => void activity.fetchNextPage()}
          >
            {activity.isFetchingNextPage ? t("agents.activity.loading") : t("agents.activity.more")}
          </Button>
        )}
      </section>
    </div>
  );
}

/** A person and the agent they work through: the same on every line of the page. */
function Who({ name, agent }: { name: string; agent: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <PersonAvatar name={name} className="size-6" />
      <span className="text-body-sm text-txt-black-900 truncate font-semibold">{name}</span>
      {agent && <AgentTag agent={agent} />}
    </span>
  );
}

/** A muted second line under a table cell's main value. */
const sub = "text-label-compact text-txt-black-500 block";

/**
 * One live connection, one row: who and their role, the agent, what it last
 * did (when it's on the loaded activity), when and where it connected, when it
 * ends, and End. The super admin's connections are theirs to end.
 */
function LiveRow({ connection, last }: { connection: AgentConnection; last?: AuditEntry }) {
  const me = useMe();
  const run = useRun(["agents"]);
  const [confirming, setConfirming] = useState(false);
  const { person, client } = connection;
  const mayEnd = person.role !== "superAdmin" || person.id === me.id;
  const names = { agent: client, name: person.displayName };

  return (
    <TableRow>
      <TableCell>
        <PersonCell name={person.displayName} />
      </TableCell>
      <TableCell>
        <AgentTag agent={client} />
      </TableCell>
      {/* Wide enough that a refusal reads in two or three lines; a narrow table scrolls instead. */}
      <TableCell className="min-w-56">
        {last ? (
          <>
            <span className={clx("block", failed(last) && "text-txt-warning")}>
              {describe(last)}
            </span>
            <span className={sub}>{ago(last.at)}</span>
          </>
        ) : (
          <span>
            {t("agents.active")} {ago(connection.lastUsedAt)}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="block">{formatDateTime(connection.createdAt)}</span>
        <span className={clx(sub, "tabular-nums")}>{connection.ip || "—"}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="block">{endsIn(connection.expiresAt)}</span>
        <span className={sub}>{formatDateTime(connection.expiresAt)}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {mayEnd && (
          <Button variant="danger-outline" size="small" onClick={() => setConfirming(true)}>
            {t("agents.end")}
            <span className="sr-only"> {t("agents.end.of", names)}</span>
          </Button>
        )}
        {confirming && (
          <ConfirmDialog
            open
            onOpenChange={setConfirming}
            title={t("agents.end.title", names)}
            description={t("agents.end.body")}
            confirm={t("agents.end")}
            destructive
            onConfirm={() =>
              void run(() => agentsApi.end(connection.id), t("agents.end.done", names))
            }
          />
        )}
      </TableCell>
    </TableRow>
  );
}

/** Calls by one person through one agent: named once, then one line a call. */
function ActivityGroup({ entries }: { entries: AuditEntry[] }) {
  const first = entries[0]!;
  return (
    <li className="flex flex-col gap-1.5">
      <Who name={first.user?.displayName ?? "?"} agent={agentOf(first)} />
      {/* Indented under the name, so the calls read as that pair's. */}
      <ul className="m-0 flex list-none flex-col p-0 pl-[34px]">
        {entries.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </li>
  );
}

/** How each kind of call looks: its icon, and the colours of the icon and the words. */
const KINDS = {
  failed: { Icon: WarningCircleIcon, icon: "text-txt-warning", text: "text-txt-warning" },
  looked: { Icon: EyeShowIcon, icon: "text-txt-black-500", text: "text-txt-black-700" },
  changed: { Icon: EditIcon, icon: "text-txt-primary", text: "text-txt-black-900 font-medium" },
};

/**
 * One call, one line. Changes read darkest, look-ups grey, failures amber; the
 * icon says the same, so the kind never rests on colour alone.
 */
function ActivityRow({ entry }: { entry: AuditEntry }) {
  const kind = KINDS[failed(entry) ? "failed" : lookedOnly(entry) ? "looked" : "changed"];
  return (
    <li className="text-body-sm flex items-start gap-2 py-0.5">
      <kind.Icon aria-hidden className={clx("mt-[3px] size-3.5 shrink-0", kind.icon)} />
      <span className={clx("min-w-0 grow", kind.text)}>{describe(entry)}</span>
      <span className="text-label-compact text-txt-black-500 shrink-0 pt-px tabular-nums">
        {ago(entry.at)}
      </span>
    </li>
  );
}
