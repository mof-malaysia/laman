/**
 * A page's unsaved changes, kept in this browser until they're saved, so a
 * closed tab, a crash or a lost connection doesn't lose them: the editor
 * offers them back next time. Kept per person, and cleared at sign-out, so
 * on a shared computer nobody else is offered them. Storage can be full or
 * blocked; then nothing is kept, and saving works as before.
 */
import type { PageDocument } from "@laman/blocks";

export type LocalDraft = {
  doc: PageDocument;
  /** The draft version the changes started from, sent as the save's base. */
  base: string;
  /** When they were last kept. */
  at: string;
  username: string;
};

const PREFIX = "sb.unsaved.";

export const localDrafts = {
  read(pageId: string, username: string): LocalDraft | undefined {
    try {
      const kept = JSON.parse(localStorage.getItem(PREFIX + pageId) ?? "null") as LocalDraft | null;
      return kept?.username === username ? kept : undefined;
    } catch {
      return undefined;
    }
  },
  write(pageId: string, draft: LocalDraft) {
    try {
      localStorage.setItem(PREFIX + pageId, JSON.stringify(draft));
    } catch {
      // Full or blocked: the server save still runs.
    }
  },
  clear(pageId: string) {
    try {
      localStorage.removeItem(PREFIX + pageId);
    } catch {
      // Nothing was kept.
    }
  },
  /** At sign-out: nothing left for the next person at this computer. */
  clearAll() {
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    } catch {
      // Nothing was kept.
    }
  },
};
