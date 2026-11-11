/**
 * A listing's calendar sources. Adding one makes the server fetch an address
 * an admin typed, so changing them is `site.manage`; seeing them and syncing
 * now are for anyone who can publish.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { audited } from "../auth/guard.js";
import {
  CalendarSource,
  CalendarSourceParams,
  Job,
  PageParams,
  SaveCalendarSourceBody,
  envelope,
} from "../contract.js";
import {
  acceptDrop,
  addSource,
  deleteSource,
  listSources,
  saveSource,
} from "../calendar/sources.js";

type SourceParams = z.infer<typeof CalendarSourceParams>;
type Body = z.infer<typeof SaveCalendarSourceBody>;

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  const { db, jobs } = app;
  const syncNow = () => jobs.enqueueOnce("calendar.sync");
  /** Audits a change to a listing's sources and syncs, so its events follow at once. */
  const changed = async (
    request: FastifyRequest,
    listingId: string,
    change: "added" | "changed" | "removed",
    name: string,
  ) => {
    audited(request, {
      action: "calendarSourceChanged",
      target: listingId,
      detail: { change, name },
    });
    await syncNow();
  };

  app.get<{ Params: z.infer<typeof PageParams> }>(
    "/pages/:id/calendar-sources",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "List a listing's calendar sources",
        description:
          "In the listing's order: the first source a shared meeting is found in owns it.",
        tags: ["calendars"],
        params: PageParams,
        response: { 200: envelope(z.array(CalendarSource)) },
      },
    },
    async (request) => ({ data: await listSources(db, request.params.id) }),
  );

  app.post<{ Params: z.infer<typeof PageParams>; Body: Body }>(
    "/pages/:id/calendar-sources",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Add a calendar source",
        description:
          "An ICS address (`https://` or `webcal://`) on a public host. A sync is queued, so its events arrive within moments.",
        tags: ["calendars"],
        params: PageParams,
        body: SaveCalendarSourceBody,
        response: { 201: envelope(CalendarSource) },
      },
    },
    async (request, reply) => {
      const source = await addSource(db, request.params.id, request.body);
      await changed(request, request.params.id, "added", source.name);
      return reply.status(201).send({ data: source });
    },
  );

  app.put<{ Params: SourceParams; Body: Body }>(
    "/calendar-sources/:sourceId",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Change a calendar source",
        description: "Leave `address` out to keep the stored one.",
        tags: ["calendars"],
        params: CalendarSourceParams,
        body: SaveCalendarSourceBody,
        response: { 200: envelope(CalendarSource) },
      },
    },
    async (request) => {
      const source = await saveSource(db, request.params.sourceId, request.body);
      await changed(request, source.listingId, "changed", source.name);
      return { data: source };
    },
  );

  app.delete<{ Params: SourceParams }>(
    "/calendar-sources/:sourceId",
    {
      config: { access: "site.manage" },
      schema: {
        summary: "Remove a calendar source",
        description: "The next sync takes off the site the events only it had.",
        tags: ["calendars"],
        params: CalendarSourceParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const row = await deleteSource(db, request.params.sourceId);
      await changed(request, row.listing_id, "removed", row.name);
      return reply.status(204).send();
    },
  );

  app.post<{ Params: SourceParams }>(
    "/calendar-sources/:sourceId/accept",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Accept a held drop",
        description:
          "The last read found far fewer events than before, so they were kept. This lets a sync, queued now, take them off.",
        tags: ["calendars"],
        params: CalendarSourceParams,
        response: { 202: envelope(Job) },
      },
    },
    async (request, reply) => {
      await acceptDrop(db, request.params.sourceId);
      return reply.status(202).send({ data: await syncNow() });
    },
  );

  app.post(
    "/calendar-sources/sync",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Sync calendars now",
        description:
          "Reads every listing's calendar sources; a sync that changed events publishes.",
        tags: ["calendars"],
        response: { 202: envelope(Job) },
      },
    },
    async (_request, reply) => reply.status(202).send({ data: await syncNow() }),
  );
};
