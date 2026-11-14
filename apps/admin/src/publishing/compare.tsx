/**
 * Ready to publish: every waiting change down the left, ticked or not, and
 * the chosen one on the right as the live site has it beside what publishing
 * will make of it, block by block.
 */
import type { WaitingItem } from "@laman/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { card } from "@/components/card";
import { StatusDot } from "@/components/page-status";
import { stops } from "@/components/page-checks";
import { Actions, ChecksNote, type WaitingPublish, itemName, key } from "@/components/waiting-list";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { pagesApi } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { clx } from "@/lib/ftds/utils";
import { type PageChange, changeMarks, pageChanges } from "@/lib/page-diff";
import { formatAgo, formatDateTime, previewHref, revisionQuery, revisionsQuery } from "@/lib/pages";
import { docName } from "@/lib/publish";
import { EyeGlyph } from "@/pages/site/line-icons";
import { AllLive } from "./all-live";

export function Compare({
  state,
  item: open,
}: {
  state: WaitingPublish;
  item: string | undefined;
}) {
  const navigate = useNavigate();
  const canPublish = useCan("content.publish");
  const { waiting } = state;
  const groups = (
    [
      ["waiting.changes", state.changes],
      ["waiting.media", state.files],
      ["waiting.new", state.fresh],
    ] as const
  ).filter(([, group]) => group.length > 0);
  const item = waiting.items.find((i) => key(i) === open) ?? waiting.items[0];
  const choose = (i: WaitingItem) =>
    void navigate({ to: "/publishing", search: { item: key(i) }, replace: true });

  if (waiting.isPending) return <Skeleton className="min-h-96 flex-1 rounded-xl" />;
  if (!item) return <AllLive />;

  return (
    <div
      className={clx(
        card,
        "border-otl-gray-200 grid min-h-0 flex-1 grid-cols-1 rounded-xl md:grid-cols-[18.75rem_minmax(0,1fr)]",
      )}
    >
      <nav
        aria-label={t("publishing.compare.list")}
        className="border-otl-gray-200 min-h-0 overflow-y-auto border-b p-2 md:border-r md:border-b-0"
      >
        {groups.map(([title, group]) => (
          <section key={title} aria-label={t(title)}>
            <h2 className="text-label-compact text-txt-black-500 px-3 pt-3 pb-1 font-medium first:pt-1">
              {t(title)}
            </h2>
            <ul className="m-0 list-none p-0">
              {group.map((i) => (
                <ListRow
                  key={key(i)}
                  item={i}
                  state={state}
                  on={key(i) === key(item)}
                  canPublish={canPublish}
                  onChoose={() => choose(i)}
                />
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <Pane key={key(item)} item={item} state={state} />
    </div>
  );
}

function ListRow({
  item,
  state,
  on,
  canPublish,
  onChoose,
}: {
  item: WaitingItem;
  state: WaitingPublish;
  on: boolean;
  canPublish: boolean;
  onChoose: () => void;
}) {
  const checks = state.checksOf(item);
  const sub =
    item.kind === "page"
      ? [formatAgo(item.updatedAt), item.editedBy].filter(Boolean).join(" · ")
      : item.kind === "media"
        ? t("waiting.mediaHint")
        : t("waiting.doc");
  return (
    <li
      className={clx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150 ease-out motion-reduce:transition-none",
        on ? "bg-bg-primary-50" : "hover:bg-bg-washed",
      )}
    >
      {/* A replaced file has no tick: any publish takes it live. */}
      {canPublish && item.kind !== "media" && (
        <Checkbox
          checked={state.goes(item)}
          disabled={stops(checks) || state.busy}
          onCheckedChange={() => state.toggle(item)}
          aria-label={t("publishing.compare.include", { name: itemName(item) })}
        />
      )}
      <button
        type="button"
        onClick={onChoose}
        aria-current={on ? "true" : undefined}
        className="focus-ring flex min-w-0 flex-1 flex-col rounded-sm text-left"
      >
        <span
          className={clx("truncate font-medium", on ? "text-txt-primary" : "text-txt-black-900")}
        >
          {itemName(item)}
        </span>
        <span className="text-label-compact text-txt-black-500 truncate">{sub}</span>
      </button>
      {checks?.length ? <StatusDot tone={stops(checks) ? "danger" : "warning"} /> : null}
    </li>
  );
}

/** The chosen change: its name and what can be done with it, then what it changes. */
function Pane({ item, state }: { item: WaitingItem; state: WaitingPublish }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const checks = state.checksOf(item);
  const sub =
    item.kind === "page"
      ? [
          item.path,
          item.editedBy && t("waiting.by", { name: item.editedBy }),
          formatAgo(item.updatedAt),
        ]
          .filter(Boolean)
          .join(" · ")
      : item.kind === "media"
        ? formatDateTime(item.replacedAt)
        : t("waiting.doc");

  return (
    <section aria-labelledby="compare-title" className="flex min-h-0 flex-col">
      <div className="border-otl-gray-200 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-4">
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col">
          <h2 id="compare-title" className="text-title text-txt-black-900 truncate font-semibold">
            {itemName(item)}
          </h2>
          <p className="text-body-sm text-txt-black-500 truncate">{sub}</p>
        </div>
        {item.kind === "page" && (
          <>
            <label className="text-body-sm text-txt-black-700 flex cursor-pointer items-center gap-2">
              <Switch checked={onlyChanges} onCheckedChange={setOnlyChanges} />
              {t("publishing.compare.onlyChanges")}
            </label>
            <Button
              variant="default-outline"
              size="small"
              // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- the Button fills it with its label
              render={<a href={previewHref(item.id)} target="_blank" rel="noopener" />}
            >
              <EyeGlyph className="size-4" /> {t("pages.index.preview")}
              <span className="sr-only"> {t("publish.newTab")}</span>
            </Button>
          </>
        )}
        <span className="text-body-sm">
          <Actions item={item} />
        </span>
      </div>
      {item.kind === "page" && checks?.length ? (
        <div
          className={clx(
            "border-b px-6 py-2.5",
            stops(checks)
              ? "bg-bg-danger-50 border-otl-danger-200"
              : "bg-bg-warning-50 border-otl-warning-200",
          )}
        >
          <ChecksNote pageId={item.id} checks={checks} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {item.kind === "page" ? (
          <PageCompare
            id={item.id}
            fresh={item.new}
            updatedAt={item.updatedAt}
            onlyChanges={onlyChanges}
          />
        ) : (
          <p className="text-body-md text-txt-black-700 px-6 py-6">
            {item.kind === "media"
              ? t("publishing.compare.media")
              : t("publishing.compare.doc", { name: t(docName[item.kind]) })}
          </p>
        )}
      </div>
    </section>
  );
}

/** The live revision beside the draft. A page never published has no live side. */
function PageCompare({
  id,
  fresh,
  updatedAt,
  onlyChanges,
}: {
  id: string;
  fresh: boolean;
  updatedAt: string;
  onlyChanges: boolean;
}) {
  const page = useQuery({ queryKey: ["page", id], queryFn: () => pagesApi.get(id) });
  const revisions = useQuery({ ...revisionsQuery(id, updatedAt), enabled: !fresh });
  const liveId = revisions.data?.find((r) => r.live)?.id;
  const live = useQuery(revisionQuery(id, liveId));
  // Kept between renders: the summary polls often, and diffing parses every block.
  const draft = page.data?.draft;
  const liveDoc = fresh ? undefined : live.data?.content;
  const changes = useMemo(() => (draft ? pageChanges(liveDoc, draft) : []), [liveDoc, draft]);
  const changed = useMemo(() => changes.filter((c) => c.kind !== "same"), [changes]);

  if (page.isError || revisions.isError || live.isError)
    return (
      <div className="p-6">
        <Callout variant="danger">
          <CalloutTitle>{t("publishing.compare.loadFailed")}</CalloutTitle>
          <CalloutContent>{t("common.tryAgain")}</CalloutContent>
        </Callout>
      </div>
    );
  const ready = page.data && (fresh || (revisions.data && (liveId === undefined || live.data)));
  if (!ready)
    return (
      <div className="flex flex-col gap-3 p-6">
        <span className="sr-only">{t("editor.loading")}</span>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );

  const same = changes.length - changed.length;
  const shown = onlyChanges ? changed : changes;

  return (
    <div>
      {fresh && (
        <p className="bg-bg-washed text-txt-black-700 px-6 py-3">{t("publishing.compare.new")}</p>
      )}
      {shown.length > 0 && (
        <>
          <div
            aria-hidden
            className="text-label-compact text-txt-black-500 border-otl-gray-200 bg-bg-white sticky top-0 z-10 grid grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b px-6 py-2 font-medium"
          >
            <span>{t("publishing.compare.block")}</span>
            <span>{t("publishing.compare.now")}</span>
            <span>{t("publishing.compare.after")}</span>
          </div>
          <ol className="m-0 list-none p-0">
            {shown.map((change) => (
              <ChangeRow key={`${change.kind}-${change.id}`} change={change} />
            ))}
          </ol>
        </>
      )}
      <p className="text-body-sm text-txt-black-500 px-6 py-3">
        {shown.length === 0
          ? t("publishing.compare.noChanges")
          : onlyChanges && same > 0
            ? t("publishing.compare.same", { count: same })
            : null}
      </p>
    </div>
  );
}

/** One block, or one part of the page: its name and state, then both sides. */
function ChangeRow({ change }: { change: PageChange }) {
  // An added block has no before and a removed one no after, so only "same" needs its own tone.
  const plain = change.kind === "same";
  // A changed block lists each field that differs; anything else is one line a side.
  const lines =
    change.kind === "changed" && change.fields.length > 0
      ? change.fields
      : [{ label: "", before: change.before, after: change.after }];
  return (
    <li className="border-otl-gray-200 grid grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 border-b px-6 py-3.5">
      <span className="row-span-full flex flex-col items-start gap-1">
        <span className="text-body-sm text-txt-black-900 font-medium">{change.label}</span>
        <Tag size="small" variant={changeMarks[change.kind].variant}>
          {t(changeMarks[change.kind].label)}
        </Tag>
      </span>
      {lines.map((line, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- a block's fields, never reordered
        <div key={i} className="col-span-2 col-start-2 grid grid-cols-subgrid gap-y-1">
          {line.label && (
            <span className="text-label-compact text-txt-black-500 col-span-2">{line.label}</span>
          )}
          <Side text={line.before} tone={plain ? "same" : "out"} />
          <Side text={line.after} tone={plain ? "same" : "in"} />
        </div>
      ))}
    </li>
  );
}

/** One side of a row: what goes, in the danger wash, struck through; what arrives, in the success wash. */
function Side({ text, tone }: { text: string; tone: "in" | "out" | "same" }) {
  if (!text)
    return (
      <span className="text-body-sm text-txt-black-400 px-2.5 py-1.5">
        <span aria-hidden>—</span>
        <span className="sr-only">{t("publishing.compare.nothing")}</span>
      </span>
    );
  return (
    <span
      className={clx(
        "text-body-sm rounded-md px-2.5 py-1.5 break-words",
        tone === "in" && "bg-bg-success-50 text-txt-black-900",
        tone === "out" && "bg-bg-danger-50 text-txt-black-700 line-through decoration-1",
        tone === "same" && "text-txt-black-500",
      )}
    >
      {tone !== "same" && (
        <span className="sr-only">
          {t(tone === "in" ? "publishing.compare.after" : "publishing.compare.now")}:{" "}
        </span>
      )}
      {text}
    </span>
  );
}
