/**
 * Beside every Publish: is my change saved, is it live, and what did Publish
 * just do? The button publishes only what its label names; the result shows
 * here, with a link to the page on the site as proof. With `review`, Publish
 * first shows what will change and asks.
 */
import type { Job } from "@fiscal-sb/contracts";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { StatusDot, type Tone } from "@/components/page-status";
import { Link } from "@tanstack/react-router";
import { linkClass } from "@/components/text-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { useCan } from "@/lib/auth";
import { clx } from "@/lib/ftds/utils";
import { formatDateTime, formatTime } from "@/lib/pages";
import {
  type LiveState,
  type PublishOutcome,
  SaveFirstError,
  usePublish,
  useSiteHref,
} from "@/lib/publish";

export type SaveState =
  | "saved"
  | "unsaved"
  | "saving"
  | "retrying"
  | "invalid"
  /** Someone else saved since: the conflict dialog asks which to keep. */
  | "conflict"
  /** The sign-in ran out: saving carries on after signing in again. */
  | "signedOut"
  /** No longer allowed to edit it, or it was deleted: nothing more is saved. */
  | "forbidden"
  | "gone";

/** Save states that stop the work reaching the server, said in red. */
const notSaving: ReadonlySet<SaveState> = new Set([
  "retrying",
  "invalid",
  "conflict",
  "signedOut",
  "forbidden",
  "gone",
]);

type Key = Parameters<typeof t>[0];

const saveText: Record<SaveState, Key> = {
  saved: "save.saved",
  saving: "save.saving",
  unsaved: "save.unsaved",
  retrying: "save.retrying",
  invalid: "save.invalid",
  conflict: "save.conflict",
  signedOut: "save.signedOut",
  forbidden: "save.forbidden",
  gone: "save.gone",
};

const liveText: Record<LiveState, Key> = {
  live: "live.live",
  changed: "live.changed",
  new: "live.new",
  scheduled: "live.scheduled",
};

const liveShort: Record<LiveState, Key> = {
  live: "live.live",
  changed: "live.changed.short",
  new: "live.new.short",
  scheduled: "live.scheduled",
};

/** What a finished publish skipped: this page, how many others, or nothing. */
type Skipped = "this" | number;

function skippedBy(outcome: PublishOutcome, pageId: string | undefined): Skipped {
  const skipped = outcome.status === "live" ? (outcome.skipped ?? []) : [];
  return pageId && skipped.some((page) => page.pageId === pageId) ? "this" : skipped.length;
}

function statusLine(
  outcome: PublishOutcome,
  live: LiveState,
  save: SaveState,
  skipped: Skipped,
): { tone: Tone; text: string; short?: string } {
  if (outcome.status === "publishing") return { tone: "neutral", text: t("publish.busy") };
  if (outcome.status === "failed")
    return {
      tone: "danger",
      text:
        outcome.reason !== "save"
          ? t("publish.failedHere")
          : notSaving.has(save)
            ? t(saveText[save])
            : t("publish.saveFailed"),
    };
  if (outcome.status === "live") {
    if (skipped === "this") return { tone: "danger", text: t("publish.thisSkipped") };
    if (skipped)
      return {
        tone: "warning",
        text: t("publish.liveSkipped", { time: formatTime(outcome.at), count: skipped }),
      };
    return { tone: "success", text: t("publish.liveAt", { time: formatTime(outcome.at) }) };
  }
  if (outcome.status === "scheduled")
    return {
      tone: "neutral",
      text: t("publish.scheduledFor", { time: formatDateTime(outcome.at) }),
    };
  if (notSaving.has(save)) return { tone: "danger", text: t(saveText[save]) };
  const state = t(liveText[live]);
  // Where room is short: the live state in two words or fewer.
  const shortState = t(liveShort[live]);
  if (save !== "saved")
    return {
      tone: "neutral",
      text: `${t(saveText[save])} · ${state}`,
      short: `${t(saveText[save])} · ${shortState}`,
    };
  return {
    tone: live === "live" ? "success" : live === "scheduled" ? "neutral" : "warning",
    text: `${t("save.saved")} · ${state}`,
    short: `${t("save.saved")} · ${shortState}`,
  };
}

