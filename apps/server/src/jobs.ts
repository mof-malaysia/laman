/**
 * A small job queue in the jobs table, worked in-process one job at a time.
 * Jobs survive restarts: anything left running when the process stopped is
 * queued again on start, up to MAX_ATTEMPTS starts, so a job that takes the
 * process down with it can't do so on every restart.
 */
import { randomUUID } from "node:crypto";
import type { Job } from "@fiscal-sb/contracts";
import type { FastifyBaseLogger } from "fastify";
import { type Db, now, utc } from "./db/index.js";
import type { JobsTable } from "./db/schema.js";
import { HttpError } from "./errors.js";
import { actingUser, runAs } from "./auth/acting.js";

/** How many times a job is started before it's given up on. */
export const MAX_ATTEMPTS = 3;

/** May return counts to keep with the job, such as `{ pages: 12 }`. */
export type JobHandler = (
  payload: unknown,
  job: { id: string },
) => Promise<Record<string, number> | void>;

export const toJob = (
  row: Pick<
    JobsTable,
    | "id"
    | "kind"
    | "payload"
    | "status"
    | "error"
    | "result"
    | "run_at"
    | "created_at"
    | "finished_at"
  > & { created_by_name?: string | null },
): Job => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  error: row.error,
  payload: JSON.parse(row.payload) as Record<string, unknown>,
  runAt: row.run_at,
  result: row.result ? (JSON.parse(row.result) as Record<string, number>) : null,
  createdAt: row.created_at,
  finishedAt: row.finished_at,
  createdBy: row.created_by_name ?? null,
});

/** Jobs with the name of whoever queued them. */
export const withCreator = (db: Db) =>
  db
    .selectFrom("jobs")
    .leftJoin("users", "users.id", "jobs.created_by")
    .selectAll("jobs")
    .select("users.display_name as created_by_name");

/**
 * Adds a job to the table without working it: for a queue that's running, use
 * `Jobs.enqueue`; this is for a database no server has open yet (a restore).
 */
export async function queueJob(
  db: Db,
  kind: string,
  payload: unknown = {},
  options: { runAt?: string } = {},
) {
  const id = randomUUID();
  await db
    .insertInto("jobs")
    .values({
      id,
      kind,
      payload: JSON.stringify(payload),
      status: "queued",
      error: null,
      result: null,
      run_at: options.runAt ? utc(options.runAt) : null,
      created_at: now(),
      finished_at: null,
      created_by: actingUser(),
    })
    .execute();
  return id;
}

export class Jobs {
  readonly #db: Db;
  readonly #log: FastifyBaseLogger;
  readonly #handlers = new Map<string, JobHandler>();
  #timer: NodeJS.Timeout | undefined;
  #working: Promise<void> | undefined;
  #stopping = false;

  constructor(db: Db, log: FastifyBaseLogger) {
    this.#db = db;
    this.#log = log;
  }

  handle(kind: string, handler: JobHandler) {
    this.#handlers.set(kind, handler);
  }

