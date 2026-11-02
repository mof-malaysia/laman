/**
 * Beside every Publish: is my change saved, is it live, and what did Publish
 * just do? The button publishes only what its label names; the result shows
 * here, with a link to the page on the site as proof. With `review`, Publish
 * first shows what will change and asks.
 */
import type { Job } from "@fiscal-sb/contracts";
import { type ReactNode, useState } from "react";
import { type Tone, toneDot } from "@/components/page-status";
import { linkClass } from "@/components/text-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { formatDateTime, formatTime } from "@/lib/pages";
import {
  type LiveState,
  type PublishOutcome,
  SaveFirstError,
  usePublish,
  useSiteHref,
} from "@/lib/publish";

export type SaveState = "saved" | "unsaved" | "saving" | "retrying" | "invalid";

type Key = Parameters<typeof t>[0];

const saveText: Record<SaveState, Key> = {
  saved: "save.saved",
  saving: "save.saving",
  unsaved: "save.unsaved",
  retrying: "save.retrying",
  invalid: "save.invalid",
};

const liveText: Record<LiveState, Key> = {
  live: "live.live",
  changed: "live.changed",
  new: "live.new",
  scheduled: "live.scheduled",
};

function statusLine(
  outcome: PublishOutcome,
  live: LiveState,
  save: SaveState,
): { tone: Tone; text: string } {
  if (outcome.status === "publishing") return { tone: "neutral", text: t("publish.busy") };
  if (outcome.status === "failed")
    return {
      tone: "danger",
      text: outcome.reason === "save" ? t("publish.saveFailed") : t("publish.failedHere"),
    };
  if (outcome.status === "live")
    return { tone: "success", text: t("publish.liveAt", { time: formatTime(outcome.at) }) };
  if (outcome.status === "scheduled")
    return {
      tone: "neutral",
      text: t("publish.scheduledFor", { time: formatDateTime(outcome.at) }),
    };
  if (save === "retrying" || save === "invalid") return { tone: "danger", text: t(saveText[save]) };
  const state = t(liveText[live]);
  if (save !== "saved") return { tone: "neutral", text: `${t(saveText[save])} · ${state}` };
  return {
    tone: live === "live" ? "success" : live === "scheduled" ? "neutral" : "warning",
    text: `${t("save.saved")} · ${state}`,
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
  disabled,
  review,
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
  disabled?: boolean;
  /** What publishing will change, shown in a confirmation before it happens. */
  /** With `blocked`, the confirmation says what's wrong and can't be confirmed. */
  review?: { title: string; description: string; body: ReactNode; blocked?: boolean } | undefined;
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

  const line = statusLine(outcome, live, save);
  const busy = outcome.status === "publishing";
  const nothingToPublish = live === "live" && save === "saved" && outcome.status !== "failed";

  return (
    // On a phone it takes its own line, the status beside the button.
    <div className="flex min-w-0 items-center gap-2 max-md:w-full max-md:justify-between">
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
          <span aria-hidden className={clx("size-2 shrink-0 rounded-full", toneDot[line.tone])} />
          <span className="truncate">{line.text}</span>
        </TooltipTrigger>
        <TooltipContent>
          {savedAt && <div>{t("save.savedAt", { time: formatTime(savedAt) })}</div>}
          {detail && <div>{detail}</div>}
          {!savedAt && !detail && t(liveText[live])}
        </TooltipContent>
      </Tooltip>
      {outcome.status === "live" && viewPath !== undefined && (
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
      {nothingToPublish ? (
        // A disabled button takes no pointer events, so the tooltip sits on a wrapper. The
        // status beside it says the same in words for keyboard and screen reader users.
        <Tooltip>
          <TooltipTrigger render={<span className="shrink-0" />}>
            <Button className="whitespace-nowrap" variant="primary-fill" size="small" disabled>
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
        </Button>
      )}
      {review && (
        <ConfirmDialog
          open={reviewing}
          onOpenChange={setReviewing}
          title={review.title}
          description={review.description}
          confirm={label}
          onConfirm={() => void publish()}
          blocked={review.blocked}
        >
          {review.body}
        </ConfirmDialog>
      )}
    </div>
  );
}
