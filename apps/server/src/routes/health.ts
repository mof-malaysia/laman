import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const Health = z.object({ ok: z.boolean() });

/** Ready check for load balancers and Docker's health check. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/healthz",
    {
      // Asked every 30 seconds by Docker, so only failures are logged.
      logLevel: "warn",
      config: { access: "public" },
      schema: {
        summary: "Ready check",
        tags: ["health"],
        response: { 200: Health },
      },
    },
    async () => ({ ok: true }),
  );
};
