/**
 * The one answer to "what isn't live yet", the same in the header, on the
 * dashboard and on the Publishing screen. Changes to live things are ticked;
 * pages that have never been published are listed but left for the officer
 * to choose, since publishing a page by accident is a visible mistake.
 * Replaced files have no tick: every publish copies the files as they are,
 * so they go with whatever is published.
 */
import type { PageCheck, WaitingItem } from "@fiscal-sb/contracts";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { linkClass } from "@/components/text-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { stops, useChecksOf } from "@/components/page-checks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody, PanelTitle } from "@/components/ui/panel";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldItem, FieldLabel } from "@/components/ui/field";
import { locale, type MessageKey, t } from "@/i18n";
import { siteApi } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { formatDateTime } from "@/lib/pages";
import { clx } from "@/lib/ftds/utils";
import { docName, isNewPage, usePublish, useSiteHref, useWaiting } from "@/lib/publish";

const key = (item: WaitingItem) =>
  item.kind === "page" ? item.id : item.kind === "media" ? `media:${item.id}` : item.kind;

/** What a row is called: the page's title, the file's name, or the document's name. */
const itemName = (item: WaitingItem) =>
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
      <Link to="/pages/$id" params={{ id: item.id }} className={linkClass} onClick={onNavigate}>
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

/** A page's checks under its name: what stops it, or how many things to look at. */
function ChecksNote({ checks }: { checks: PageCheck[] | undefined }) {
  if (!checks?.length) return null;
  const stopped = stops(checks);
  return (
    <span className={clx("text-body-sm", stopped ? "text-txt-danger" : "text-txt-warning")}>
      {stopped ? t("checks.stoppedRow") : t("checks.warningsRow", { count: checks.length })}
    </span>
  );
}

function Row({
  item,
  checked,
  onChecked,
  onNavigate,
  readOnly,
  checks,
}: {
  item: WaitingItem;
  checked: boolean;
  onChecked: (checked: boolean) => void;
  onNavigate?: (() => void) | undefined;
  /** For someone who can't publish: what's waiting, without ticks. */
  readOnly?: boolean;
  /** A page's checks before it goes live; one a check stops (`checked` is then false) can't be ticked. */
  checks?: PageCheck[] | undefined;
}) {
  const meta = useId();
  const stopped = stops(checks);
  const description = [
    item.kind === "page"
      ? `${item.path} · ${t("waiting.saved", { date: formatDateTime(item.updatedAt) })}`
      : t("waiting.doc"),
    "editedBy" in item && item.editedBy && t("waiting.by", { name: item.editedBy }),
  ]
    .filter(Boolean)
    .join(" · ");
  // The address, save time and checks: under the name, and the checkbox's description.
  const details = (
    <>
      <span className="text-body-sm text-txt-black-700 truncate">{description}</span>
      <ChecksNote checks={checks} />
    </>
  );
  if (readOnly)
    return (
      <li className="flex items-start gap-3 py-2">
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="text-body-md truncate font-medium">{itemName(item)}</span>
          {details}
        </span>
        <span className="text-body-sm shrink-0 pt-0.5">
          <Review item={item} {...(onNavigate && { onNavigate })} />
        </span>
      </li>
    );
  return (
    <li className="flex items-start gap-3 py-2">
      <Field name={`waiting-${key(item)}`} className="min-w-0 flex-1">
        <FieldItem>
          {/* The name is the title; the address and save time are its description. */}
          <Checkbox
            checked={checked}
            disabled={stopped}
            onCheckedChange={onChecked}
            aria-describedby={meta}
          />
          <span className="flex min-w-0 flex-col items-start">
            <FieldLabel className="truncate text-left font-medium">{itemName(item)}</FieldLabel>
            <span id={meta} className="flex flex-col items-start">
              {details}
            </span>
          </span>
        </FieldItem>
      </Field>
      <span className="text-body-sm shrink-0 pt-0.5">
        <Review item={item} {...(onNavigate && { onNavigate })} />
      </span>
    </li>
  );
}

/** A replaced file: no tick, since any publish takes it live. */
function MediaRow({
  item,
  onNavigate,
}: {
  item: WaitingItem;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{itemName(item)}</span>
        <span className="text-body-sm text-txt-black-700 truncate">{t("waiting.mediaHint")}</span>
      </span>
      <span className="text-body-sm shrink-0 pt-0.5">
        <Review item={item} {...(onNavigate && { onNavigate })} />
      </span>
    </li>
  );
}

