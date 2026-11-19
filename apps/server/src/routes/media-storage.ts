/**
 * Settings → Media storage, for the super admin: which store the media
 * library is in, and the agency's own provider when it has one. A setup can
 * be saved only once its connection test passes, and saved or removed only
 * while the library has no live files (docs/laman.md § Media storage).
 */
import type { FastifyPluginAsync } from "fastify";
import { audited } from "../auth/guard.js";
import { purgeAllDeleted } from "../content/media.js";
import { MediaStorage, MediaStorageSave, MediaStorageTestResult, envelope } from "../contract.js";
import { writeRow } from "../content/kv.js";
import { HttpError } from "../errors.js";
import {
  MEDIA_STORAGE_ROW,
  assertUnlocked,
  mediaStorageView,
  ownSetup,
  readOwnSetup,
  s3MediaStore,
  sameStore,
  secretOf,
  storedOf,
  testMediaStore,
} from "../media-store/index.js";
import { readOffsite } from "../offsite/index.js";

const tags = ["media storage"];

export const mediaStorageRoutes: FastifyPluginAsync = async (app) => {
  const { db, mediaStorage } = app;
  const { secretKey } = mediaStorage;
  const view = async () => mediaStorageView(db, secretKey, (await readOffsite(db)).enabled);
  const needKey = () => {
    if (!secretKey)
      throw new HttpError(
        409,
        "backup_secret_key_missing",
        "Set BACKUP_SECRET_KEY on the server before setting up your own media storage: it seals the secret key.",
      );
    return secretKey;
  };

  app.get(
    "/media-storage",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Where the media library is kept",
        description:
          "The bundled store, or the agency's own provider. The secret key is never returned: only that one is saved.",
        tags,
        response: { 200: envelope(MediaStorage) },
      },
    },
    async () => ({ data: await view() }),
  );

  app.post<{ Body: MediaStorageSave }>(
    "/media-storage/test",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Test a media storage setup",
        description:
          "With the settings given (a left-out `secret` uses the saved one): writes, reads, lists and deletes a small file in each bucket.",
        tags,
        body: MediaStorageSave,
        response: { 200: envelope(MediaStorageTestResult) },
      },
    },
    async (request) => {
      const key = needKey();
      const before = await readOwnSetup(db);
      const secret = secretOf(before, request.body, key);
      const result = await testMediaStore(s3MediaStore("own", ownSetup(request.body, secret)));
      audited(request, {
        action: "mediaStorageTested",
        detail: { provider: request.body.provider, ok: result.ok, bucket: result.bucket },
      });
      return { data: result };
    },
  );

  app.put<{ Body: MediaStorageSave }>(
    "/media-storage",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Use the agency's own media storage",
        description:
          "Tested first, and saved only if the test passes. Refused (409 `media_storage_locked`) while the library has live files, unless only the keys or the published files' address change. Files in Recently deleted are purged first: they can't be put back afterwards. Leave `secret` out to keep the saved one.",
        tags,
        body: MediaStorageSave,
        response: { 200: envelope(MediaStorage) },
      },
    },
    async (request) => {
      const key = needKey();
      const before = await readOwnSetup(db);
      const moves = !before || !sameStore(before, request.body);
      if (moves) await assertUnlocked(db);
      const secret = secretOf(before, request.body, key);
      const store = s3MediaStore("own", ownSetup(request.body, secret));
      const test = await testMediaStore(store);
      if (!test.ok)
        throw new HttpError(
          422,
          "media_storage_test_failed",
          `The ${test.bucket} bucket failed the connection test: ${test.error}`,
          test,
        );
      const purged = moves ? await purgeAllDeleted(db, await mediaStorage.current()) : 0;
      await writeRow(db, MEDIA_STORAGE_ROW, storedOf(before, request.body, key));
      mediaStorage.reset();
      audited(request, {
        action: "mediaStorageChanged",
        detail: {
          store: "own",
          provider: request.body.provider,
          privateBucket: request.body.privateBucket,
          publishedBucket: request.body.publishedBucket,
          publicUrl: request.body.publicUrl,
          secretChanged: Boolean(request.body.secret),
          purged,
        },
      });
      return { data: await view() };
    },
  );

  app.delete(
    "/media-storage",
    {
      config: { access: "security.manage" },
      schema: {
        summary: "Go back to the bundled media store",
        description:
          "Removes the agency's own setup. Refused (409 `media_storage_locked`) while the library has live files. Files in Recently deleted are purged first: they can't be put back afterwards.",
        tags,
        response: { 200: envelope(MediaStorage) },
      },
    },
    async (request) => {
      const before = await readOwnSetup(db);
      if (!before) return { data: await view() };
      await assertUnlocked(db);
      // A setup whose secret can't be opened any more can still be removed: its objects stay behind.
      const purged = await purgeAllDeleted(db, await mediaStorage.current().catch(() => null));
      await db.deleteFrom("settings").where("key", "=", MEDIA_STORAGE_ROW).execute();
      mediaStorage.reset();
      audited(request, {
        action: "mediaStorageChanged",
        detail: { store: "bundled", provider: before.provider, purged },
      });
      return { data: await view() };
    },
  );
};
