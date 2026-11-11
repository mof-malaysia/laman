/**
 * Publishing, the same way on every screen: a Publish button sends one thing
 * live, then shows the result where it was pressed (docs/journeys/publish-model.md).
 */
import {
  type Job,
  type PublishLogEntry,
  SiteDocName,
  type Summary,
  type WaitingItem,
} from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { MessageKey } from "@/i18n";
import { siteApi, waitForJob } from "./api";
import { useRefreshPages, useSummary } from "./pages";

/** What each site document is called: "Site settings", "Site colours". */
export const docName: Record<SiteDocName, MessageKey> = {
  settings: "waiting.settings",
  navigation: "waiting.navigation",
  announcement: "waiting.announcement",
  search: "waiting.search",
  theme: "waiting.theme",
};

export type PublishOutcome =
  | { status: "idle" }
  | { status: "publishing" }
  /** `skipped`: pages that wouldn't render, so the site kept their last version (or, new, left them off). */
  | { status: "live"; at: string; skipped?: { pageId: string | null; title: string }[] }
  | { status: "scheduled"; at: string }
  /** `save`: saving first failed, so nothing was published. `error`: why the rebuild failed. */
  | { status: "failed"; reason?: "save"; error?: string };

/** Thrown by a publish's save-first step, so the failure says what really happened. */
export class SaveFirstError extends Error {}

/** Where a thing stands on the site. */
export type LiveState = "live" | "changed" | "new" | "scheduled";

export const siteDocQuery = <N extends SiteDocName>(name: N) =>
  ({
    queryKey: [name],
    queryFn: {
      settings: siteApi.settings,
      navigation: siteApi.navigation,
      announcement: siteApi.announcement,
      search: siteApi.search,
      theme: siteApi.theme,
    }[name],
  }) as const;

export const useAnnouncementDoc = () => useQuery(siteDocQuery("announcement"));
export const useSearchDoc = () => useQuery(siteDocQuery("search"));
export const useThemeDoc = () => useQuery(siteDocQuery("theme"));

/** Refreshes everything a publish can change: pages, the waiting list and the site documents. */
export function useRefreshAfterPublish() {
  const queryClient = useQueryClient();
  const refreshPages = useRefreshPages();
  return useCallback(
    (id?: string) =>
      Promise.all([
        refreshPages(id),
        ...SiteDocName.options.map((name) => queryClient.invalidateQueries({ queryKey: [name] })),
      ]),
    [queryClient, refreshPages],
  );
}

/** The pages a finished publish couldn't render, one entry each. */
function skippedPages(log: PublishLogEntry[]) {
  const pages = new Map<string | null, string>();
  for (const entry of log) if (entry.outcome === "failed") pages.set(entry.pageId, entry.title);
  return [...pages].map(([pageId, title]) => ({ pageId, title }));
}

/**
 * Runs a publish and follows its rebuild. `run` starts it and returns the
 * job; a job that runs later (a scheduled entry) ends as "scheduled".
 */
export function usePublish(run: () => Promise<{ job: Job }>) {
  const refresh = useRefreshAfterPublish();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<PublishOutcome>({ status: "idle" });
  /** Resolves with how it ended, which is also kept as `outcome`. */
  const publish = useCallback(async (): Promise<PublishOutcome> => {
    setOutcome({ status: "publishing" });
    let end: PublishOutcome;
    try {
      const { job } = await run();
      void refresh();
      if (job.runAt && Date.parse(job.runAt) > Date.now()) {
        end = { status: "scheduled", at: job.runAt };
      } else {
        const done = await waitForJob(job);
        end =
          done.status === "failed"
            ? { status: "failed", ...(done.error && { error: done.error }) }
            : {
                status: "live",
                at: done.finishedAt ?? new Date().toISOString(),
                ...(done.result?.failed && { skipped: skippedPages(done.log) }),
              };
      }
    } catch (error) {
      console.error(error);
      end =
        error instanceof SaveFirstError
          ? { status: "failed", reason: "save" }
          : { status: "failed" };
    }
    setOutcome(end);
    // Content was refreshed when the publish started; only the job's state is new.
    await Promise.all(
      ["summary", "jobs"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
    return end;
  }, [run, refresh, queryClient]);
  return { outcome, publish };
}

/** The published address of `path`: on SITE_URL when it's set, else on this server. */
export function siteHref(summary: Summary | undefined, path: string) {
  const base = summary?.site.url?.replace(/\/$/, "") ?? "";
  return `${base}${path}`;
}

/** An address without its scheme or trailing slash: "laman.gov.my/berita". */
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const useSiteHref = (path: string) => siteHref(useSummary().data, path);

/** A page never published: listed as waiting, but not counted or ticked by default. */
export const isNewPage = (item: WaitingItem) => item.kind === "page" && item.new;

/**
 * What isn't live yet: `count` is what counts as waiting, `fresh` the new pages,
 * which are listed but not counted.
 */
export function useWaiting() {
  const summary = useSummary();
  const items = summary.data?.waiting ?? [];
  const fresh = items.filter(isNewPage).length;
  return { ...summary, items, count: items.length - fresh, fresh };
}
