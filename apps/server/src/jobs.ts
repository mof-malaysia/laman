/**
 * A small job queue in the jobs table, worked in-process one job at a time.
 * Jobs survive restarts: anything left running when the process stopped is
 * queued again on start.
 */
import { randomUUID } from "node:crypto";
import type { Job } from "@fiscal-sb/contracts";
import type { FastifyBaseLogger } from "fastify";
import { type Db, now } from "./db/index.js";
import type { JobsTable } from "./db/schema.js";
import { HttpError } from "./errors.js";

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
  >,
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
});

export class Jobs {
  readonly #db: Db;
  readonly #log: FastifyBaseLogger;
  readonly #handlers = new Map<string, JobHandler>();
  #timer: NodeJS.Timeout | undefined;
  #working: Promise<void> | undefined;

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
    const row = {
      id: randomUUID(),
      kind,
      payload: JSON.stringify(payload),
      status: "queued" as const,
      error: null,
      result: null,
      run_at: options.runAt ?? null,
      created_at: now(),
      finished_at: null,
    };
    await this.#db.insertInto("jobs").values(row).execute();
    this.poke();
    return toJob(row);
  }

  async get(id: string): Promise<Job> {
    const row = await this.#db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw new HttpError(404, "job_not_found", "No job with that id");
    return toJob(row);
  }

  /** The log, or the upcoming scheduled jobs: newest first, scheduled soonest first. */
  async list(query: { kind?: string; scheduled: boolean; page: number; pageSize: number }) {
    let base = this.#db.selectFrom("jobs");
    if (query.kind) base = base.where("kind", "=", query.kind);
    base = query.scheduled
      ? base.where("status", "=", "queued").where("run_at", "is not", null)
      : base.where((eb) => eb.or([eb("run_at", "is", null), eb("status", "!=", "queued")]));
    const [rows, total] = await Promise.all([
      base
        .selectAll()
        .orderBy(query.scheduled ? "run_at" : "created_at", query.scheduled ? "asc" : "desc")
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toJob), total: Number(total.n) };
  }

  async detail(id: string) {
    const row = await this.#db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
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
    const row = await this.#db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
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

  async stop() {
    clearInterval(this.#timer);
    await this.#working;
  }

  /** Works the queue now, unless it is already being worked. */
  poke() {
    this.#working ??= this.#drain().finally(() => {
      this.#working = undefined;
    });
  }

  /** Resolves once the queue is empty (for tests and the CLI). */
  async idle() {
    while (this.#working) await this.#working;
  }

  async #drain() {
    for (;;) {
      const job = await this.#db
        .selectFrom("jobs")
        .selectAll()
        .where("status", "=", "queued")
        .where((eb) => eb.or([eb("run_at", "is", null), eb("run_at", "<=", now())]))
        .orderBy((eb) => eb.fn.coalesce("run_at", "created_at"))
        .limit(1)
        .executeTakeFirst();
      if (!job) return;
      await this.#db
        .updateTable("jobs")
        .set((eb) => ({ status: "running", attempts: eb("attempts", "+", 1) }))
        .where("id", "=", job.id)
        .execute();
      const handler = this.#handlers.get(job.kind);
      try {
        if (!handler) throw new Error(`No handler for ${job.kind} jobs`);
        const result = await handler(JSON.parse(job.payload), { id: job.id });
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