export function PublishControl({
  live,
  save = "saved",
  savedAt,
  detail,
  label,
  onPublish,
  beforePublish,
  viewPath,
  pageId,
  disabled,
  review,
  badge,
  statusIn,
  compact = false,
}: {
  live: LiveState;
  save?: SaveState;
  savedAt?: string | null | undefined;
  /** More about the live copy, in the tooltip: "Published 28 Oct, 10:42". */
  detail?: string | undefined;
  /** Names what goes live: "Publish page", "Publish settings". */
  label: string;
  onPublish: () => Promise<{ job: Job }>;
  /** Saves anything pending first. */
  beforePublish?: () => Promise<unknown>;
  /** Where to see the result on the site, such as the page's path. */
  viewPath?: string | undefined;
  /** The page being published, so a publish that couldn't build it says so. */
  pageId?: string | undefined;
  disabled?: boolean;
  /** A count on the button, such as the page's checks; `label` says it in words. */
  badge?: { count: number; label: string; danger?: boolean } | undefined;
  /**
   * Where the status goes, when not beside the button: an element elsewhere in the
   * same bar (the editor puts it by undo and redo). Nothing shows until it's mounted.
   */
  statusIn?: HTMLElement | null;
  /** Below extra-large screens, the status in its short words ("Saved · Not live"). */
  compact?: boolean;
  /** What publishing will change, shown in a confirmation before it happens. */
  /** With `blocked`, the confirmation says what's wrong and can't be confirmed. */
  /**
   * `renderBody` instead of `body` gets a way to close the review, to take the
   * officer to what needs fixing; `confirm` renames Publish.
   */
  review?:
    | {
        title: string;
        description: string;
        body?: ReactNode;
        renderBody?: (close: () => void) => ReactNode;
        blocked?: boolean;
        confirm?: string;
      }
    | undefined;
}) {
  const [reviewing, setReviewing] = useState(false);
  const { outcome: last, publish } = usePublish(async () => {
    try {
      await beforePublish?.();
    } catch (error) {
      throw new SaveFirstError("Saving before publishing failed", { cause: error });
    }
    return onPublish();
  });
  const href = useSiteHref(viewPath ?? "/");
  // An edit after publishing starts the story again.
  const outcome: PublishOutcome =
    last.status === "live" && live !== "live" ? { status: "idle" } : last;

  const canPublish = useCan("content.publish");
  const skipped = skippedBy(outcome, pageId);
  const line = statusLine(outcome, live, save, skipped);
  const busy = outcome.status === "publishing";
  const nothingToPublish = live === "live" && save === "saved" && outcome.status !== "failed";

  // Saved and live, and what Publish just did, with its link.
  const status = (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            // Read out as it changes, without taking focus.
            <output
              aria-live={outcome.status === "failed" ? "assertive" : "polite"}
              className={clx(
                "text-body-sm flex min-w-0 items-center gap-2 rounded-md px-2 py-1",
                line.tone === "danger" ? "text-txt-danger" : "text-txt-black-700",
              )}
            />
          }
        >
          <StatusDot tone={line.tone} />
          {compact && line.short ? (
            <>
              <span className="truncate max-xl:hidden">{line.text}</span>
              <span className="truncate xl:hidden">{line.short}</span>
            </>
          ) : (
            <span className="truncate">{line.text}</span>
          )}
        </TooltipTrigger>
        <TooltipContent>
          {savedAt && <div>{t("save.savedAt", { time: formatTime(savedAt) })}</div>}
          {detail && <div>{detail}</div>}
          {!savedAt && !detail && t(liveText[live])}
        </TooltipContent>
      </Tooltip>
      {skipped !== 0 && (
        <Link to="/publishing" className={clx("text-body-sm shrink-0", linkClass)}>
          {t("publish.seeWhy")}
        </Link>
      )}
      {outcome.status === "live" && skipped === 0 && viewPath !== undefined && (
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className={clx("text-body-sm shrink-0", linkClass)}
        >
          {t("publish.view")}
          <span className="sr-only"> {t("publish.newTab")}</span>
        </a>
      )}
    </>
  );

  return (
    // On a phone it takes its own line, the status beside the button.
    <div className="flex min-w-0 items-center gap-2 max-md:w-full max-md:justify-between">
      {statusIn === undefined ? status : statusIn && createPortal(status, statusIn)}
      {!canPublish ? (
        // Editors save; a Content Manager publishes from Publishing.
        live !== "live" && (
          <span className="text-body-sm text-txt-black-500 shrink-0">{t("publish.byManager")}</span>
        )
      ) : nothingToPublish ? (
        // A disabled button takes no pointer events, so the tooltip sits on a wrapper. The
        // status beside it says the same in words for keyboard and screen reader users.
        <Tooltip>
          <TooltipTrigger render={<span className="shrink-0" />}>
            {/* Quiet while there's nothing to do, so blue always means "this will change the site". */}
            <Button className="whitespace-nowrap" variant="default-outline" size="small" disabled>
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("publish.nothing")}</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          className="shrink-0 whitespace-nowrap"
          variant="primary-fill"
          size="small"
          disabled={disabled || busy}
          onClick={() => (review ? setReviewing(true) : void publish())}
        >
          {busy ? t("publish.busy") : outcome.status === "failed" ? t("publish.retry") : label}
          {badge && badge.count > 0 && !busy && (
            <span
              className={clx(
                "text-label-compact rounded-sm px-1.5 py-px font-semibold tabular-nums",
                badge.danger ? "bg-bg-danger-600" : "bg-bg-white/20",
              )}
            >
              <span aria-hidden>{badge.count}</span>
              <span className="sr-only">, {badge.label}</span>
            </span>
          )}
        </Button>
      )}
      {review && (
        <ConfirmDialog
          open={reviewing}
          onOpenChange={setReviewing}
          title={review.title}
          description={review.description}
          confirm={review.confirm ?? label}
          onConfirm={() => void publish()}
          blocked={review.blocked}
        >
          {review.renderBody?.(() => setReviewing(false)) ?? review.body}
        </ConfirmDialog>
      )}
    </div>
  );
}
