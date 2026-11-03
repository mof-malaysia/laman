/** The media library: upload, list, describe, replace (and undo it), delete and restore files. */
import { createReadStream } from "node:fs";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  MediaDetail,
  MediaList,
  MediaParams,
  MediaQuery,
  UpdateMediaBody,
  envelope,
} from "../contract.js";
import {
  createMedia,
  deleteMedia,
  getMedia,
  listMedia,
  previousFile,
  purgeDeletedMedia,
  replaceMedia,
  restoreMedia,
  restorePrevious,
  updateMedia,
} from "../content/media.js";
import { HttpError } from "../errors.js";

type Params = z.infer<typeof MediaParams>;

/** The one file in a multipart request, read into memory (files are capped by MEDIA_MAX_MB). */
async function readUpload(request: FastifyRequest) {
  const file = await request.file();
  if (!file) throw new HttpError(400, "file_missing", "Choose a file to upload");
  const bytes = await file.toBuffer().catch((error: { code?: string }) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE")
      throw new HttpError(413, "file_too_large", "The file is too large");
    throw error;
  });
  return { filename: file.filename, bytes };
}

export const mediaRoutes: FastifyPluginAsync<{ dataDir: string; maxBytes: number }> = async (
  app,
  { dataDir, maxBytes },
) => {
  const { db, jobs } = app;
  const multipart = {
    summary: "",
    tags: ["media"],
    consumes: ["multipart/form-data"],
  };

  app.get<{ Querystring: z.infer<typeof MediaQuery> }>(
    "/media",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "List media",
        description:
          "Newest first, with search and filters by kind, unused files and images that need alt text. `deleted=true` lists Recently deleted instead.",
        tags: ["media"],
        querystring: MediaQuery,
        response: { 200: envelope(MediaList) },
      },
    },
    async (request) => {
      if (request.query.deleted) await purgeDeletedMedia(db, dataDir);
      return { data: await listMedia(db, request.query) };
    },
  );

  app.post(
    "/media",
    {
      config: { access: "content.edit" },
      schema: {
        ...multipart,
        summary: "Upload a file",
        description:
          "One file as multipart/form-data: JPEG, PNG, WebP, SVG (sanitised) or PDF, up to MEDIA_MAX_MB. Images get narrower copies from a job.",
        response: { 201: envelope(MediaDetail) },
      },
    },
    async (request, reply) => {
      const { media, needsVariants } = await createMedia(
        db,
        dataDir,
        await readUpload(request),
        maxBytes,
      );
      if (needsVariants) await jobs.enqueue("media.variants", { id: media.id });
      return reply.status(201).send({ data: media });
    },
  );

  app.get<{ Params: Params }>(
    "/media/:id",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Get a file and where it's used",
        tags: ["media"],
        params: MediaParams,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => ({ data: await getMedia(db, request.params.id) }),
  );

  app.patch<{ Params: Params; Body: UpdateMediaBody }>(
    "/media/:id",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Change a file's alt text (or mark it decorative), caption or credit",
        tags: ["media"],
        params: MediaParams,
        body: UpdateMediaBody,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => ({ data: await updateMedia(db, request.params.id, request.body) }),
  );

  app.put<{ Params: Params }>(
    "/media/:id/file",
    {
      config: { access: "content.publish" },
      schema: {
        ...multipart,
        summary: "Replace a file",
        description:
          "Keeps the id, so every page that uses it shows the new file: drafts at once, the live site at the next publish. The file before it is kept for `POST /media/{id}/previous`.",
        params: MediaParams,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => {
      const { media, needsVariants } = await replaceMedia(
        db,
        dataDir,
        request.params.id,
        await readUpload(request),
        maxBytes,
      );
      if (needsVariants) await jobs.enqueue("media.variants", { id: media.id });
      return { data: media };
    },
  );

  app.get<{ Params: Params }>(
    "/media/:id/previous/file",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "The file before the last replace",
        description:
          "For the admin to show before putting it back; it isn't on the published site.",
        tags: ["media"],
        params: MediaParams,
      },
    },
    async (request, reply) => {
      const file = await previousFile(db, dataDir, request.params.id);
      return reply
        .type(file.type)
        .header("cache-control", "private, max-age=3600")
        .send(createReadStream(file.path));
    },
  );

  app.post<{ Params: Params }>(
    "/media/:id/previous",
    {
      config: { access: "content.publish" },
      schema: {
        summary: "Put back the file before the last replace",
        description: "Swaps the two, so doing it again undoes it.",
        tags: ["media"],
        params: MediaParams,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => ({ data: await restorePrevious(db, dataDir, request.params.id) }),
  );

  app.delete<{ Params: Params }>(
    "/media/:id",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Move a file to Recently deleted",
        description:
          "Refused while a page (even one in Recently deleted) or the site settings use it; the error lists where. Restorable for 30 days.",
        tags: ["media"],
        params: MediaParams,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => ({ data: await deleteMedia(db, request.params.id) }),
  );

  app.post<{ Params: Params }>(
    "/media/:id/restore",
    {
      config: { access: "content.edit" },
      schema: {
        summary: "Bring a file back from Recently deleted",
        tags: ["media"],
        params: MediaParams,
        response: { 200: envelope(MediaDetail) },
      },
    },
    async (request) => ({ data: await restoreMedia(db, request.params.id) }),
  );
};
