import type { FastifyPluginAsync } from "fastify";
import * as v from "valibot";

const Health = v.object({ ok: v.boolean() });

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
