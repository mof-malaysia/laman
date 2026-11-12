/**
 * Backups from the admin: a backup now, how the last one went, and where
 * copies go off-site. Restore is command-line only.
 */
import type { FastifyPluginAsync } from "fastify";
import { audited } from "../auth/guard.js";
import { listBackups, nextRun } from "../backup.js";
import {
  Job,
  OffsiteSettings,
  OffsiteSettingsSave,
  OffsiteTestResult,
  type Summary,
  envelope,
} from "../contract.js";
import type { Db } from "../db/index.js";
import { HttpError } from "../errors.js";
import {
  changedFields,
  mergeSave,
  offsiteStatus,
  readOffsite,
  saveOffsite,
  storeConfig,
  testConnection,
  viewOf,
} from "../offsite/index.js";
import type { RemoteStore, StoreConfig } from "../offsite/stores.js";

export type BackupOptions = { dir: string; sameDisk: boolean; schedule: string | null };

/** The daily backup should have run twice by then. */
const STALE_MS = 2 * 24 * 3600_000;

/**
 * The newest full archive, a failure since, and whether one is on its way: for
 * the summary. Database-only archives (made before upgrades) are listed but
 * don't count as backed up, since they leave the media out.
 */
export async function backupStatus(db: Db, options: BackupOptions): Promise<Summary["backup"]> {
  const archives = await listBackups(options.dir);
  const newest = archives.find((archive) => !archive.dbOnly);
  const [failed, running, offsite] = await Promise.all([
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
    readOffsite(db).then((stored) => offsiteStatus(db, stored)),
  ]);
  return {
    ...options,
    next: options.schedule ? nextRun(options.schedule) : null,
    last: newest ?? null,
    archives,
    stale: Boolean(newest && Date.now() - Date.parse(newest.at) > STALE_MS),
    failed: failed ? { at: failed.finished_at!, error: failed.error ?? "" } : null,
    running: Boolean(running),
    offsite,
  };
}

const tags = ["backups"];

export const backupRoutes: FastifyPluginAsync<{
  /** BACKUP_SECRET_KEY: seals the saved secrets. */
  secretKey: string | undefined;
  makeStore: (config: StoreConfig) => RemoteStore;
}> = async (app, { secretKey, makeStore }) => {
  const { db } = app;

  app.post(
    "/backups",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Back up now",
        description:
          "Queues a backup of the database and media to BACKUP_DIR, as the daily one makes, and its off-site copy when those are on. `GET /summary` shows when it's done.",
        tags,
        response: { 202: envelope(Job) },
      },
    },
    async (request, reply) => {
      const job = await app.jobs.enqueue("backup", { trigger: "manual" });
      audited(request, { action: "backupStarted", target: job.id });
      return reply.status(202).send({ data: job });
    },
  );

  app.get(
    "/backups/offsite",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "The off-site copy settings",
        description:
          "Where archives are copied off the server. The secret key and the passphrase are never returned: only whether they're saved.",
        tags,
        response: { 200: envelope(OffsiteSettings) },
      },
    },
    async () => ({ data: viewOf(await readOffsite(db), secretKey) }),
  );

  app.put<{ Body: OffsiteSettingsSave }>(
    "/backups/offsite",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Save the off-site copy settings",
        description:
          "They apply to the next backup. Leave `secret` or `passphrase` out to keep the saved one. Needs BACKUP_SECRET_KEY on the server, which seals them.",
        tags,
        body: OffsiteSettingsSave,
        response: { 200: envelope(OffsiteSettings) },
      },
    },
    async (request) => {
      if (!secretKey)
        throw new HttpError(
          409,
          "backup_secret_key_missing",
          "Set BACKUP_SECRET_KEY on the server before setting up off-site copies.",
        );
      const before = await readOffsite(db);
      const next = mergeSave(before, request.body, secretKey);
      await saveOffsite(db, next);
      const changed = changedFields(before, request.body);
      if (changed.length)
        audited(request, {
          action: "offsiteChanged",
          detail: {
            changed,
            enabled: next.enabled,
            provider: next.provider,
            bucket: next.bucket,
            encrypt: next.encrypt,
            prune: next.prune,
          },
        });
      return { data: viewOf(next, secretKey) };
    },
  );

  app.post<{ Body: OffsiteSettingsSave }>(
    "/backups/offsite/test",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Test the off-site connection",
        description:
          "With the settings given (saved or not; a left-out `secret` uses the saved one): writes a small file at the top of the prefix, reads it back, lists, and tries to delete it. Keys that can't delete pass, and are the safer kind.",
        tags,
        body: OffsiteSettingsSave,
        response: { 200: envelope(OffsiteTestResult) },
      },
    },
    async (request) => {
      const stored = await readOffsite(db);
      const config = storeConfig(stored, secretKey, request.body);
      const result = await testConnection(makeStore(config), request.body.prefix);
      audited(request, {
        action: "offsiteTested",
        detail: {
          provider: request.body.provider,
          bucket: request.body.bucket,
          ok: result.ok,
          canDelete: result.canDelete,
        },
      });
      return { data: result };
    },
  );

  app.post(
    "/backups/offsite/verify",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Check the newest off-site copy now",
        description:
          "Queues the check that runs weekly: the newest full copy is downloaded, decrypted when it's encrypted, and opened as a restore would.",
        tags,
        response: { 202: envelope(Job) },
      },
    },
    async (_request, reply) => {
      if (!(await readOffsite(db)).enabled)
        throw new HttpError(409, "offsite_off", "Off-site copies aren't set up.");
      const job = await app.jobs.enqueueOnce("backup.verify", { trigger: "manual" });
      return reply.status(202).send({ data: job });
    },
  );
};
