/**
 * The bundled media store's copy off-site (docs/laman.md § What gets backed
 * up). RustFS keeps its files on the same disk as the database, so after each
 * backup the private bucket is copied to the off-site backup bucket, under
 * `<prefix>/media/`, sending only files that aren't there yet at that size.
 * Nothing is deleted there: a file purged here stays off-site until the
 * bucket's lifecycle rules expire it. The published bucket isn't copied: it
 * holds copies of private files, and the full publish a restore queues makes
 * it again.
 */
import { inPool } from "../files.js";
import type { MediaStore } from "../media-store/index.js";
import { joinKey } from "./index.js";
import type { RemoteStore } from "./stores.js";

/** Where the media goes in the off-site bucket, beside the archives' folders. */
export const MEDIA_FOLDER = "media";

export async function mirrorMedia(media: MediaStore, remote: RemoteStore, prefix: string) {
  const base = `${joinKey(prefix, MEDIA_FOLDER)}/`;
  const there = new Map((await remote.list(base)).map((o) => [o.key, o.bytes]));
  let sent = 0;
  let bytes = 0;
  const fresh = (await media.list("private", "")).filter(
    (object) => there.get(base + object.key) !== object.bytes,
  );
  await inPool(
    fresh,
    async (object) => {
      const opened = await media.open("private", object.key);
      if (!opened?.body) return;
      await remote.putStream(
        base + object.key,
        opened.body,
        opened.headers["content-type"] ?? "application/octet-stream",
      );
      sent++;
      bytes += object.bytes;
    },
    4,
  );
  return { sent, bytes };
}