export function WaitingList({ onNavigate }: { onNavigate?: () => void }) {
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
  const [confirming, setConfirming] = useState(false);
  const canPublish = useCan("content.publish");

  const files = waiting.items.filter((item) => item.kind === "media");
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
  // Proof on the site: the page itself when one page went live, else the home page.
  const only = sent.length === 1 ? sent[0] : undefined;
  const siteHref = useSiteHref(only?.kind === "page" ? only.path : "/");

  const group = (id: string, title: MessageKey, items: WaitingItem[]) => {
    if (items.length === 0) return null;
    const all = items.every(isChecked);
    return (
      <section aria-labelledby={id}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={id} className="text-body-sm text-txt-black-700 font-semibold">
            {t(title)}
          </h3>
          {canPublish && items.length > 1 && (
            <button
              type="button"
              className={clx("text-body-sm", linkClass)}
              onClick={() => setAll(items, !all)}
            >
              {t(all ? "waiting.untickAll" : "waiting.tickAll")}
              <span className="sr-only"> {t(title)}</span>
            </button>
          )}
        </div>
        <ul className="divide-otl-gray-200 m-0 list-none divide-y p-0">
          {items.map((item) => (
            <Row
              key={key(item)}
              item={item}
              checked={goes(item)}
              onChecked={() => toggle(item)}
              onNavigate={onNavigate}
              readOnly={!canPublish}
              checks={checksOf(item)}
            />
          ))}
        </ul>
      </section>
    );
  };
  const busy = outcome.status === "publishing";
  const count = chosen.length + files.length;
  const changes = chosen.filter((i) => !isNewPage(i) && i.kind === "page");
  const fresh = chosen.filter(isNewPage);
  const docs = chosen.filter((i) => i.kind !== "page");
  const label =
    files.length === 0 && docs.length === 0
      ? t("waiting.publishPages", { count })
      : t("waiting.publish", { count });

  return (
    <div className="gap-stack-sm flex flex-col">
      {/* The outcome, where Publish was pressed; read out when it arrives. */}
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
              <p className="text-body-sm text-txt-black-700">
                {t("outcome.failed.reason", { reason: outcome.error })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary-fill" onClick={() => void publish()}>
                {t("publish.retry")}
              </Button>
              <Link to="/publishing" className={linkClass} onClick={onNavigate}>
                {t("outcome.failed.log")}
              </Link>
            </div>
          </Outcome>
        )}
      </div>
      {waiting.isPending ? (
        <output className="flex flex-col gap-2">
          <span className="sr-only">{t("waiting.loading")}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </output>
      ) : waiting.items.length === 0 ? (
        outcome.status !== "live" && <p className="text-txt-black-700">{t("waiting.none")}</p>
      ) : (
        <>
          {group(
            "waiting-changes",
            "waiting.changes",
            waiting.items.filter((item) => !isNewPage(item) && item.kind !== "media"),
          )}
          {files.length > 0 && (
            <section aria-labelledby="waiting-media">
              <h3 id="waiting-media" className="text-body-sm text-txt-black-700 font-semibold">
                {t("waiting.media")}
              </h3>
              <ul className="divide-otl-gray-200 m-0 list-none divide-y p-0">
                {files.map((item) => (
                  <MediaRow key={key(item)} item={item} onNavigate={onNavigate} />
                ))}
              </ul>
            </section>
          )}
          {group("waiting-new", "waiting.new", waiting.items.filter(isNewPage))}
        </>
      )}
      {waiting.items.length > 0 && !canPublish && (
        <p className="text-body-sm text-txt-black-700">{t("waiting.byManager")}</p>
      )}
      {waiting.items.length > 0 && canPublish && outcome.status !== "failed" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary-fill"
            disabled={busy || count === 0}
            onClick={() => setConfirming(true)}
          >
            {busy ? t("publish.busy") : label}
          </Button>
          {count === 0 && !busy && (
            <span className="text-body-sm text-txt-black-700">{t("waiting.pickSome")}</span>
          )}
        </div>
      )}
      {/* What goes public, by name, before it does. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("waiting.confirm.title")}
        description={t("waiting.confirm.description")}
        confirm={label}
        onConfirm={() => void publish()}
      >
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          <ConfirmGroup title="waiting.confirm.updated" items={changes} />
          <ConfirmGroup title="waiting.confirm.new" items={fresh} />
          <ConfirmGroup title="waiting.confirm.siteWide" items={docs} />
          <ConfirmGroup title="waiting.confirm.files" items={files} />
        </div>
      </ConfirmDialog>
    </div>
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

/** "A", "A and B", "A, B and C". */
const listOf = (names: string[]) =>
  new Intl.ListFormat(locale(), { style: "long", type: "conjunction" }).format(names);

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
