import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
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
import { runPublish } from "./content/publishing.js";
import { MANIFEST_DIR } from "./manifest.js";
import { REDIRECTS_FILE } from "./publisher.js";
import { rendererClientDir } from "./render.js";
import { analyticsRoutes, collectRoutes } from "./routes/analytics.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { mediaRoutes } from "./routes/media.js";
import { pageRoutes } from "./routes/pages.js";
import { renderRoutes } from "./routes/render.js";
import { preferenceRoutes } from "./routes/preferences.js";
import { siteRoutes } from "./routes/site.js";
import { summaryRoutes } from "./routes/summary.js";
import { openApiTransform, useZod } from "./validation.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    jobs: Jobs;
    analytics: { db: AnalyticsDb; collector: Collector };
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

/** Paths the server answers itself; everything else is the published site. */
const ownPath = /^\/(api|admin|render|_astro|media|docs|healthz|openapi\.json|_v)(\/|$)/;

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

  const db = await openDatabase(options.databasePath ?? join(dataDir, "site.db"));
  await seedIfEmpty(db);
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
  app.decorate("jobs", jobs);
  app.decorate("analytics", { db: analyticsDb, collector });
  if (options.runJobs ?? true) app.addHook("onReady", () => jobs.start());
  app.addHook("onReady", () => collector.start());
  app.addHook("onClose", async () => {
    await jobs.stop();
    await collector.stop();
    await db.destroy();
    await analyticsDb.destroy();
  });

  useZod(app);
  app.setErrorHandler(errorHandler);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  if (env.CORS_ORIGIN)
    await app.register(cors, {
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    });

  await app.register(swagger, {
    openapi: { info: { title: "Site Builder API", version: "0.0.0" } },
    transform: openApiTransform,
  });

  await app.register(healthRoutes);
  await app.register(pageRoutes, { prefix: "/api" });
  await app.register(jobRoutes, { prefix: "/api" });
  const maxBytes = env.MEDIA_MAX_MB * 1024 * 1024;
  await app.register(multipart, { limits: { fileSize: maxBytes + 1, files: 1 } });
  await app.register(mediaRoutes, { prefix: "/api", dataDir, maxBytes });
  await app.register(siteRoutes, { prefix: "/api" });
  await app.register(preferenceRoutes, { prefix: "/api" });
  await app.register(summaryRoutes, {
    prefix: "/api",
    siteUrl: env.SITE_URL,
    maxUploadBytes: maxBytes,
    dataDir,
  });
  await app.register(renderRoutes, { prefix: "/render", publicDir });
  await app.register(analyticsRoutes, { prefix: "/api" });
  await app.register(collectRoutes);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  await app.register(scalar, {
    routePrefix: "/docs",
    configuration: { url: "/openapi.json" },
  });

  // The renderer's CSS, fonts and scripts, for the canvas and preview. The
  // published site has its own copy.
  await app.register(fastifyStatic, {
    root: join(rendererClientDir, "_astro"),
    prefix: "/_astro/",
    decorateReply: false,
    setHeaders,
  });

  // The media library, for the canvas and preview. The published site has
  // copies of the files its pages use.
  const mediaDir = join(dataDir, "media");
  mkdirSync(mediaDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: mediaDir,
    prefix: "/media/",
    decorateReply: false,
    setHeaders,
  });

  const adminDist = resolve(env.ADMIN_DIST);
  const hasAdmin = existsSync(adminDist);
  if (hasAdmin)
    await app.register(fastifyStatic, {
      root: adminDist,
      prefix: "/admin/",
      decorateReply: false,
      setHeaders,
    });

  // A real 301 or 302 before the redirect's HTML page is served. A reverse
  // proxy can do the same from redirects.json.
  const redirects = redirectMap(publicDir);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") return;
    const path = request.url.split("?")[0] ?? "/";
    if (ownPath.test(path)) return;
    const redirect = redirects()[path.replace(/(.)\/+$/, "$1")];
    if (redirect) return reply.redirect(redirect.to, redirect.status);
  });

  // The published site, at the root. A reverse proxy can serve the same folder instead.
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    setHeaders,
    redirect: true,
    // The publisher's manifest sits in the folder but isn't part of the site.
    allowedPath: (path) => path !== `/${MANIFEST_DIR}` && !path.startsWith(`/${MANIFEST_DIR}/`),
  });

  app.setNotFoundHandler((request, reply) => {
    // Nothing is published yet: the home page is the builder.
    if (request.url === "/" && !existsSync(join(publicDir, "index.html")))
      return reply.redirect("/admin/");
    const wantsAdmin =
      hasAdmin &&
      request.method === "GET" &&
      (request.url === "/admin" || request.url.startsWith("/admin/")) &&
      request.headers.accept?.includes("text/html");
    return wantsAdmin ? reply.sendFile("index.html", adminDist) : notFoundHandler(request, reply);
  });

  return app;
}
