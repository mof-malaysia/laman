/**
 * Someone else saved what's being edited since it was opened: the save was
 * refused rather than overwrite them (409 `draft_conflict`). Load theirs and
 * carry on from it, or keep yours, which replaces theirs. It doesn't close
 * any other way: until one is chosen, nothing more is saved.
 */
import type { DraftConflict, SiteDocName } from "@laman/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import type { SaveState } from "@/components/publish-control";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { conflictOf, docBases } from "@/lib/api";
import { formatDateTime } from "@/lib/pages";
import { siteDocQuery } from "@/lib/publish";

export function ConflictDialog({
  conflict,
  what,
  keptInHistory,
  onLoadTheirs,
  onKeepMine,
}: {
  /** Shown while set: who saved in between, and when. */
  conflict: DraftConflict | undefined;
  /** What's being edited, as it reads in a sentence: "this page", "the navigation". */
  what: string;
  /** Loading theirs keeps yours in the page's history. */
  keptInHistory: boolean;
  onLoadTheirs: () => Promise<unknown>;
  onKeepMine: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const choose = async (choice: () => Promise<unknown>) => {
    setPending(true);
    try {
      await choice();
    } finally {
      setPending(false);
    }
  };
  const name = conflict?.by ?? t("conflict.someone");
  return (
    <AlertDialog open={Boolean(conflict)}>
      <AlertDialogContent className="sm:w-lg" hideClose dismissible={false}>
        <AlertDialogTitle>{t("conflict.title", { name, what })}</AlertDialogTitle>
        <AlertDialogDescription>
          {conflict?.at
            ? t("conflict.when", { name, when: formatDateTime(conflict.at) })
            : t("conflict.since", { name })}{" "}
          {keptInHistory ? t("conflict.choiceKept") : t("conflict.choice")}
        </AlertDialogDescription>
        <AlertDialogAction>
          <Button
            variant="default-outline"
            disabled={pending}
            onClick={() => void choose(onKeepMine)}
          >
            {t("conflict.keepMine")}
          </Button>
          <Button
            variant="primary-fill"
            disabled={pending}
            onClick={() => void choose(onLoadTheirs)}
          >
            {t("conflict.loadTheirs", { name })}
          </Button>
        </AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * For a site document's screen. It edits from the version on screen when it
 * opened (`docBases`), and when a save is refused for someone else's in
 * between, asks which to keep: `onLoad` puts theirs on screen; keeping mine
 * runs `retry`, which saves again from their version, so it replaces them.
 */
export function useDocConflict<Draft>(
  name: SiteDocName,
  { onLoad, retry }: { onLoad: (draft: Draft) => void; retry: () => Promise<unknown> },
) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<DraftConflict>();
  // What's on screen now is what the edits start from.
  useLayoutEffect(() => {
    const doc = queryClient.getQueryData<{ version: string }>([name]);
    if (doc) docBases.set(name, doc.version);
  }, [name, queryClient]);

  return {
    /** A refusal is being asked about: nothing is saved until it's answered. */
    open: Boolean(conflict),
    /** The publish control's save state, with a refusal being asked about. */
    saveState: (saving: boolean, dirty: boolean): SaveState =>
      saving ? "saving" : conflict ? "conflict" : dirty ? "unsaved" : "saved",
    /** Whether `caught` was such a refusal, now being asked about. */
    async handle(caught: unknown) {
      const details = await conflictOf(caught);
      if (details) setConflict(details);
      return Boolean(details);
    },
    dialog: (
      <ConflictDialog
        conflict={conflict}
        what={t(`conflict.doc.${name}`)}
        keptInHistory={false}
        onLoadTheirs={async () => {
          const { queryFn } = siteDocQuery(name);
          const latest = (await queryClient.fetchQuery({
            queryKey: [name],
            queryFn: queryFn as () => Promise<unknown>,
            staleTime: 0,
          })) as { draft: Draft; version: string };
          docBases.set(name, latest.version);
          onLoad(latest.draft);
          setConflict(undefined);
        }}
        onKeepMine={async () => {
          if (conflict) docBases.set(name, conflict.version);
          setConflict(undefined);
          await retry();
        }}
      />
    ),
  };
}
