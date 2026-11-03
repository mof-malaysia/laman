import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import { NOT_FOUND_FILE } from "@fiscal-sb/blocks";
import Fastify, { type FastifyReply, type FastifyServerOptions } from "fastify";
import { makeVariants, purgeDeletedMedia } from "./content/media.js";
import { seedIfEmpty } from "./content/seed.js";
import { type Db, openDatabase } from "./db/index.js";
import type { Env } from "./env.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { Jobs } from "./jobs.js";
import { type AnalyticsDb, openAnalyticsDatabase } from "./analytics/db.js";
import { Collector } from "./analytics/collector.js";
import { readDoc } from "./content/site.js";
import { purgeDeleted } from "./content/history.js";
import type { PublishPayload } from "@fiscal-sb/contracts";
import { backupDirOf, listBackups, makeBackup, nextRun, retentionOf } from "./backup.js";
import { runPublish } from "./content/publishing.js";
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
import { analyticsRoutes, collectRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { backupRoutes } from "./routes/backups.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { mcpRoutes } from "./routes/mcp.js";
import { oauthRoutes } from "./routes/oauth.js";
import { mediaRoutes } from "./routes/media.js";
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
  }
}

export type AppOptions = {
  env: Env;
  /** Defaults to DATA_DIR/site.db. Tests pass ":memory:". */
  databasePath?: string;
  /** Defaults to DATA_DIR/analytics.db. */
  analyticsPath?: string;
  /** Work the job queue in the background. Tests turn it off and call `jobs.poke()`. */
  runJobs?: boolean;
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

  const databasePath = options.databasePath ?? join(dataDir, "site.db");
  // An upgrade backs up the database first, beside the daily backups.
  const db = await openDatabase(databasePath, undefined, {
    beforeMigrate: (snapshot) =>
      makeBackup({ dataDir, backupDir, keep, database: snapshot, dbOnly: true }),
  });
  await seedIfEmpty(db);
  await seedSuperAdmin(db, env);
  await purgeSessions(db);
  await purgeConnections(db);
  await pruneAudit(db);
  await purgeDeleted(db);
  await purgeDeletedMedia(db, dataDir);
  const jobs = new Jobs(db, app.log);
  jobs.handle("publish", async (payload, job) => {
    const result = await runPublish(
      db,
      { dataDir, siteUrl: env.SITE_URL },
      job.id,
      payload as PublishPayload,
    );
    app.log.info(result, "site published");
    return result;
  });
  jobs.handle("media.variants", async (payload) => {
    const { id } = payload as { id: string };
    return makeVariants(db, dataDir, id);
  });
  /**
   * The daily backup: a timer that queues a backup at BACKUP_SCHEDULE, not a
   * queued job, so it isn't in the job list to be cancelled. One missed while
   * the server was down (no full archive since the last scheduled time) is
   * queued at start.
   */
  let backupTimer: NodeJS.Timeout | undefined;
  const backUp = () =>
    jobs
      .enqueue("backup", { trigger: "scheduled" })
      .catch((error: unknown) => app.log.error({ err: error }, "couldn't queue the backup"));
  async function scheduleBackups(time: string) {
    const lastDue = Date.parse(nextRun(time)) - 86_400_000;
    const [newest] = (await listBackups(backupDir)).filter((backup) => !backup.dbOnly);
    if (!newest || Date.parse(newest.at) < lastDue) await backUp();
    const arm = () => {
      // From a second on, so a timer that fires early can't pick the same time again.
      const next = Date.parse(nextRun(time, new Date(Date.now() + 1000)));
      backupTimer = setTimeout(() => {
        void backUp();
        arm();
      }, next - Date.now());
      backupTimer.unref();
    };
    arm();
  }
  jobs.handle("backup", async () => {
    const backup = await makeBackup({ dataDir, backupDir, keep, database: databasePath });
    app.log.info({ file: backup.file, bytes: backup.bytes }, "backup made");
    return { bytes: backup.bytes, deleted: backup.deleted.length };
  });
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
  app.decorate("analytics", { db: analyticsDb, collector });
  if (options.runJobs ?? true)
    app.addHook("onReady", async () => {
      if (schedule) await scheduleBackups(schedule);
      await jobs.start();
    });
  app.addHook("onReady", () => collector.start());
  app.addHook("onClose", async () => {
    clearTimeout(backupTimer);
    await jobs.stop();
    await collector.stop();
    await db.destroy();
    await analyticsDb.destroy();
  });

  useZod(app);
  app.setErrorHandler(errorHandler);
  useGuard(app, db);
  useSecurityHeaders(app);
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
    await builder.register(pageRoutes, { prefix: "/api" });
    await builder.register(jobRoutes, { prefix: "/api" });
    await builder.register(backupRoutes, { prefix: "/api" });
    const maxBytes = env.MEDIA_MAX_MB * 1024 * 1024;
    await builder.register(multipart, { limits: { fileSize: maxBytes + 1, files: 1 } });
    await builder.register(mediaRoutes, { prefix: "/api", dataDir, maxBytes });
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

  // The renderer's CSS, fonts and scripts, and media files: the published
  // copies first, which is what visitors' pages were built with, then the
  // builder's own, for the canvas and preview.
  const mediaDir = join(dataDir, "media");
  mkdirSync(mediaDir, { recursive: true });
  const publicMedia = join(publicDir, "media");
  const builderAssets = join(rendererClientDir, "_astro");
  const publicAssets = join(publicDir, "_astro");

  // Each with its own file server: `preCompressed` is per registration, and
  // the media library has no .br or .gz copies to look for.

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

  // The whole library for a signed-in officer (the canvas and preview);
  // for anyone else, only the files published pages use.
  await app.register(async (media) => {
    await media.register(fastifyStatic, { root: publicMedia, serve: false, setHeaders });
    media.get<{ Params: { "*": string } }>(
      "/media/*",
      { config: { access: "public" }, schema: { hide: true } },
      (request, reply) => {
        const signedIn = request.auth?.session.stage === "full";
        return reply.sendFile(request.params["*"], signedIn ? mediaDir : publicMedia);
      },
    );
  });

  // A real 301 or 302 before a redirect's HTML page, and one form of each
  // page's address: links, the sitemap and canonical links write "/berita", so
  // "/berita/" is sent there (the static plugin below serves "/berita" from
  // berita/index.html). docs/site-builder.md § Serving the site from a reverse proxy.
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
