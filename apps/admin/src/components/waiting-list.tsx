/**
 * The one answer to "what isn't live yet", for the Publishing screen.
 * Changes to live things are ticked; pages that have never been published
 * are listed but left for the officer to choose, since publishing a page by
 * accident is a visible mistake.
 * Replaced files have no tick: every publish copies the files as they are,
 * so they go with whatever is published.
 */
import type { PageCheck, WaitingItem } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { linkClass } from "@/components/text-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageCheckList, checksLabel, stops, useChecksOf } from "@/components/page-checks";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelTitle } from "@/components/ui/panel";
import { listOf, type MessageKey, t } from "@/i18n";
import { historyApi, siteApi } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useRun } from "@/lib/use-run";
import { useRefreshPages } from "@/lib/pages";
import { clx } from "@/lib/ftds/utils";
import { docName, isNewPage, usePublish, useSiteHref, useWaiting } from "@/lib/publish";

export const key = (item: WaitingItem) =>
  item.kind === "page" ? item.id : item.kind === "media" ? `media:${item.id}` : item.kind;

/** What a row is called: the page's title, the file's name, or the document's name. */
export const itemName = (item: WaitingItem) =>
  item.kind === "page"
    ? item.title || t("page.untitled")
    : item.kind === "media"
      ? item.filename
      : t(docName[item.kind]);

function Review({ item, onNavigate }: { item: WaitingItem; onNavigate?: () => void }) {
  const label = (
    <>
      {t("waiting.review")}
      <span className="sr-only"> {itemName(item)}</span>
    </>
  );
  if (item.kind === "page")
    return (
      <Link
        to="/pages/$id/edit"
        params={{ id: item.id }}
        className={linkClass}
        onClick={onNavigate}
      >
        {label}
      </Link>
    );
  if (item.kind === "media")
    return (
      <Link to="/media" search={{ file: item.id }} className={linkClass} onClick={onNavigate}>
        {label}
      </Link>
    );
  return (
    <Link to={`/${item.kind}`} className={linkClass} onClick={onNavigate}>
      {label}
    </Link>
  );
}

/** A change to something already live: what Discard can put back. */
type LiveChange = Exclude<WaitingItem, { kind: "media" }>;

/**
 * Rejects a change rather than publishing it: the draft goes back to what's
 * live. Only for changes to live things; a page that was never published has
 * nothing to go back to, and is deleted from Pages instead.
 */
function Discard({ item }: { item: LiveChange }) {
  const queryClient = useQueryClient();
  const refreshPages = useRefreshPages();
  // The checks follow the draft, so they're refreshed after either kind.
  const run = useRun(["checks"]);
  const [confirming, setConfirming] = useState(false);
  const name = itemName(item);
  const discard = async () => {
    if (item.kind === "page") {
      await historyApi.discard(item.id);
      await refreshPages(item.id);
    } else {
      await siteApi.discardDoc(item.kind);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: [item.kind] }),
      ]);
    }
  };
  return (
    <>
      <button
        type="button"
        className={clx(linkClass, "text-txt-danger")}
        onClick={() => setConfirming(true)}
      >
        {t("waiting.discard")}
        <span className="sr-only"> {name}</span>
      </button>
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={setConfirming}
          title={t("waiting.discard.title", { name })}
          description={t(item.kind === "page" ? "waiting.discard.page" : "waiting.discard.doc")}
          confirm={t("waiting.discard.confirm")}
          destructive
          onConfirm={() => void run(discard, t("waiting.discard.done", { name }))}
        />
      )}
    </>
  );
}

/** Review, and Discard for a change to something live. */
export function Actions({
  item,
  onNavigate,
}: {
  item: WaitingItem;
  onNavigate?: (() => void) | undefined;
}) {
  const canEdit = useCan("content.edit");
  return (
    <span className="flex shrink-0 items-center gap-3">
      <Review item={item} {...(onNavigate && { onNavigate })} />
      {canEdit && !isNewPage(item) && item.kind !== "media" && <Discard item={item} />}
    </span>
  );
}

/**
 * "4 things to check", opening in place to say what each one is and how to fix
 * it, with the way into the editor where the checks stay open.
 */
export function ChecksNote({
  pageId,
  checks,
  onNavigate,
}: {
  pageId: string;
  checks: PageCheck[];
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Details>
      <DetailsTrigger
        className={clx(
          "text-label-compact",
          stops(checks) ? "text-txt-danger" : "text-txt-warning",
        )}
      >
        {checksLabel(checks)}
      </DetailsTrigger>
      <DetailsContent className="flex flex-col items-start gap-3">
        <PageCheckList checks={checks} />
        <Link
          to="/pages/$id/edit"
          params={{ id: pageId }}
          search={{ checks: true }}
          className={linkClass}
          onClick={onNavigate}
        >
          {t("checks.fixInEditor")}
        </Link>
      </DetailsContent>
    </Details>
  );
}

/**
 * What the officer ticked and publishing it: the same choices wherever the
 * waiting list is shown. Changes to live things start ticked, new pages don't,
 * a page a check stops can't go, and replaced files always go along.
 */
