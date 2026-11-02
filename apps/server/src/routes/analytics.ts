/**
 * Analytics: `/_v`, where the published site's beacon posts, and the reports
 * under `/api/analytics`. See docs/analytics.md.
 */
import type { FastifyPluginAsync } from "fastify";
import type { z } from "zod";
import { breakdown, since, summary } from "../analytics/reports.js";
import { readDoc } from "../content/site.js";
import {
  AnalyticsQuery,
  AnalyticsStatus,
  AnalyticsSummary,
  Beacon,
  BreakdownList,
  BreakdownQuery,
  envelope,
} from "../contract.js";

/** The beacon. Always 204, so a page (or anyone else) learns nothing from it. */
export const collectRoutes: FastifyPluginAsync = async (app) => {
  app.post("/_v", { bodyLimit: 4096, schema: { hide: true } }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    const { collector } = app.analytics;
    const visitor = {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? "",
      host: request.hostname.toLowerCase(),
      gpc: request.headers["sec-gpc"] === "1",
    };
    const origin = request.headers.origin ?? request.headers.referer;
    if (!collector.allowed(visitor, origin)) return reply.code(204).send();
    let body: unknown = request.body;
    if (typeof body === "string")
      try {
        body = JSON.parse(body);
      } catch {
        return reply.code(204).send();
      }
    const beacon = Beacon.safeParse(body);
    if (beacon.success) await collector.accept(beacon.data, visitor);
    return reply.code(204).send();
  });
};

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const tags = ["analytics"];

  app.get<{ Querystring: z.infer<typeof AnalyticsQuery> }>(
    "/analytics/summary",
    {
      schema: {
        summary: "Analytics totals and series",
        description:
          "Views, visitors, visits, bounce rate and duration for a range of local days and the same length before it, a series by hour, day or month, and the publishes in the range. With `pageId`, for one page.",
        tags,
        querystring: AnalyticsQuery,
        response: { 200: envelope(AnalyticsSummary) },
      },
    },
    async (request) => {
      await app.analytics.collector.flush();
      return { data: await summary(app.analytics.db, db, request.query) };
    },
  );

  app.get<{ Querystring: z.infer<typeof BreakdownQuery> }>(
    "/analytics/breakdown",
    {
      schema: {
        summary: "Analytics top list",
        description:
          "The top pages, entry or exit pages, referrers, campaigns, browsers, systems, devices, screens, languages, countries, downloads or outbound links in a range.",
        tags,
        querystring: BreakdownQuery,
        response: { 200: envelope(BreakdownList) },
      },
    },
    async (request) => {
      await app.analytics.collector.flush();
      return { data: await breakdown(app.analytics.db, db, request.query) };
    },
  );

  app.get(
    "/analytics/status",
    {
      schema: {
        summary: "Analytics status",
        description:
          "Whether counting is on, whether countries can be told, the oldest day held and the server's time zone, so an empty report can say why and days are counted where the server counts them.",
        tags,
        response: { 200: envelope(AnalyticsStatus) },
      },
    },
    async () => {
      await app.analytics.collector.flush();
      const [settings, oldest] = await Promise.all([
        readDoc(db, "settings", "published"),
        since(app.analytics.db),
      ]);
      return {
        data: {
          on: settings.analytics.on,
          countries: app.analytics.collector.countries,
          since: oldest,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };
    },
  );
};
