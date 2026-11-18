import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import { NOT_FOUND_FILE } from "@laman/blocks";
import Fastify, { type FastifyReply, type FastifyServerOptions } from "fastify";
import { makeVariants, purgeDeletedMedia } from "./content/media.js";
import { seedIfEmpty } from "./content/seed.js";
import { type Db, now, openDatabase } from "./db/index.js";
import type { Env } from "./env.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { Jobs } from "./jobs.js";
import { type FeedFetcher, fetchFeed } from "./calendar/fetch.js";
import { sourcesDue } from "./calendar/sources.js";
import { syncCalendars } from "./calendar/sync.js";
import { audit } from "./auth/audit.js";
import { type AnalyticsDb, openAnalyticsDatabase } from "./analytics/db.js";
import { Collector } from "./analytics/collector.js";
import { readDoc } from "./content/site.js";
import { purgeDeleted } from "./content/history.js";
import type {
  BackupPayload,
  BackupUploadPayload,
  OffsiteFolder,
  PublishPayload,
} from "@laman/contracts";
import {
  backupDirOf,
  fileTime,
  importMediaFolders,
  listBackups,
  makeBackup,
  nextRun,
  retentionOf,
} from "./backup.js";
import {
  type Bucket,
  MediaStorage,
  PASSED,
  bundledConfig,
  type MediaStore,
  STORE_PATH,
} from "./media-store/index.js";
import { mirrorMedia } from "./offsite/mirror.js";
import { runPublish } from "./content/publishing.js";
import {
  describeError,
  folderFor,
  pruneRemote,
  readOffsite,
  storeConfig,
  storeFor,
  uploadArchive,
  verifyDue,
  verifyRemote,
} from "./offsite/index.js";
import type { RemoteStore, StoreConfig } from "./offsite/stores.js";
import { DAILY_REFRESH, showsEvents } from "./content/entries.js";
import { MANIFEST_DIR } from "./manifest.js";
import { ownPath } from "./paths.js";
import { REDIRECTS_FILE, pageFile } from "./publisher.js";
import { rendererClientDir } from "./render.js";
import { pruneAudit } from "./auth/audit.js";
import { useGuard } from "./auth/guard.js";
import { useSecurityHeaders } from "./headers.js";
import { purgeSessions } from "./auth/sessions.js";
import { seedSuperAdmin } from "./auth/users.js";
import { purgeConnections } from "./agents/connections.js";
import { agentRoutes } from "./routes/agents.js";
import { apiTokenRoutes } from "./routes/api-tokens.js";
import { analyticsRoutes, collectRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { backupRoutes } from "./routes/backups.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { calendarRoutes } from "./routes/calendar.js";
import { mcpRoutes } from "./routes/mcp.js";
import { oauthRoutes } from "./routes/oauth.js";
import { mediaRoutes } from "./routes/media.js";
import { mediaStorageRoutes } from "./routes/media-storage.js";
import { pageRoutes } from "./routes/pages.js";
import { renderRoutes } from "./routes/render.js";
import { preferenceRoutes } from "./routes/preferences.js";
import { siteRoutes } from "./routes/site.js";
import { summaryRoutes } from "./routes/summary.js";
import { userRoutes } from "./routes/users.js";
import { openApiTransform, useZod } from "./validation.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    jobs: Jobs;
    analytics: { db: AnalyticsDb; collector: Collector };
    /** BUILDER_URL: the address agents sign in against, when it's set. */
    builderUrl: string | undefined;
    /** Where the media library is: the bundled store, or the agency's own provider. */
    mediaStorage: MediaStorage;
  }
}

/** How often listings' calendar sources are read. */
export const CALENDAR_SYNC_MS = 30 * 60_000;
/** When, in Malaysia, the weekly check of the newest off-site copy may run: after the daily backup. */
const OFFSITE_CHECK = "04:30";

/** A storage service's error as the job's error, in words an ICT administrator can act on. */
const inWords = (error: unknown): never => {
  throw new Error(describeError(error), { cause: error });
};

export type AppOptions = {
  env: Env;
  /** Defaults to DATA_DIR/site.db. Tests pass ":memory:". */
  databasePath?: string;
  /** Defaults to DATA_DIR/analytics.db. */
  analyticsPath?: string;
  /** Work the job queue in the background. Tests turn it off and call `jobs.poke()`. */
  runJobs?: boolean;
  /** How calendar feeds are fetched; tests pass their own instead of the network. */
  fetchFeed?: FeedFetcher;
  /** Where off-site copies go; tests pass a store in memory instead of a bucket. */
  offsiteStore?: (config: StoreConfig) => RemoteStore;
  /** Waits between off-site upload tries; tests make them short. */
  offsiteRetryDelays?: number[];
  /** The bundled store's buckets: tests use their own. Installs always use laman-media and laman-published. */
  mediaBuckets?: Record<Bucket, string>;
};

