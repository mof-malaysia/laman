/**
 * The admin preferences: one set for the whole site until there are users,
 * then each user's own.
 */
import type { AdminPreferences as Preferences } from "@fiscal-sb/contracts";
import type { FastifyPluginAsync } from "fastify";
import { AdminPreferences, envelope } from "../contract.js";
import { getPreferences, savePreferences } from "../content/preferences.js";

export const preferenceRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get(
    "/preferences",
    {
      schema: {
        summary: "Get the admin preferences",
        description: "The admin's language. They apply to everyone using the admin.",
        tags: ["preferences"],
        response: { 200: envelope(AdminPreferences) },
      },
    },
    async () => ({ data: await getPreferences(db) }),
  );

  app.put<{ Body: Preferences }>(
    "/preferences",
    {
      schema: {
        summary: "Save the admin preferences",
        description: "They apply on save; nothing is published.",
        tags: ["preferences"],
        body: AdminPreferences,
        response: { 200: envelope(AdminPreferences) },
      },
    },
    async (request) => ({ data: await savePreferences(db, request.body) }),
  );
};
