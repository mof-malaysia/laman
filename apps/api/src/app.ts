import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Env } from "./env.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { healthRoutes } from "./routes/health.js";
import { helloRoutes } from "./routes/hello.js";
import { openApiTransform, useValibot } from "./validation.js";

export type AppOptions = {
  env: Env;
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

export async function buildApp(options: AppOptions) {
  const { env } = options;
  const app = Fastify({
    logger: logger(env),
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  useValibot(app);
  app.setErrorHandler(errorHandler);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  if (env.CORS_ORIGIN)
    await app.register(cors, {
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    });

  await app.register(swagger, {
    openapi: { info: { title: "Fiscal Sb API", version: "0.0.0" } },
    transform: openApiTransform,
  });

  await app.register(healthRoutes);
  await app.register(helloRoutes, { prefix: "/v1" });

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  await app.register(scalar, {
    routePrefix: "/docs",
    configuration: { url: "/openapi.json" },
  });

  // In the Docker image the api also serves the SPA, so the app is one origin.
  if (env.WEB_DIST && existsSync(env.WEB_DIST)) {
    await app.register(fastifyStatic, {
      root: env.WEB_DIST,
      // Rsbuild fingerprints everything under static/; index.html must revalidate.
      setHeaders: (reply, path) =>
        reply.header(
          "cache-control",
          path.includes("/static/") ? "public, max-age=31536000, immutable" : "no-cache",
        ),
    });
    app.setNotFoundHandler((request, reply) => {
      const wantsPage =
        request.method === "GET" &&
        !request.url.startsWith("/v1/") &&
        request.headers.accept?.includes("text/html");
      return wantsPage ? reply.sendFile("index.html") : notFoundHandler(request, reply);
    });
  } else {
    app.setNotFoundHandler(notFoundHandler);
  }

  return app;
}
