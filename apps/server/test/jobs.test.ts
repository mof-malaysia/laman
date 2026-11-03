import { afterEach, beforeEach, describe, expect, it } from "@rstest/core";
import type { FastifyBaseLogger } from "fastify";
import { type Db, openDatabase } from "../src/db/index.js";
import { Jobs, MAX_ATTEMPTS } from "../src/jobs.js";
import { myt } from "./helpers.js";

let db: Db;
let errors: string[];

const quiet = () => undefined;

/** A logger that keeps what went wrong. */
const log = () => {
  errors = [];
  return {
    info: quiet,
    warn: quiet,
    debug: quiet,
    error: (_: unknown, message: string) => errors.push(message),
  } as unknown as FastifyBaseLogger;
};

const statusOf = async (id: string) =>
  (await db.selectFrom("jobs").select("status").where("id", "=", id).executeTakeFirstOrThrow())
    .status;

beforeEach(async () => {
  db = await openDatabase(":memory:");
});
afterEach(async () => {
  await db.destroy().catch(() => undefined);
});

describe("jobs", () => {
  it("gives up on a job the builder stopped during on every try", async () => {
    const jobs = new Jobs(db, log());
    let ran = 0;
    jobs.handle("crashy", async () => {
      ran++;
    });
    const job = await jobs.enqueue("crashy");
    await jobs.idle();
    expect(ran).toBe(1);
    // As if the process died while it ran, MAX_ATTEMPTS times.
    await db
      .updateTable("jobs")
      .set({ status: "queued", attempts: MAX_ATTEMPTS })
      .where("id", "=", job.id)
      .execute();
    jobs.poke();
    await jobs.idle();
    expect(ran).toBe(1);
    expect(await statusOf(job.id)).toBe("failed");
    expect((await jobs.get(job.id)).error).toContain(`${MAX_ATTEMPTS} tries`);
  });

  it("logs a failure to read the queue instead of crashing", async () => {
    const jobs = new Jobs(db, log());
    await db.destroy();
    jobs.poke();
    await jobs.idle();
    expect(errors).toContain("job queue failed");
  });

  it("finishes the running job on stop, and leaves the rest queued", async () => {
    const jobs = new Jobs(db, log());
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      jobs.handle("slow", async () => {
        resolve();
        await new Promise<void>((done) => (release = done));
      });
    });
    const first = await jobs.enqueue("slow");
    const second = await jobs.enqueue("slow");
    await started;
    const stopped = jobs.stop();
    release();
    await stopped;
    expect(await statusOf(first.id)).toBe("done");
    expect(await statusOf(second.id)).toBe("queued");
  });

  it("runs a job scheduled with a time-zone offset when it's due, not hours later", async () => {
    const jobs = new Jobs(db, log());
    let ran = false;
    jobs.handle("scheduled", async () => {
      ran = true;
    });
    // A minute ago, written as Malaysian time: as text it sorts 8 hours ahead of UTC.
    const job = await jobs.enqueue("scheduled", {}, { runAt: myt(-1 / 60) });
    await jobs.idle();
    expect(ran).toBe(true);
    expect((await jobs.get(job.id)).runAt).toMatch(/Z$/);
  });
});
