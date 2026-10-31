import type { FastifyPluginAsync } from "fastify";
import { Greeting, HelloQuery, envelope } from "../contract.js";

/** An example resource; replace it with your own. */
export const helloRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: HelloQuery }>(
    "/hello",
    {
      schema: {
        summary: "Say hello",
        tags: ["examples"],
        querystring: HelloQuery,
        response: { 200: envelope(Greeting) },
      },
    },
    async (request) => ({
      data: { message: `Hello, ${request.query.name ?? "world"}!` },
    }),
  );
};
