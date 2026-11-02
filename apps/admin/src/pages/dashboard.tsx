/**
 * Where an officer lands: their site as visitors see it, whether it's up to
 * date, what's missing from it, and what they were last working on. It edits
 * nothing itself; every line leads to the screen where the work is done.
 */
import {
  type Announcement,
  type Job,
  type PageSummary,
  type SettingsDoc,
  type Summary,
  announcementShowing,
} from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { WeekFigures } from "@/analytics/week-figures";
import { PageFrame } from "@/components/page-frame";
import { PageKindIcon, PageStatusTag } from "@/components/page-status";
import { SiteStateHeading, useSiteState } from "@/components/site-state";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import {
  TaskList,
  TaskListItem,
  TaskListItemHint,
  TaskListItemStatus,
  TaskListItemTitle,
} from "@/components/ui/task-list";
import { type MessageKey, t } from "@/i18n";
import { mediaQuery } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, formatDateTime, previewHref, usePages, useSummary } from "@/lib/pages";
import { siteDocQuery, siteHref, useAnnouncementDoc } from "@/lib/publish";

export function DashboardPage() {
  const summary = useSummary();
  const pages = usePages();
  const settings = useQuery(siteDocQuery("settings"));
  const announcement = useAnnouncementDoc().data?.published;

  if (summary.isError)
    return (
      <div className="p-surface mx-auto max-w-6xl">
        <LoadFailed title="home.loadFailed" onRetry={() => void summary.refetch()} />
      </div>
    );

  // When the pages or the settings fail, say so once and offer the retry, instead of
  // skeletons forever. A failed refetch keeps the last good data on screen, so only a
  // load with nothing to show counts.
  const pagesFailed = pages.isError && !pages.data;
  const settingsFailed = settings.isError && !settings.data;
  const retryParts = () => {
    if (pagesFailed) void pages.refetch();
    if (settingsFailed) void settings.refetch();
  };

  const data = summary.data;
  const home = pages.data?.find((p) => p.parentId === null);
  const live = home ? home.status !== "draft" : undefined;
  const announcing = announcement && announcementShowing(announcement) ? announcement : undefined;
  const lastDone = data?.publishes.find((j) => j.status === "done");

  const setup = data && settings.data && home ? setupTasks(settings.data, home) : null;
  const setupLeft = setup?.filter((task) => task.status !== "completed").length ?? 0;
  const unfinished = setupLeft > 0;

  return (
    <div className="p-surface mx-auto flex max-w-6xl flex-col gap-8">
      <Identity settings={settings.data} failed={settingsFailed} summary={data} />

      {(pagesFailed || settingsFailed) && (
        <LoadFailed
          title={
            pagesFailed && settingsFailed
              ? "dashboard.loadFailed.both"
              : pagesFailed
                ? "dashboard.loadFailed.pages"
                : "dashboard.loadFailed.settings"
          }
          onRetry={retryParts}
        />
      )}

      {/* Sections sit far apart and keep their own parts close, so each reads as one
          group without a box around it. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr_auto] lg:items-start">
        {/*
          Source order is the phone's order; on wide screens each block takes its place.
          What the officer came for (the status, then what's left to do) takes the wide
          column; the picture and the recent edits support it in the narrow one. The
          setup list and the picture span the flexible middle row, so each column
          stacks tightly instead of waiting for the other's first block.
        */}
        <div className="gap-stack-md flex flex-col lg:col-start-1 lg:row-start-1">
          {data ? (
            <SiteStatus live={live} announcing={announcing} setupLeft={setupLeft} />
          ) : (
            <Skeleton className="h-44 w-full rounded-lg" />
          )}
          <Button
            variant="default-outline"
            className="md:hidden"
            render={<Link to="/announcement" />}
          >
            <MegaphoneIcon /> {t("dashboard.announce")}
          </Button>
        </div>

        {unfinished && setup && (
          <Setup tasks={setup} className="lg:col-start-1 lg:row-span-2 lg:row-start-2" />
        )}

        <div className="gap-stack-lg flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {home && data ? (
            <SiteThumbnail home={home} live={live ?? false} summary={data} lastDone={lastDone} />
          ) : (
            !pagesFailed && <Skeleton className="aspect-[16/10] w-full rounded-lg" />
          )}
          <WeekFigures />
        </div>

        <RecentEdits
          pages={data?.recentEdits}
          // With setup done, the edits move up under the status in the wide column.
          className={
            unfinished
              ? "lg:col-start-2 lg:row-start-3"
              : "lg:col-start-1 lg:row-span-2 lg:row-start-2"
          }
        />
      </div>
    </div>
  );
}

