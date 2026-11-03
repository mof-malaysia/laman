/** Filesystem helpers the publisher and backups share. */
import { link, mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/** Runs `task` over `items` a few at a time; waits for all of them before throwing. */
export async function inPool<T>(items: T[], task: (item: T) => Promise<unknown>, size = 16) {
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) await task(items[i] as T);
  };
  const results = await Promise.allSettled(Array.from({ length: size }, worker));
  const failure = results.find((r) => r.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * `to` as a copy of `from` made of hard links: no file is copied, so it's
 * quick and costs no disk. Folders first, then the links, a few at a time so
 * a large site neither waits on each one nor runs out of file handles.
 */
export async function linkTree(from: string, to: string) {
  const entries = await readdir(from, { recursive: true, withFileTypes: true });
  const target = (e: (typeof entries)[number]) => join(to, relative(from, e.parentPath), e.name);
  await mkdir(to, { recursive: true });
  await inPool(
    entries.filter((e) => e.isDirectory()),
    (e) => mkdir(target(e), { recursive: true }),
  );
  await inPool(
    entries.filter((e) => !e.isDirectory()),
    (e) => link(join(e.parentPath, e.name), target(e)),
  );
}