function logger(env: Env): FastifyServerOptions["logger"] {
  if (env.NODE_ENV !== "development") return { level: env.LOG_LEVEL };
  return {
    level: env.LOG_LEVEL,
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  };
}

// Rsbuild and Astro fingerprint everything they put in these folders.
const immutable = (path: string) => /\/(static|_astro)\//.test(path);
const setHeaders = (reply: FastifyReply, path: string) => {
  reply.header(
    "cache-control",
    immutable(path) ? "public, max-age=31536000, immutable" : "no-cache",
  );
};

type RedirectMap = Record<string, { to: string; status: 301 | 302 }>;

/** The published site's redirects.json, read again whenever a publish replaces it. */
function redirectMap(publicDir: string) {
  const file = join(publicDir, REDIRECTS_FILE);
  let cached: { mtime: number; map: RedirectMap } = { mtime: -1, map: {} };
  return (): RedirectMap => {
    const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
    if (mtime !== cached.mtime)
      cached = { mtime, map: mtime ? (JSON.parse(readFileSync(file, "utf8")) as RedirectMap) : {} };
    return cached.map;
  };
}

/** Whether `file` is a file inside `root`, so a path can't climb out of it. */
function fileUnder(root: string, file: string) {
  const full = resolve(root, file);
  return full.startsWith(root + sep) && existsSync(full) && statSync(full).isFile();
}

/** An object from the store as the response: its status, headers and body. */
const sendObject = async (
  reply: FastifyReply,
  store: MediaStore,
  bucket: Bucket,
  key: string,
  headers: Record<string, string | string[] | undefined>,
) => {
  const object = await store.open(bucket, key, {
    range: headers.range as string | undefined,
    ifNoneMatch: headers["if-none-match"] as string | undefined,
  });
  if (!object) return notFoundHandler(reply.request, reply);
  return reply
    .status(object.status)
    .headers(object.headers)
    .send(object.body ?? "");
};

