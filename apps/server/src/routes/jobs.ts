import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Job, JobDetail, JobList, JobParams, JobsQuery, envelope } from "../contract.js";

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: z.infer<typeof JobsQuery> }>(
    "/jobs",
    {
      schema: {
        summary: "List jobs",
        description:
          "The job log, newest first, or with `scheduled` the scheduled jobs still to run, soonest first.",
        tags: ["jobs"],
        querystring: JobsQuery,
        response: { 200: envelope(JobList) },
      },
    },
    async (request) => ({ data: await app.jobs.list(request.query) }),
  );

  app.get<{ Params: { id: string } }>(
    "/jobs/:id",
    {
      schema: {
        summary: "Get a job",
        description:
          "With a publish's log: what happened to each page, and the block that failed if one did.",
        tags: ["jobs"],
        params: JobParams,
        response: { 200: envelope(JobDetail) },
      },
    },
    async (request) => ({ data: await app.jobs.detail(request.params.id) }),
  );

  app.delete<{ Params: { id: string } }>(
    "/jobs/:id",
    {
      schema: {
        summary: "Cancel a job",
        description: "Only a job that hasn't started, such as a scheduled publish.",
        tags: ["jobs"],
        params: JobParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await app.jobs.cancel(request.params.id);
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/jobs/:id/retry",
    {
      schema: {
        summary: "Retry a failed job",
        tags: ["jobs"],
        params: JobParams,
        response: { 202: envelope(Job) },
      },
    },
    async (request, reply) =>
      reply.status(202).send({ data: await app.jobs.retry(request.params.id) }),
  );
};
