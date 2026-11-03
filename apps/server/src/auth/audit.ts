/** The audit log: who signed in, changed an account, or changed what's live. Kept for a year. */
import {
  AUDIT_PAGE,
  type AuditAction,
  type AuditEntry,
  type AuditQuery,
} from "@fiscal-sb/contracts";
import { addDays, startOfDay } from "../analytics/db.js";
import { actingAgent, actingConnection } from "./acting.js";
import { pageFacts } from "../content/pages.js";
import { type Db, now } from "../db/index.js";

export const AUDIT_DAYS = 365;

export type AuditEvent = {
  userId: string | null;
  action: AuditAction;
  target?: string | null;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

export async function audit(db: Pick<Db, "insertInto">, event: AuditEvent) {
  await db
    .insertInto("audit_log")
    .values({
      at: now(),
      user_id: event.userId,
      action: event.action,
      target: event.target ?? null,
      // Done through an agent (docs/mcp.md): said once here, wherever the entry is written.
      detail: JSON.stringify({
        ...event.detail,
        ...(actingAgent() && { agent: actingAgent(), connection: actingConnection() }),
      }),
      ip: event.ip ?? null,
    })
    .execute();
}

/** Newest first, a page at a time: AUDIT_PAGE, or `limit` for a download. */
export async function listAudit(db: Db, query: AuditQuery): Promise<AuditEntry[]> {
  let q = db
    .selectFrom("audit_log")
    .leftJoin("users", "users.id", "audit_log.user_id")
    .select([
      "audit_log.id",
      "audit_log.at",
      "audit_log.user_id",
      "users.display_name",
      "audit_log.action",
      "audit_log.target",
      "audit_log.detail",
      "audit_log.ip",
    ])
    // By `at` first, the same order as by id: a day range then walks the `at` index without sorting.
    .orderBy("audit_log.at", "desc")
    .orderBy("audit_log.id", "desc")
    .limit(query.limit ?? AUDIT_PAGE);
  if (query.userId) q = q.where("audit_log.user_id", "=", query.userId);
  if (query.action) q = q.where("audit_log.action", "=", query.action);
  if (query.from) q = q.where("audit_log.at", ">=", new Date(startOfDay(query.from)).toISOString());
  if (query.to)
    q = q.where("audit_log.at", "<", new Date(startOfDay(addDays(query.to, 1))).toISOString());
  if (query.before !== undefined) q = q.where("audit_log.id", "<", query.before);
  const rows = (await q.execute()).map((r) => {
    const detail = JSON.parse(r.detail) as Record<string, unknown>;
    return { ...r, detail, mentions: mentioned(r.target, detail) };
  });
  const names = await namesOf(
    db,
    rows.flatMap((r) => r.mentions),
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    user: r.user_id ? { id: r.user_id, displayName: r.display_name ?? "" } : null,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
    names: Object.fromEntries(
      r.mentions.flatMap((id) => (names.has(id) ? [[id, names.get(id)!]] : [])),
    ),
  }));
}

/** The ids an entry is about: its target, and the pages a publish chose. */
const mentioned = (target: string | null, detail: Record<string, unknown>) =>
  [target, ...(Array.isArray(detail.pageIds) ? detail.pageIds : [])].filter(
    (id): id is string => typeof id === "string",
  );

/** People's names and pages' titles (deleted pages too), so the log says what an entry was about. */
async function namesOf(db: Db, ids: string[]) {
  const unique = [...new Set(ids)];
  const [people, pages] = await Promise.all([
    unique.length
      ? db.selectFrom("users").select(["id", "display_name"]).where("id", "in", unique).execute()
      : [],
    pageFacts(db, unique),
  ]);
  return new Map([
    ...people.map((p) => [p.id, p.display_name] as const),
    ...[...pages].map(([id, page]) => [id, page.title] as const),
  ]);
}

export async function pruneAudit(db: Db) {
  const cutoff = new Date(Date.now() - AUDIT_DAYS * 86_400_000).toISOString();
  await db.deleteFrom("audit_log").where("at", "<", cutoff).execute();
}