export async function buildApp(options: AppOptions) {
  const { env } = options;
  const dataDir = resolve(env.DATA_DIR);
  const publicDir = join(dataDir, "public");
  mkdirSync(publicDir, { recursive: true });

  // Behind the agency's proxy, the visitor's address is in X-Forwarded-For.
  const trust = env.TRUST_PROXY;
  const app = Fastify({
    logger: logger(env),
    trustProxy: typeof trust === "number" ? (_address: string, hop: number) => hop < trust : trust,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  if (env.NODE_ENV === "production" && trust === false)
    app.log.warn(
      "TRUST_PROXY isn't set. Behind an HTTPS proxy, set it to the proxy's address, or sign-in cookies won't be marked Secure and the audit log will show the proxy's address for everyone.",
    );
  else if (trust === true)
    app.log.warn(
      "TRUST_PROXY=true believes any client's X-Forwarded-For. Set it to your proxy's address instead, so nobody can fake their address in the audit log or get round the sign-in limits.",
    );

  const backupDir = backupDirOf(env);
  const keep = retentionOf(env);
  const schedule = env.BACKUP_SCHEDULE === "off" ? null : env.BACKUP_SCHEDULE;
  if (env.NODE_ENV === "production" && !env.BACKUP_DIR)
    app.log.warn(
      `BACKUP_DIR isn't set, so backups go to ${backupDir}, on the same disk as the site. Set it to a separate mount, and copy it off the machine.`,
    );

  const secretKey = env.BACKUP_SECRET_KEY;
  const makeStore = options.offsiteStore ?? storeFor;

  const databasePath = options.databasePath ?? join(dataDir, "site.db");
  // An upgrade backs up the database first, beside the daily backups, and
  // copies it off-site once the job queue is running.
  const upgradeArchives: string[] = [];
  const db = await openDatabase(databasePath, undefined, {
    beforeMigrate: async (snapshot) => {
      const made = await makeBackup({ dataDir, backupDir, keep, database: snapshot, dbOnly: true });
      upgradeArchives.push(basename(made.file));
      return made;
    },
  });
  const mediaStorage = new MediaStorage(db, bundledConfig(env, options.mediaBuckets), secretKey);
  // The bundled store's buckets, made on the first boot.
  await mediaStorage.bundled.ensureBuckets().catch((error: unknown) => {
    throw new Error(
      `The bundled media store at ${env.MEDIA_STORE_ENDPOINT} can't be reached or refused the keys (MEDIA_STORE_ACCESS_KEY_ID, MEDIA_STORE_SECRET_ACCESS_KEY): ${describeError(error)}`,
      { cause: error },
    );
  });
  /** The store in use, or null when its setup can't be opened (logged; media requests say why). */
  const media = await mediaStorage.current().catch((error: unknown) => {
    app.log.error({ err: error }, "the media storage can't be opened");
    return null;
  });
  await seedIfEmpty(db);
  await seedSuperAdmin(db, env);
  await purgeSessions(db);
  await purgeConnections(db);
  await pruneAudit(db);
  await purgeDeleted(db);
  if (media) await purgeDeletedMedia(db, media);
  const jobs = new Jobs(db, app.log);
  // Media kept in DATA_DIR before the media store: put in the store once, then set aside.
  const localMedia = ["media", "media-previous"].filter((folder) =>
    existsSync(join(dataDir, folder)),
  );
  if (media && localMedia.length) {
    const sent = await importMediaFolders(dataDir, media);
    const at = fileTime(now());
    for (const folder of localMedia)
      await rename(join(dataDir, folder), join(dataDir, `${folder}.moved-${at}`));
    // Published copies from then too: the published bucket has them now.
    await rm(join(publicDir, "media"), { recursive: true, force: true });
    app.log.warn(
      { sent, folders: localMedia },
      "media moved from DATA_DIR to the media store; the old folders are kept beside it, renamed, to delete once the site looks right",
    );
    await jobs.enqueue("publish", { trigger: "rebuild", full: true });
  }
  jobs.handle("publish", async (payload, job) => {
    const result = await runPublish(
      db,
      { dataDir, media: await mediaStorage.current(), siteUrl: env.SITE_URL },
      job.id,
      payload as PublishPayload,
    );
    app.log.info(result, "site published");
    return result;
  });
  jobs.handle("media.variants", async (payload) => {
    const { id } = payload as { id: string };
    return makeVariants(db, await mediaStorage.current(), id);
  });
  /** Timers that run something every day at a time in Malaysia, cleared on close. */
  const timers: { current?: NodeJS.Timeout }[] = [];
  function everyDayAt(time: string, run: () => void) {
    const timer: { current?: NodeJS.Timeout } = {};
    timers.push(timer);
    const arm = () => {
      // From a second on, so a timer that fires early can't pick the same time again.
      const next = Date.parse(nextRun(time, new Date(Date.now() + 1000)));
      timer.current = setTimeout(() => {
        run();
        arm();
      }, next - Date.now());
      timer.current.unref();
    };
    arm();
  }
  /**
   * The daily backup: a timer that queues a backup at BACKUP_SCHEDULE, not a
   * queued job, so it isn't in the job list to be cancelled. One missed while
   * the server was down (no full archive since the last scheduled time) is
   * queued at start.
   */
  const backUp = () =>
    jobs
      .enqueue("backup", { trigger: "scheduled" })
      .catch((error: unknown) => app.log.error({ err: error }, "couldn't queue the backup"));
  async function scheduleBackups(time: string) {
    const lastDue = Date.parse(nextRun(time)) - 86_400_000;
    const [newest] = (await listBackups(backupDir)).filter((backup) => !backup.dbOnly);
    if (!newest || Date.parse(newest.at) < lastDue) await backUp();
    everyDayAt(time, () => void backUp());
  }
  /**
   * Just after midnight in Malaysia, a site whose live pages change with the
   * date publishes again, so an event calendar's "today", upcoming events and
   * event order move on even when nothing else changes. Only the pages whose
   * render changed are written.
   */
  const publishDaily = () =>
    void showsEvents(db)
      .then((shows) => (shows ? jobs.enqueue("publish", { trigger: "daily" }) : undefined))
      .catch((error: unknown) => app.log.error({ err: error }, "couldn't queue the daily publish"));
  /**
   * Calendar sources: every half hour while any listing reads a calendar, and
   * once at start. A sync that changed events publishes them.
   */
  jobs.handle("calendar.sync", async () => {
    const counts = await syncCalendars(db, options.fetchFeed ?? fetchFeed);
    const changed = counts.created + counts.updated + counts.removed;
    if (changed) {
      await audit(db, {
        userId: null,
        action: "calendarSynced",
        detail: { created: counts.created, updated: counts.updated, removed: counts.removed },
      });
      await jobs.enqueue("publish", { trigger: "calendar" });
    }
    app.log.info(counts, "calendars synced");
    return counts;
  });
  /**
   * Queues a sync when a source is due (not read for nearly a half hour, so a
   * restart doesn't read every calendar again), unless one is already waiting.
   */
  const syncSoon = () =>
    void sourcesDue(db, CALENDAR_SYNC_MS - 60_000)
      .then((due) => (due ? jobs.enqueueOnce("calendar.sync") : undefined))
      .catch((error: unknown) => app.log.error({ err: error }, "couldn't queue the calendar sync"));
  /** Queues an archive's off-site copy, when copies are on. A failure to queue never fails the backup. */
  async function copyOffsite(file: string, folder: OffsiteFolder, trigger?: string) {
    try {
      if (!(await readOffsite(db)).enabled) return;
      const payload: BackupUploadPayload = { file: basename(file), folder, trigger };
      await jobs.enqueue("backup.upload", payload);
    } catch (error) {
      app.log.error({ err: error, file }, "couldn't queue the off-site copy");
    }
  }
  jobs.handle("backup", async (payload) => {
    const { trigger } = payload as BackupPayload;
    const backup = await makeBackup({
      dataDir,
      backupDir,
      keep,
      database: databasePath,
      media: () => mediaStorage.current(),
    });
    app.log.info({ file: backup.file, bytes: backup.bytes }, "backup made");
    await copyOffsite(backup.file, await folderFor(db, trigger), trigger);
    return { bytes: backup.bytes, deleted: backup.deleted.length };
  });
  /**
   * An archive's copy off-site, and, when the builder tidies up the bucket
   * itself, copies past their folder's age deleted after it.
   */
  jobs.handle("backup.upload", async (payload) => {
    const { file, folder } = payload as BackupUploadPayload;
    const stored = await readOffsite(db);
    if (!stored.enabled) return { skipped: 1 } as Record<string, number>;
    const store = makeStore(storeConfig(stored, secretKey));
    const copy = await uploadArchive({
      store,
      stored,
      secretKey,
      backupDir,
      file,
      folder,
      retryDelays: options.offsiteRetryDelays,
    }).catch(inWords);
    const deleted = stored.prune ? await pruneRemote(store, stored.prefix).catch(inWords) : [];
    app.log.info({ key: copy.key, bytes: copy.bytes, deleted: deleted.length }, "copied off-site");
    // The bundled store is on this server's disk: its media goes off-site after each backup.
    const library = await mediaStorage.current();
    const mirrored =
      library.kind === "bundled" && folder !== "upgrade"
        ? await mirrorMedia(library, store, stored.prefix).catch(inWords)
        : null;
    if (mirrored) app.log.info(mirrored, "media copied off-site");
    return {
      bytes: copy.bytes,
      deleted: deleted.length,
      ...(mirrored && { mediaSent: mirrored.sent, mediaBytes: mirrored.bytes }),
    };
  });
  /** The weekly check: the newest copy downloaded and opened as a restore would. */
  jobs.handle("backup.verify", async () => {
    const stored = await readOffsite(db);
    if (!stored.enabled) return { skipped: 1 } as Record<string, number>;
    const checked = await verifyRemote({
      store: makeStore(storeConfig(stored, secretKey)),
      stored,
      secretKey,
      scratch: dataDir,
    }).catch(inWords);
    app.log.info(checked, "off-site copy checked");
    return { bytes: checked.bytes };
  });
  const verifySoon = () =>
    void readOffsite(db)
      .then(async (stored) =>
        stored.enabled && (await verifyDue(db))
          ? jobs.enqueue("backup.verify", { trigger: "scheduled" })
          : undefined,
      )
      .catch((error: unknown) =>
        app.log.error({ err: error }, "couldn't queue the off-site check"),
      );
  const analyticsDb = await openAnalyticsDatabase(
    options.analyticsPath ?? join(dataDir, "analytics.db"),
  );
  const collector = new Collector(analyticsDb, {
    log: app.log,
    geoipPath: env.GEOIP_DB,
    siteHosts: env.SITE_URL ? [new URL(env.SITE_URL).hostname.toLowerCase()] : [],
    retentionDays: async () => (await readDoc(db, "settings", "published")).analytics.retentionDays,
  });
  app.decorate("db", db);
  app.decorate("builderUrl", env.BUILDER_URL);
  app.decorate("jobs", jobs);
  app.decorate("mediaStorage", mediaStorage);
  app.decorate("analytics", { db: analyticsDb, collector });
  if (options.runJobs ?? true)
    app.addHook("onReady", async () => {
      if (schedule) await scheduleBackups(schedule);
      for (const file of upgradeArchives.splice(0)) await copyOffsite(file, "upgrade", "upgrade");
      // Once a day, a check of the newest off-site copy if the last was a week ago.
      everyDayAt(OFFSITE_CHECK, verifySoon);
      everyDayAt(DAILY_REFRESH, publishDaily);
      const every = { current: setInterval(syncSoon, CALENDAR_SYNC_MS) as NodeJS.Timeout };
      every.current.unref();
      timers.push(every);
      await jobs.start();
      syncSoon();
    });
  app.addHook("onReady", () => collector.start());
  app.addHook("onClose", async () => {
    for (const timer of timers) clearTimeout(timer.current);
    await jobs.stop();
    await collector.stop();
    await db.destroy();
    await analyticsDb.destroy();
  });

  useZod(app);
  app.setErrorHandler(errorHandler);
  useGuard(app, db);
  useSecurityHeaders(app, () => mediaStorage.linkOrigin);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  if (env.CORS_ORIGIN)
    await app.register(cors, {
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    });

  await app.register(swagger, {
    openapi: { info: { title: "Laman API", version: "0.0.0" } },
    transform: openApiTransform,
  });

  await app.register(healthRoutes);
  // The API, its reference, the canvas and the admin: compressed as they go
  // out. Not the published site, which has its own .br and .gz copies: its
  // search index is gzip data, which @fastify/compress (9.3) passes through
  // unchanged but labels with the encoding the browser asked for.
  const adminDist = resolve(env.ADMIN_DIST);
  const hasAdmin = existsSync(adminDist);
  await app.register(async (builder) => {
    await builder.register(compress);
    await builder.register(authRoutes, { prefix: "/api" });
    await builder.register(userRoutes, { prefix: "/api" });
    await builder.register(apiTokenRoutes, { prefix: "/api" });
    await builder.register(pageRoutes, { prefix: "/api" });
    await builder.register(jobRoutes, { prefix: "/api" });
    await builder.register(calendarRoutes, { prefix: "/api" });
    await builder.register(backupRoutes, { prefix: "/api", secretKey, makeStore });
    const maxBytes = env.MEDIA_MAX_MB * 1024 * 1024;
    await builder.register(multipart, { limits: { fileSize: maxBytes + 1, files: 1 } });
    await builder.register(mediaRoutes, { prefix: "/api", maxBytes });
    await builder.register(mediaStorageRoutes, { prefix: "/api" });
    await builder.register(siteRoutes, { prefix: "/api" });
    await builder.register(preferenceRoutes, { prefix: "/api" });
    await builder.register(summaryRoutes, {
      prefix: "/api",
      siteUrl: env.SITE_URL,
      maxUploadBytes: maxBytes,
      dataDir,
      backup: { dir: backupDir, sameDisk: !env.BACKUP_DIR, schedule },
    });
    await builder.register(renderRoutes, { prefix: "/render", publicDir });
    await builder.register(analyticsRoutes, { prefix: "/api" });
    await builder.register(agentRoutes, { prefix: "/api" });
    await builder.register(oauthRoutes);
    await builder.register(mcpRoutes, { maxUploadBytes: maxBytes });
    if (hasAdmin)
      await builder.register(fastifyStatic, {
        root: adminDist,
        prefix: "/admin/",
        decorateReply: false,
        setHeaders,
      });
    builder.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
    await builder.register(scalar, {
      routePrefix: "/docs",
      configuration: { url: "/openapi.json" },
    });
  });
  await app.register(collectRoutes);

  // The renderer's CSS, fonts and scripts: the published copies first, which
  // is what visitors' pages were built with, then the builder's own, for the
  // canvas and preview.
  const builderAssets = join(rendererClientDir, "_astro");
  const publicAssets = join(publicDir, "_astro");

  // A published page names the CSS and scripts of the renderer that built
  // it; after an upgrade the builder's own have new names, so the page keeps
  // the copies published with it until it's published again.
  await app.register(async (assets) => {
    await assets.register(fastifyStatic, {
      root: publicAssets,
      serve: false,
      setHeaders,
      preCompressed: true,
    });
    assets.get<{ Params: { "*": string } }>(
      "/_astro/*",
      { config: { access: "public" }, schema: { hide: true } },
      (request, reply) => {
        const file = request.params["*"];
        return reply.sendFile(file, fileUnder(publicAssets, file) ? publicAssets : builderAssets);
      },
    );
  });

  // Published media: files live pages use, from the published bucket. On the
  // bundled store the builder serves them, so neither bucket is reachable
  // from outside; an agency's own provider has its own address (a CDN).
  app.get<{ Params: { "*": string } }>(
    "/media/*",
    { config: { access: "public" }, schema: { hide: true } },
    async (request, reply) => {
      const store = await mediaStorage.current();
      const path = `/media/${request.params["*"]}`;
      if (store.kind === "own") return reply.redirect(store.publicLink(path), 302);
      reply.header("cache-control", "no-cache");
      return sendObject(reply, store, "published", path.slice(1), request.headers);
    },
  );

  // The bundled store's presigned links, passed through as they are: the
  // store checks the signature and its expiry. Only its private bucket, and
  // only for a signed-in officer (the admin, the canvas and previews).
  app.get<{ Params: { "*": string } }>(
    `${STORE_PATH}/*`,
    { config: { access: "signedIn" }, schema: { hide: true } },
    async (request, reply) => {
      const store = await mediaStorage.current();
      const path = request.url.slice(STORE_PATH.length);
      if (store.kind !== "bundled" || !path.startsWith(`/${store.buckets.private}/`))
        return notFoundHandler(request, reply);
      const forward: Record<string, string> = {};
      for (const header of ["range", "if-none-match"] as const) {
        const value = request.headers[header];
        if (typeof value === "string") forward[header] = value;
      }
      const response = await fetch(new URL(path, env.MEDIA_STORE_ENDPOINT), { headers: forward });
      for (const header of PASSED) {
        const value = response.headers.get(header);
        if (value) reply.header(header, value);
      }
      // Each link is its own address and works for minutes: the browser may keep it that long.
      reply.header("cache-control", "private, max-age=300");
      reply.status(response.status);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        if (response.status === 304) return reply.send();
        // The store's XML error isn't for officers: an expired or wrong link is just refused.
        return reply
          .type("text/plain; charset=utf-8")
          .send(
            response.status === 403
              ? "This link has expired. Open the file again from the media library.\n"
              : "",
          );
      }
      return reply.send(Readable.fromWeb(response.body as WebReadableStream));
    },
  );

  // A real 301 or 302 before a redirect's HTML page, and one form of each
  // page's address: links, the sitemap and canonical links write "/berita", so
  // "/berita/" is sent there (the static plugin below serves "/berita" from
  // berita/index.html). docs/laman.md § Serving the site from a reverse proxy.
  const redirects = redirectMap(publicDir);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") return;
    const path = request.url.split("?")[0] ?? "/";
    if (ownPath.test(path)) return;
    const bare = path.replace(/(.)\/+$/, "$1");
    const redirect = redirects()[bare];
    if (redirect) return reply.redirect(redirect.to, redirect.status);
    if (bare !== path && fileUnder(publicDir, pageFile(bare)))
      return reply.redirect(bare + request.url.slice(path.length), 301);
  });

  // The published site, at the root. A reverse proxy can serve the same folder instead.
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    setHeaders,
    // Text files go out as the publisher's .br and .gz copies.
    preCompressed: true,
    // The publisher's manifest sits in the folder but isn't part of the site.
    allowedPath: (path) => path !== `/${MANIFEST_DIR}` && !path.startsWith(`/${MANIFEST_DIR}/`),
  });

  app.setNotFoundHandler((request, reply) => {
    // Nothing is published yet: the home page is the builder.
    if (request.url === "/" && !existsSync(join(publicDir, "index.html")))
      return reply.redirect("/admin/");
    const wantsHtml = request.method === "GET" && request.headers.accept?.includes("text/html");
    if (wantsHtml && hasAdmin && (request.url === "/admin" || request.url.startsWith("/admin/")))
      return reply.sendFile("index.html", adminDist);
    // An address the published site doesn't have: its own 404 page, for people.
    if (
      wantsHtml &&
      !ownPath.test(request.url.split("?")[0] ?? "/") &&
      existsSync(join(publicDir, NOT_FOUND_FILE))
    )
      return reply.status(404).sendFile(NOT_FOUND_FILE, publicDir);
    return notFoundHandler(request, reply);
  });

  return app;
}
