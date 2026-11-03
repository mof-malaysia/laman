/**
 * Who the current request is acting for, so the writes deep in content code
 * (a revision, a job, an upload, a draft) can record it without every
 * function taking a user. Null outside a request, such as the job queue's own
 * work or the CLI.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** An agent a person works through (docs/mcp.md): its name, and which of their connections. */
export type ActingAgent = { name: string; connection: string };

const store = new AsyncLocalStorage<{ userId: string | null; agent: ActingAgent | null }>();

/** Runs `next` (the rest of the request) with a place to record the person once known. */
export const actingScope = (next: () => void) => store.run({ userId: null, agent: null }, next);

/** The person, and the agent they're working through when it's a tool call (docs/mcp.md). */
export function actAs(userId: string, agent: ActingAgent | null = null) {
  const current = store.getStore();
  if (current) {
    current.userId = userId;
    current.agent = agent;
  }
}

export const actingUser = () => store.getStore()?.userId ?? null;

/** The agent's name when the person is working through one, as revisions record it. */
export const actingAgent = () => store.getStore()?.agent?.name ?? null;

/** The agent connection the person is working through, as the audit log records it. */
export const actingConnection = () => store.getStore()?.agent?.connection ?? null;

/** Runs `work` acting for `userId`: a job, for the person who queued it. */
export const runAs = <T>(userId: string | null, work: () => T) =>
  store.run({ userId, agent: null }, work);
