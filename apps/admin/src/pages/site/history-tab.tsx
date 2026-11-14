/**
 * A page's history: its revisions in a timeline. Compare renders two
 * revisions side by side through /render, with a block-level summary;
 * Restore as draft copies one into the draft (never publishing it), after
 * keeping the current draft as a revision, so a restore can be undone.
 */
import type { PageDocument } from "@laman/blocks";
import type { Page, Revision } from "@laman/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { type ActivityEvent, ActivityTimeline } from "@/components/blocks/activity-timeline";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { locale, t } from "@/i18n";
import { api, apiError, historyApi } from "@/lib/api";
import { changeMarks, pageChanges } from "@/lib/page-diff";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDateTime, revisionQuery, revisionsQuery, useRefreshPages } from "@/lib/pages";
import { Panel } from "./tab-layout";

export function HistoryTab({ page }: { page: Page }) {
  const revisions = useQuery(revisionsQuery(page.id, page.updatedAt));
  const refresh = useRefreshPages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [compare, setCompare] = useState<Revision | null>(null);

  const restore = async (revision: Revision) => {
    try {
      await historyApi.restore(page.id, revision.id);
      await refresh(page.id);
      await queryClient.invalidateQueries({ queryKey: ["revisions", page.id] });
      toast({
        variant: "success",
        title: t("history.restored"),
        description: t("history.restoredBody"),
      });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("history.restoreFailed"),
        description: (await apiError(caught))?.message,
      });
    }
  };

  if (revisions.isError)
    return (
      <Callout variant="danger">
        <CalloutTitle>{t("history.loadFailed")}</CalloutTitle>
      </Callout>
    );
  if (!revisions.data) return <Skeleton className="h-40 w-full max-w-3xl" />;

  const events: ActivityEvent[] = revisions.data.map((revision) => ({
    id: revision.id,
    kind: revision.kind === "published" ? "decision" : "document",
    actor: {
      name: revision.via
        ? t("agents.through", { name: revision.by ?? t("history.someone"), agent: revision.via })
        : (revision.by ?? t("history.someone")),
    },
    action: (
      <span className="inline-flex flex-wrap items-center gap-2">
        {revision.kind === "published" ? t("history.published") : t("history.draftSaved")}
        {revision.live && (
          <Tag size="small" variant="success">
            {t("history.live")}
          </Tag>
        )}
        <span className="text-txt-black-500">
          {t("history.blocksChanged", { count: revision.blocksChanged })}
        </span>
      </span>
    ),
    at: revision.createdAt,
    comment: (
      <span className="flex gap-2">
        <Button variant="default-outline" size="small" onClick={() => setCompare(revision)}>
          {t("history.compare")}
        </Button>
        <Button variant="default-ghost" size="small" onClick={() => void restore(revision)}>
          {t("history.restore")}
        </Button>
      </span>
    ),
  }));

  return (
    <div className="max-w-3xl">
      <Panel>
        <p className="text-body-sm text-txt-black-700">{t("history.intro")}</p>
        <ActivityTimeline
          events={events}
          locale={locale()}
          labels={{ list: t("history.list"), empty: t("history.empty") }}
        />
      </Panel>
      <CompareDialog page={page} revision={compare} onClose={() => setCompare(null)} />
    </div>
  );
}

/** The HTML of a document, rendered by the renderer in preview mode. */
function useRendered(pageId: string, doc: PageDocument | undefined) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    if (!doc) return;
    let live = true;
    void api
      .post(`render/pages/${pageId}`, { json: { mode: "preview", page: doc.ms } })
      .text()
      .then((text) => live && setHtml(text));
    return () => {
      live = false;
    };
  }, [pageId, doc]);
  return html;
}

function CompareDialog({
  page,
  revision,
  onClose,
}: {
  page: Page;
  revision: Revision | null;
  onClose: () => void;
}) {
  const detail = useQuery(revisionQuery(page.id, revision?.id));
  const before = detail.data?.content;
  const left = useRendered(page.id, before);
  const right = useRendered(page.id, revision ? page.draft : undefined);
  // Blocks added, removed or changed, with the changed fields' names.
  const changes = useMemo(
    () => (before ? pageChanges(before, page.draft).filter((c) => c.kind !== "same") : []),
    [before, page.draft],
  );

  return (
    <Dialog open={revision !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogBody className="sm:w-[min(96dvw,90rem)] sm:max-w-none">
        <DialogHeader>
          <DialogTitle>
            {revision && t("history.compareTitle", { time: formatDateTime(revision.createdAt) })}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="flex flex-col gap-4">
          {changes.length === 0 ? (
            <p className="text-body-sm text-txt-black-700">
              {before ? t("history.same") : t("editor.loading")}
            </p>
          ) : (
            <ul className="text-body-sm m-0 flex list-disc flex-col gap-0.5 pl-5">
              {changes.map((change, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- a summary, never reordered
                <li key={i}>
                  <span className="font-medium">{t(changeMarks[change.kind].label)}</span>{" "}
                  {change.id === "title" ? t("history.pageTitle") : change.label}
                  {change.fields.length > 0 && (
                    <span className="text-txt-black-700">
                      {" "}
                      ({change.fields.map((field) => field.label).join(", ")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid h-[60dvh] grid-cols-2 gap-3">
            {[
              { title: t("history.thisRevision"), html: left },
              { title: t("history.currentDraft"), html: right },
            ].map((side) => (
              <figure key={side.title} className="m-0 flex min-h-0 flex-col gap-1">
                <figcaption className="text-label-sm text-txt-black-700 font-medium">
                  {side.title}
                </figcaption>
                {side.html ? (
                  // Same origin: the renderer's own HTML, read-only.
                  // oxlint-disable-next-line react/iframe-missing-sandbox
                  <iframe
                    title={side.title}
                    srcDoc={side.html}
                    className="bg-bg-white min-h-0 w-full flex-1 rounded-md"
                  />
                ) : (
                  <Skeleton className="flex-1" />
                )}
              </figure>
            ))}
          </div>
        </DialogContent>
      </DialogBody>
    </Dialog>
  );
}