  /** Queues a job; with `runAt` it waits until then. */
  async enqueue(
    kind: string,
    payload: unknown = {},
    options: { runAt?: string } = {},
  ): Promise<Job> {
    const id = await queueJob(this.#db, kind, payload, options);
    this.poke();
    return this.get(id);
  }

  async get(id: string): Promise<Job> {
    const row = await withCreator(this.#db).where("jobs.id", "=", id).executeTakeFirst();
    if (!row) throw new HttpError(404, "job_not_found", "No job with that id");
    return toJob(row);
  }

  /** The log, or the upcoming scheduled jobs: newest first, scheduled soonest first. */
  async list(query: { kind?: string; scheduled: boolean; page: number; pageSize: number }) {
    let base = this.#db.selectFrom("jobs");
    if (query.kind) base = base.where("jobs.kind", "=", query.kind);
    base = query.scheduled
      ? base.where("jobs.status", "=", "queued").where("jobs.run_at", "is not", null)
      : base.where((eb) =>
          eb.or([eb("jobs.run_at", "is", null), eb("jobs.status", "!=", "queued")]),
        );
    const rows = base
      .leftJoin("users", "users.id", "jobs.created_by")
      .selectAll("jobs")
      .select("users.display_name as created_by_name");
    const count = base;
    const [items, total] = await Promise.all([
      rows
        .orderBy(
          query.scheduled ? "jobs.run_at" : "jobs.created_at",
          query.scheduled ? "asc" : "desc",
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      count.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    ]);
    return { items: items.map(toJob), total: Number(total.n) };
  }

  async detail(id: string) {
    const row = await withCreator(this.#db).where("jobs.id", "=", id).executeTakeFirst();
    if (!row) throw new HttpError(404, "job_not_found", "No job with that id");
    return { ...toJob(row), log: row.log ? (JSON.parse(row.log) as unknown[]) : [] };
  }

  /** Cancels a job that hasn't started. */
  async cancel(id: string) {
    const result = await this.#db
      .deleteFrom("jobs")
      .where("id", "=", id)
      .where("status", "=", "queued")
      .executeTakeFirst();
    if (result.numDeletedRows === 0n)
      throw new HttpError(409, "job_not_queued", "Only a job that hasn't started can be cancelled");
  }

  /** Runs a failed job again, now. */
  async retry(id: string): Promise<Job> {
    const row = await withCreator(this.#db).where("jobs.id", "=", id).executeTakeFirst();
    if (!row) throw new HttpError(404, "job_not_found", "No job with that id");
    if (row.status !== "failed")
      throw new HttpError(409, "job_not_failed", "Only a failed job can be retried");
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    return this.enqueue(row.kind, {
      ...payload,
      trigger: payload.trigger === "scheduled" ? "scheduled" : "retry",
    });
  }

  async start(intervalMs = 1000) {
    await this.#db
      .updateTable("jobs")
      .set({ status: "queued" })
      .where("status", "=", "running")
      .execute();
    this.#timer = setInterval(() => this.poke(), intervalMs);
    this.poke();
  }

  /** Lets the job that's running finish; the rest wait for the next start. */
  async stop() {
    this.#stopping = true;
    clearInterval(this.#timer);
    await this.#working;
  }

  /**
   * Works the queue now, unless it is already being worked. A failure to
   * read or update the queue (the database busy, say) is logged, and the
   * next poke tries again: it must never take the process down.
   */
  poke() {
    if (this.#stopping) return;
    this.#working ??= this.#drain()
      .catch((error: unknown) => this.#log.error({ err: error }, "job queue failed"))
      .finally(() => {
        this.#working = undefined;
      });
  }

  /** Resolves once the queue is empty (for tests and the CLI). */
  async idle() {
    while (this.#working) await this.#working;
  }

  async #drain() {
    while (!this.#stopping) {
      const job = await this.#db
        .selectFrom("jobs")
        .selectAll()
        .where("status", "=", "queued")
        .where((eb) => eb.or([eb("run_at", "is", null), eb("run_at", "<=", now())]))
        .orderBy((eb) => eb.fn.coalesce("run_at", "created_at"))
        .limit(1)
        .executeTakeFirst();
      if (!job) return;
      if (job.attempts >= MAX_ATTEMPTS) {
        await this.#finish(
          job.id,
          "failed",
          `Stopped after ${MAX_ATTEMPTS} tries: the builder stopped while it was running each time.`,
        );
        this.#log.error({ job: job.id, kind: job.kind }, "job given up");
        continue;
      }
      await this.#db
        .updateTable("jobs")
        .set((eb) => ({ status: "running", attempts: eb("attempts", "+", 1) }))
        .where("id", "=", job.id)
        .execute();
      const handler = this.#handlers.get(job.kind);
      try {
        if (!handler) throw new Error(`No handler for ${job.kind} jobs`);
        // A scheduled publish acts for whoever scheduled it.
        const result = await runAs(job.created_by, () =>
          handler(JSON.parse(job.payload), { id: job.id }),
        );
        await this.#finish(job.id, "done", null, result ?? null);
        this.#log.info({ job: job.id, kind: job.kind }, "job done");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.#finish(job.id, "failed", message);
        this.#log.error({ job: job.id, kind: job.kind, err: error }, "job failed");
      }
    }
  }

  async #finish(
    id: string,
    status: "done" | "failed",
    error: string | null,
    result: Record<string, number> | null = null,
  ) {
    await this.#db
      .updateTable("jobs")
      .set({ status, error, result: result && JSON.stringify(result), finished_at: now() })
      .where("id", "=", id)
      .execute();
  }
}
