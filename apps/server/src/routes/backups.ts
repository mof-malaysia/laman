/** Backups from the admin: a backup now, and how the last one went. Restore is command-line only. */
import type { FastifyPluginAsync } from "fastify";
import { audited } from "../auth/guard.js";
import { listBackups } from "../backup.js";
import { Job, type Summary, envelope } from "../contract.js";
import type { Db } from "../db/index.js";

export type BackupOptions = { dir: string; sameDisk: boolean; schedule: string | null };

/** The daily backup should have run twice by then. */
const STALE_MS = 2 * 24 * 3600_000;

/** The newest archive, a failure since, and whether one is on its way: for the summary. */
export async function backupStatus(db: Db, options: BackupOptions): Promise<Summary["backup"]> {
  const [newest] = await listBackups(options.dir);
  const [failed, running] = await Promise.all([
    db
      .selectFrom("jobs")
      .select(["finished_at", "error"])
      .where("kind", "=", "backup")
      .where("status", "=", "failed")
      .where("finished_at", ">", newest?.at ?? "")
      .orderBy("finished_at", "desc")
      .executeTakeFirst(),
    db
      .selectFrom("jobs")
      .select("id")
      .where("kind", "=", "backup")
      .where("status", "in", ["queued", "running"])
      .executeTakeFirst(),
  ]);
  return {
    ...options,
    last: newest ? { at: newest.at, bytes: newest.bytes, dbOnly: newest.dbOnly } : null,
    stale: Boolean(options.schedule && newest && Date.now() - Date.parse(newest.at) > STALE_MS),
    failed: failed ? { at: failed.finished_at!, error: failed.error ?? "" } : null,
    running: Boolean(running),
  };
}

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/backups",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Back up now",
        description:
          "Queues a backup of the database and media to BACKUP_DIR, as the daily one makes. `GET /summary` shows when it's done.",
        tags: ["backups"],
        response: { 202: envelope(Job) },
      },
    },
    async (request, reply) => {
      const job = await app.jobs.enqueue("backup", { trigger: "manual" });
      audited(request, { action: "backupStarted", target: job.id });
      return reply.status(202).send({ data: job });
    },
  );
};