/** Something the dashboard needs didn't load: what's missing, and a way to try again. */
function LoadFailed({ title, onRetry }: { title: MessageKey; onRetry: () => void }) {
  return (
    <Callout variant="danger">
      <CalloutTitle>{t(title)}</CalloutTitle>
      <CalloutContent>{t("common.tryAgain")}</CalloutContent>
      <CalloutAction>
        <Button variant="default-outline" size="small" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      </CalloutAction>
    </Callout>
  );
}

/** The site's name and agency, with its logo and address: whose website this is. */
function Identity({
  settings,
  failed,
  summary,
}: {
  settings: SettingsDoc | undefined;
  /** The settings couldn't be loaded: the page still gets its heading. */
  failed: boolean;
  summary: Summary | undefined;
}) {
  const identity = settings?.published.identity;
  const logo = useQuery(mediaQuery(identity?.logo?.mediaId));
  const url = summary?.site.url;

  return (
    <header className="flex flex-wrap items-center gap-4">
      {logo.data ? (
        <img
          src={logo.data.thumbnailUrl}
          alt=""
          className="bg-bg-white size-12 shrink-0 rounded-md object-contain"
        />
      ) : identity ? (
        <span
          aria-hidden
          className="bg-bg-primary-600 text-txt-white grid size-12 shrink-0 place-content-center rounded-md text-xl font-semibold"
        >
          {identity.siteName.trim().charAt(0).toUpperCase()}
        </span>
      ) : (
        !failed && <Skeleton className="size-12 shrink-0 rounded-md" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {identity ? (
          <h1 className="text-headline truncate font-semibold">{identity.siteName}</h1>
        ) : failed ? (
          <h1 className="text-headline truncate font-semibold">{t("nav.dashboard")}</h1>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        {identity && (
          <p className="text-txt-black-700 truncate">
            {identity.agencyName || t("home.noAgency")}
            {url && (
              <>
                {" · "}
                <a href={url} target="_blank" rel="noopener" className={linkClass}>
                  {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <span className="sr-only"> {t("publish.newTab")}</span>
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <Button
        variant="default-outline"
        className="max-md:hidden"
        render={<Link to="/announcement" />}
      >
        <MegaphoneIcon /> {t("dashboard.announce")}
      </Button>
    </header>
  );
}

/** One sentence on whether the site is up to date, and the way forward when it isn't. */
function SiteStatus({
  live,
  announcing,
  setupLeft,
}: {
  live: boolean | undefined;
  announcing: Announcement | undefined;
  /** Setup tasks not yet done, listed in full under "Finish setting up your site". */
  setupLeft: number;
}) {
  const { state, waiting, lastAt } = useSiteState(live);
  const { fresh } = waiting;

  const freshLine = fresh > 0 && (
    <>
      {t("home.status.fresh", { count: fresh })}{" "}
      <Link to="/publishing" className={linkClass}>
        {t("home.status.freshReview", { count: fresh })}
      </Link>
    </>
  );
  const body: ReactNode =
    state === "failed" ? (
      <>
        {t("home.status.failedBody")}{" "}
        <Link to="/publishing" className={linkClass}>
          {t("home.seeWhy")}
        </Link>
      </>
    ) : state === "notPublished" ? (
      t("home.status.notPublishedBody")
    ) : state === "publishing" ? null : (
      freshLine
    );
  const needsPublish = state === "notPublished" || state === "waiting";
  const rowClass = "flex flex-wrap items-center gap-x-2 gap-y-1 py-3 last:pb-0";

  return (
    <section
      aria-labelledby="status-heading"
      className="bg-bg-washed gap-stack-md flex flex-col rounded-lg p-5"
    >
      <SiteStateHeading state={state} count={waiting.count}>
        {body}
      </SiteStateHeading>

      {needsPublish && (
        <div>
          <Button variant="primary-fill" render={<Link to="/publishing" />}>
            {t("home.review")}
          </Button>
        </div>
      )}

      <ul className="divide-otl-gray-200 border-otl-gray-200 m-0 flex list-none flex-col divide-y border-t p-0">
        <li className={rowClass}>
          {/* After a failure this still says when the site last changed: the version visitors see. */}
          <span className="text-txt-black-700" title={lastAt && formatDateTime(lastAt)}>
            {lastAt
              ? t("home.lastPublished", { ago: formatAgo(lastAt) })
              : t("home.neverPublished")}
          </span>
        </li>
        {setupLeft > 0 && (
          <li className={rowClass}>
            <a href="#setup-heading" className={linkClass}>
              {t("home.status.setupLeft", { count: setupLeft })}
            </a>
          </li>
        )}
        {announcing && (
          <li className={rowClass}>
            <Tag size="small" variant="warning">
              {t("home.announcement")}
            </Tag>
            <span className="text-txt-black-700 min-w-0">
              {announcing.until
                ? t("home.announcementUntil", { date: formatDateTime(announcing.until) })
                : t("home.announcementNoEnd")}
            </span>
            <Link to="/announcement" className={linkClass}>
              {t("home.announcementManage")}
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * The home page as visitors see it, as a still picture. The whole picture is
 * one link to the site. Before the first publish it shows the draft,
 * labelled as such.
 */
function SiteThumbnail({
  home,
  live,
  summary,
  lastDone,
}: {
  home: PageSummary;
  live: boolean;
  summary: Summary;
  lastDone: Job | undefined;
}) {
  // A new publish gives it a new address, which redraws it.
  const src = live ? `/render/live?v=${lastDone?.id ?? ""}` : previewHref(home.id);
  const url = summary.site.url;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <PageFrame
        src={src}
        path={url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "/"}
        title={t("home.thumbnail.title")}
        className="aspect-[16/10]"
        overlay={
          <a
            href={live ? siteHref(summary, "/") : previewHref(home.id)}
            target="_blank"
            rel="noopener"
            className="focus-ring absolute inset-0 rounded-b-lg"
          >
            <span className="sr-only">
              {live ? t("home.thumbnail.open") : t("home.thumbnail.openPreview")}
              {` ${t("publish.newTab")}`}
            </span>
            {!live && (
              <span className="absolute top-3 left-3">
                <Tag size="small">{t("home.thumbnail.draft")}</Tag>
              </span>
            )}
          </a>
        }
      />
      <figcaption className="text-body-sm text-txt-black-700">
        {live && lastDone
          ? t("home.thumbnail.liveSince", {
              date: formatDateTime(lastDone.finishedAt ?? lastDone.createdAt),
            })
          : live
            ? t("home.thumbnail.live")
            : t("home.thumbnail.draftCaption")}
      </figcaption>
    </figure>
  );
}

type TaskStatus = "completed" | "in-progress" | "not-started";
type SetupTask = {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  status: TaskStatus;
  /** Where in the admin it's done. */
  to: { section: "identity" | "contact" } | "publishing";
};

/** Live, saved but not live, or not started. */
const state = (published: boolean, draft: boolean): TaskStatus =>
  published ? "completed" : draft ? "in-progress" : "not-started";

const contactDone = (c: SettingsDoc["draft"]["contact"]) =>
  Boolean(c.address && (c.phone || c.email));

/**
 * What a site needs before visitors can trust it, and how far each part is. Only
 * what the officer can do in the admin: the site address is set by whoever installed
 * it, so it is never a task they can't finish.
 */
function setupTasks(settings: SettingsDoc, home: PageSummary): SetupTask[] {
  return [
    {
      id: "agency",
      title: "home.setup.agency",
      hint: "home.setup.agencyHint",
      status: state(
        Boolean(settings.published.identity.agencyName),
        Boolean(settings.draft.identity.agencyName),
      ),
      to: { section: "identity" },
    },
    {
      id: "logo",
      title: "home.setup.logo",
      hint: "home.setup.logoHint",
      status: state(
        Boolean(settings.published.identity.logo),
        Boolean(settings.draft.identity.logo),
      ),
      to: { section: "identity" },
    },
    {
      id: "contact",
      title: "home.setup.contact",
      hint: "home.setup.contactHint",
      status: state(contactDone(settings.published.contact), contactDone(settings.draft.contact)),
      to: { section: "contact" },
    },
    {
      id: "publish",
      title: "home.setup.publish",
      hint: "home.setup.publishHint",
      status: home.status === "draft" ? "not-started" : "completed",
      to: "publishing",
    },
  ];
}

const statusLabel: Record<TaskStatus, MessageKey> = {
  completed: "home.setup.done",
  "in-progress": "home.setup.notLive",
  "not-started": "home.setup.todo",
};

/** The basics a site still lacks. Gone once they're all in place, and it never nags. */
function Setup({ tasks, className }: { tasks: SetupTask[]; className?: string }) {
  const done = tasks.filter((task) => task.status === "completed").length;
  return (
    <section aria-labelledby="setup-heading" className={clx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h2 id="setup-heading" className="text-title font-semibold">
          {t("home.setup.title")}
        </h2>
        <p className="text-txt-black-700">
          {t("home.setup.progress", { done, total: tasks.length })}
        </p>
      </div>
      <TaskList>
        {tasks.map((task) => (
          <TaskListItem key={task.id}>
            {task.status === "completed" ? (
              <TaskListItemTitle>{t(task.title)}</TaskListItemTitle>
            ) : task.to === "publishing" ? (
              <TaskListItemTitle render={<Link to="/publishing" />}>
                {t(task.title)}
              </TaskListItemTitle>
            ) : (
              <TaskListItemTitle render={<Link to="/settings" search={task.to} />}>
                {t(task.title)}
              </TaskListItemTitle>
            )}
            <TaskListItemHint>{t(task.hint)}</TaskListItemHint>
            <TaskListItemStatus status={task.status}>
              {t(statusLabel[task.status])}
            </TaskListItemStatus>
          </TaskListItem>
        ))}
      </TaskList>
    </section>
  );
}

/** What the officer, or whoever had the site before them, last worked on. */
function RecentEdits({
  pages,
  className,
}: {
  pages: PageSummary[] | undefined;
  className?: string;
}) {
  return (
    <section aria-labelledby="edits-heading" className={clx("flex flex-col gap-4", className)}>
      <h2 id="edits-heading" className="text-title font-semibold">
        {t("dashboard.edits.title")}
      </h2>
      {!pages ? (
        <Skeleton className="h-48 w-full" />
      ) : pages.length === 0 ? (
        <p className="text-txt-black-700">{t("home.edits.none")}</p>
      ) : (
        // Each row is one quiet link, washed on hover like the setup list beside it,
        // so the setup tasks keep the only blue links on the screen.
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {pages.slice(0, 6).map((page) => (
            <li key={page.id}>
              <Link
                to="/pages/$id"
                params={{ id: page.id }}
                className="focus-ring hover:bg-bg-washed flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-150 motion-reduce:transition-none"
              >
                <PageKindIcon
                  page={page}
                  aria-hidden
                  className="text-txt-black-500 mt-0.5 size-5 shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-txt-black-900 truncate font-medium">
                    {page.title || t("page.untitled")}
                  </span>
                  <span className="text-body-sm text-txt-black-500 flex min-w-0 items-center gap-2">
                    <PageStatusTag status={page.status} />
                    <span className="truncate">
                      <span title={formatDateTime(page.updatedAt)}>
                        {formatAgo(page.updatedAt)}
                      </span>
                      {` · ${page.path}`}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