export function useWaitingPublish() {
  const waiting = useWaiting();
  const checks = useChecksOf(
    waiting.items.flatMap((item) => (item.kind === "page" ? [item.id] : [])),
  );
  const checksOf = (item: WaitingItem) =>
    item.kind === "page" ? checks.data?.[item.id] : undefined;

  // What the officer unticked (changes) or ticked (new pages); everything else follows the default.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const isChecked = (item: WaitingItem) => flipped.has(key(item)) !== !isNewPage(item);
  const toggle = (item: WaitingItem) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(key(item))) next.add(key(item));
      return next;
    });

  /** Ticks or unticks every row of a group, whatever each row's default. */
  const setAll = (items: WaitingItem[], on: boolean) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      for (const item of items)
        if (on !== isNewPage(item)) next.delete(key(item));
        else next.add(key(item));
      return next;
    });

  // The three groups every list shows: changes to live things, replaced files, new pages.
  const changes = waiting.items.filter((item) => !isNewPage(item) && item.kind !== "media");
  const files = waiting.items.filter((item) => item.kind === "media");
  const fresh = waiting.items.filter(isNewPage);
  // A page a check stops can't go: it keeps the officer's tick, but shows unticked and isn't sent.
  const goes = (item: WaitingItem) => isChecked(item) && !stops(checksOf(item));
  const chosen = waiting.items.filter((item) => item.kind !== "media" && goes(item));
  // What the last publish sent, for the outcome to name.
  const [sent, setSent] = useState<WaitingItem[]>([]);
  const { outcome, publish } = usePublish(() => {
    setSent([...chosen, ...files]);
    const pageIds = chosen.flatMap((i) => (i.kind === "page" ? [i.id] : []));
    const docs = chosen.flatMap((i) => (i.kind === "page" || i.kind === "media" ? [] : [i.kind]));
    // The officer's ticks stay as they left them: what they left out stays left out.
    return siteApi.publish({ pageIds, docs });
  });

  const count = chosen.length + files.length;
  // Site documents ticked: they change every page.
  const docs = chosen.filter((i) => i.kind !== "page");
  const label =
    files.length === 0 && docs.length === 0
      ? t("waiting.publishPages", { count })
      : t("waiting.publish", { count });

  return {
    waiting,
    checksOf,
    goes,
    isChecked,
    toggle,
    setAll,
    changes,
    files,
    fresh,
    chosen,
    docs,
    count,
    label,
    sent,
    outcome,
    publish,
    busy: outcome.status === "publishing",
  };
}
export type WaitingPublish = ReturnType<typeof useWaitingPublish>;

/** How the last publish ended, where Publish was pressed; read out when it arrives. */
export function PublishOutcome({
  state,
  onNavigate,
}: {
  state: WaitingPublish;
  onNavigate?: (() => void) | undefined;
}) {
  const { outcome, sent, publish } = state;
  // Proof on the site: the page itself when one page went live, else the home page.
  const only = sent.length === 1 ? sent[0] : undefined;
  const siteHref = useSiteHref(only?.kind === "page" ? only.path : "/");
  return (
    <div aria-live={outcome.status === "failed" ? "assertive" : "polite"}>
      {outcome.status === "live" && (
        <Outcome variant="success" title={t("outcome.live.title")}>
          <p>{t("outcome.live.body", { items: listOf(sent.map(itemName)) })}</p>
          <div>
            <Button
              variant="default-outline"
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
              render={<a href={siteHref} target="_blank" rel="noopener" />}
            >
              {t("publish.view")}
              <span className="sr-only"> {t("publish.newTab")}</span>
            </Button>
          </div>
        </Outcome>
      )}
      {outcome.status === "failed" && (
        <Outcome variant="danger" title={t("outcome.failed.title")}>
          <p>{t("outcome.failed.body")}</p>
          {outcome.error && (
            <p className="text-txt-black-700">
              {t("outcome.failed.reason", { reason: outcome.error })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary-fill" onClick={() => void publish()}>
              {t("publish.retry")}
            </Button>
            <Link
              to="/publishing"
              search={{ tab: "history" }}
              className={linkClass}
              onClick={onNavigate}
            >
              {t("outcome.failed.log")}
            </Link>
          </div>
        </Outcome>
      )}
    </div>
  );
}

/** What goes public, by name, before it does. */
export function PublishConfirm({
  state,
  open,
  onOpenChange,
}: {
  state: WaitingPublish;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { chosen, docs, files, label, publish } = state;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("waiting.confirm.title")}
      description={t("waiting.confirm.description")}
      confirm={label}
      onConfirm={() => void publish()}
    >
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
        <ConfirmGroup
          title="waiting.confirm.updated"
          items={chosen.filter((i) => !isNewPage(i) && i.kind === "page")}
        />
        <ConfirmGroup title="waiting.confirm.new" items={chosen.filter(isNewPage)} />
        <ConfirmGroup title="waiting.confirm.siteWide" items={docs} />
        <ConfirmGroup title="waiting.confirm.files" items={files} />
      </div>
    </ConfirmDialog>
  );
}

function ConfirmGroup({ title, items }: { title: MessageKey; items: WaitingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-txt-black-700 font-semibold">{t(title)}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={key(item)} className="flex min-w-0 gap-2">
            <span className="truncate font-medium">{itemName(item)}</span>
            {item.kind === "page" && (
              <span className="text-txt-black-700 truncate">{item.path}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How a publish ended, as an FTDS Panel. Its title is an h2: the screen already has its h1. */
function Outcome({
  variant,
  title,
  children,
}: {
  variant: "success" | "danger";
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel variant={variant}>
      {/* oxlint-disable-next-line jsx-a11y/heading-has-content -- filled by PanelTitle's children */}
      <PanelTitle render={<h2 />}>{title}</PanelTitle>
      <PanelBody className="flex flex-col gap-3">{children}</PanelBody>
    </Panel>
  );
}
