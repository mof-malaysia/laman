import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const Health = z.object({ ok: z.boolean() });

/** Ready check for load balancers. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/healthz",
    {
      schema: {
        summary: "Ready check",
        tags: ["health"],
        response: { 200: Health },
      },
    },
    async () => ({ ok: true }),
  );
};
