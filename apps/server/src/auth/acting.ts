/**
 * Who the current request is acting for, so the writes deep in content code
 * (a revision, a job, an upload, a draft) can record it without every
 * function taking a user. Null outside a request, such as the job queue's own
 * work or the CLI.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ userId: string | null }>();

/** Runs `next` (the rest of the request) with a place to record the person once known. */
export const actingScope = (next: () => void) => store.run({ userId: null }, next);

export function actAs(userId: string) {
  const current = store.getStore();
  if (current) current.userId = userId;
}

export const actingUser = () => store.getStore()?.userId ?? null;

/** Runs `work` acting for `userId`: a job, for the person who queued it. */
export const runAs = <T>(userId: string | null, work: () => T) => store.run({ userId }, work);
