/** The signed-in person's admin preferences. */
import type { AdminPreferences as Preferences } from "@laman/contracts";
import type { FastifyPluginAsync } from "fastify";
import { AdminPreferences, envelope } from "../contract.js";
import { userOf } from "../auth/guard.js";
import { preferencesOf, savePreferences } from "../content/preferences.js";

export const preferenceRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get(
    "/preferences",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get your admin preferences",
        description: "Your admin language. Each person has their own.",
        tags: ["preferences"],
        response: { 200: envelope(AdminPreferences) },
      },
    },
    async (request) => ({ data: preferencesOf(userOf(request)) }),
  );

  app.put<{ Body: Preferences }>(
    "/preferences",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Save your admin preferences",
        description: "They apply on save; nothing is published.",
        tags: ["preferences"],
        body: AdminPreferences,
        response: { 200: envelope(AdminPreferences) },
      },
    },
    async (request) => ({ data: await savePreferences(db, userOf(request).id, request.body) }),
  );
};
