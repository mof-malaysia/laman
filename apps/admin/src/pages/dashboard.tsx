/**
 * Where an officer lands, laid out like the Pages index: a washed canvas of
 * cards. Whose site it is, one banner on whether it's up to date, four figures
 * with their trend, then what's left to set up and what was edited lately, with
 * the site as visitors see it, shortcuts and its health on the right. It edits
 * nothing itself; every card leads to the screen where the work is done.
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
import { formatCount, rangeDays, todayIn } from "@/analytics/range";
import { type Delta, analyticsSummaryQuery, delta, useAnalyticsStatus } from "@/analytics/report";
import { Sparkline } from "@/analytics/sparkline";
import { card } from "@/components/card";
import { PageFrame } from "@/components/page-frame";
import { type SiteState, sentenceOf, siteStateIcons, useSiteState } from "@/components/site-state";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { Progress, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatDelta, StatDescription, StatLabel, StatValue } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { mediaQuery } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { backupHealth } from "@/lib/backups";
import { clx } from "@/lib/ftds/utils";
import { formatAgo, formatDateTime, previewHref, usePages, useSummary } from "@/lib/pages";
import { hostOf, siteDocQuery, siteHref, useAnnouncementDoc } from "@/lib/publish";
import { formatBytes } from "@/media/format";
import { EditLink } from "@/pages/site/pages-index";
import { KindGlyph, PlusGlyph } from "@/pages/site/line-icons";
import { StateLabel, stateOf } from "@/pages/site/page-state";
import { useShell } from "@/shell/context";
import { Screen } from "@/components/screen";
import { PageHeaderTitle } from "@/components/ui/page-header";

/** Every card on the canvas: white, with the Pages index's hairline. */
const tile = clx(card, "border-otl-gray-200 rounded-xl");

export function DashboardPage() {
  const summary = useSummary();
  const pages = usePages();
  const settings = useQuery(siteDocQuery("settings"));
  const announcement = useAnnouncementDoc().data?.published;

  if (summary.isError)
    return (
      <Screen className="text-body-sm">
        <LoadFailed title="home.loadFailed" onRetry={() => void summary.refetch()} />
      </Screen>
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

  return (
    <Screen className="text-body-sm">
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

      {data ? <Banner live={live} /> : <Skeleton className="h-14 w-full rounded-xl" />}

      <Figures summary={data} />

      <div className="gap-stack-lg grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="gap-stack-lg flex min-w-0 flex-col">
          {setup && <Setup tasks={setup} />}
          <RecentEdits pages={data?.recentEdits} />
        </div>
        <aside className="gap-stack-lg flex min-w-0 flex-col">
          {home && data ? (
            <SiteThumbnail home={home} live={live ?? false} summary={data} lastDone={lastDone} />
          ) : (
            !pagesFailed && <Skeleton className="aspect-[16/11] w-full rounded-xl" />
          )}
          <Shortcuts />
          {data && <Health summary={data} announcing={announcing} />}
        </aside>
      </div>
    </Screen>
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

/** The site's name and agency, with its logo and address, and the two things started from here. */
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
  const shell = useShell();
  const identity = settings?.published.identity;
  const logo = useQuery(mediaQuery(identity?.logo?.mediaId));
  const url = summary?.site.url;

  return (
    <header className="flex flex-wrap items-center gap-4">
      {logo.data ? (
        <img
          src={logo.data.thumbnailUrl}
          alt=""
          className="bg-bg-white border-otl-gray-200 h-14 w-auto max-w-32 shrink-0 rounded-xl border object-contain p-1.5"
        />
      ) : identity ? (
        <span
          aria-hidden
          className="bg-bg-primary-600 text-txt-white text-title grid size-14 shrink-0 place-content-center rounded-xl font-semibold"
        >
          {identity.siteName.trim().charAt(0).toUpperCase()}
        </span>
      ) : (
        !failed && <Skeleton className="size-14 shrink-0 rounded-xl" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {identity || failed ? (
          <PageHeaderTitle size="headline" className="truncate">
            {identity ? identity.siteName : t("nav.dashboard")}
          </PageHeaderTitle>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        {identity && (
          <p className="text-body-md text-txt-black-700 truncate">
            {identity.agencyName || t("home.noAgency")}
            {url && (
              <>
                {" · "}
                <a href={url} target="_blank" rel="noopener" className={linkClass}>
                  {hostOf(url)}
                  <span className="sr-only"> {t("publish.newTab")}</span>
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <Button variant="default-outline" render={<Link to="/announcement" />}>
        <MegaphoneIcon /> {t("dashboard.announce")}
      </Button>
      <Button variant="primary-fill" onClick={() => shell.newPage()}>
        <PlusGlyph className="size-5" /> {t("commands.newPage")}
      </Button>
    </header>
  );
}

/** The banner's colours by state: the state's wash, with a matching hairline. */
const bannerTones: Record<SiteState, string> = {
  publishing: "bg-bg-white border-otl-gray-200",
  failed: "bg-bg-danger-50 border-otl-danger-200",
  notPublished: "bg-bg-warning-50 border-otl-warning-200",
  waiting: "bg-bg-warning-50 border-otl-warning-200",
  publishedLive: "bg-bg-success-50 border-otl-success-200",
  live: "bg-bg-success-50 border-otl-success-200",
};

/** Whether the site is up to date, as one line the width of the page, and the way forward. */
function Banner({ live }: { live: boolean | undefined }) {
  const { state, waiting, lastAt } = useSiteState(live);
  return (
    <section
      aria-label={t("dashboard.status")}
      aria-live="polite"
      className={clx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3",
        bannerTones[state],
      )}
    >
      <span aria-hidden className="[&_svg]:size-5">
        {siteStateIcons[state]}
      </span>
      <p className="text-body-md min-w-0 flex-1">
        <span className="text-txt-black-900 font-semibold">{sentenceOf(state, waiting.count)}</span>
        <span className="text-txt-black-700 ml-2">{bannerLine(state, waiting.fresh, lastAt)}</span>
      </p>
      {(state === "notPublished" || state === "waiting") && (
        <Button variant="primary-fill" size="small" render={<Link to="/publishing" />}>
          {t("home.review")}
        </Button>
      )}
    </section>
  );
}

/** The banner's second line: why, or what next, or when the site last changed. */
function bannerLine(state: SiteState, fresh: number, lastAt: string | undefined): ReactNode {
  switch (state) {
    case "publishing":
      return null;
    case "failed":
      return (
        <>
          {t("home.status.failedBody")}{" "}
          <Link to="/publishing" search={{ tab: "history" }} className={linkClass}>
            {t("home.seeWhy")}
          </Link>
        </>
      );
    case "notPublished":
      return t("home.status.notPublishedBody");
    case "publishedLive":
      return (
        <>
          {t("home.status.fresh", { count: fresh })}{" "}
          <Link to="/publishing" className={linkClass}>
            {t("home.status.freshReview", { count: fresh })}
          </Link>
        </>
      );
    default:
      return lastAt
        ? t("home.lastPublished", { ago: formatAgo(lastAt, { inline: true }) })
        : t("home.neverPublished");
  }
}

/** Visitors and views this week with their trend, then pages and media: each a way in. */
function Figures({ summary }: { summary: Summary | undefined }) {
  const status = useAnalyticsStatus();
  const counting = Boolean(status.data?.since);
  const traffic = useQuery({
    ...analyticsSummaryQuery(rangeDays({ range: "7d" }, todayIn(status.data?.timeZone))),
    enabled: counting,
  });
  const report = traffic.data;
  // As on the Analytics screen: no change shown when the week before had nothing.
  const compare = Boolean(report && report.previous.views > 0);

  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-4">
      {(["visitors", "views"] as const).map((key) => (
        <Figure
          key={key}
          to="/analytics"
          label={t(`analytics.${key}`)}
          value={report && formatCount(report.current[key])}
          change={
            report && compare
              ? delta(report.current[key], report.previous[key], "count")
              : undefined
          }
          sub={counting ? t("dashboard.analytics.title") : t("dashboard.figures.notCounting")}
          // Empty until there's a week to draw; the card keeps the line's height.
          spark={report?.series.map((p) => p[key]) ?? []}
          // Not counting: a dash, not a skeleton that never resolves.
          pending={counting && !report}
        />
      ))}
      <Figure
        to="/pages"
        label={t("nav.pages")}
        value={summary && formatCount(summary.pages.total)}
        sub={
          summary &&
          (summary.pages.drafts
            ? t("dashboard.figures.drafts", { count: summary.pages.drafts })
            : t("dashboard.figures.allPublished"))
        }
        pending={!summary}
      />
      <Figure
        to="/media"
        label={t("nav.media")}
        value={summary && formatCount(summary.media.count)}
        sub={summary && formatBytes(summary.media.bytes)}
        pending={!summary}
      />
    </ul>
  );
}

const deltaTone = { up: "success", down: "danger", none: "neutral" } as const;

/** One FTDS Stat as a card that leads to its screen, with its trend line when it has one. */
function Figure({
  to,
  label,
  value,
  change,
  sub,
  spark,
  pending,
}: {
  to: "/analytics" | "/pages" | "/media";
  label: string;
  value: string | undefined;
  change?: Delta;
  sub: string | undefined;
  spark?: number[];
  pending: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        className={clx(
          tile,
          "hover:border-otl-gray-300 focus-ring block h-full no-underline transition-[border-color] duration-150 ease-out",
        )}
      >
        <Stat surface="none" className="h-full p-4">
          <StatLabel className="flex items-center justify-between">
            {label}
            <ChevronRightIcon className="text-txt-black-400 size-4" />
          </StatLabel>
          {pending ? <Skeleton className="h-8 w-20" /> : <StatValue>{value ?? "—"}</StatValue>}
          {change && (
            <StatDelta
              direction={change.direction}
              tone={deltaTone[change.direction]}
              directionLabels={{ up: t("analytics.delta.up"), down: t("analytics.delta.down") }}
            >
              {change.text}
            </StatDelta>
          )}
          <StatDescription>{sub}</StatDescription>
          {spark && <Sparkline values={spark} className="mt-auto pt-2" />}
        </Stat>
      </Link>
    </li>
  );
}

type TaskStatus = "completed" | "in-progress" | "not-started";
type SetupTask = {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  status: TaskStatus;
  /** The Settings section it's done in; none for the first publish, done on Publishing. */
  section?: "identity" | "contact";
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
      section: "identity",
    },
    {
      id: "logo",
      title: "home.setup.logo",
      hint: "home.setup.logoHint",
      status: state(
        Boolean(settings.published.identity.logo),
        Boolean(settings.draft.identity.logo),
      ),
      section: "identity",
    },
    {
      id: "contact",
      title: "home.setup.contact",
      hint: "home.setup.contactHint",
      status: state(contactDone(settings.published.contact), contactDone(settings.draft.contact)),
      section: "contact",
    },
    {
      id: "publish",
      title: "home.setup.publish",
      hint: "home.setup.publishHint",
      status: home.status === "draft" ? "not-started" : "completed",
    },
  ];
}

/** The basics a site still lacks, as a bar and a card each. Gone once they're all in place. */
function Setup({ tasks }: { tasks: SetupTask[] }) {
  const left = tasks.filter((task) => task.status !== "completed");
  if (left.length === 0) return null;
  const done = tasks.length - left.length;
  return (
    <section aria-labelledby="setup-heading" className={clx(tile, "flex flex-col gap-3 p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="setup-heading" className="text-body-md text-txt-black-900 font-semibold">
          {t("home.setup.title")}
        </h2>
        <span className="text-txt-black-500 tabular-nums">
          {t("home.setup.progress", { done, total: tasks.length })}
        </span>
      </div>
      <Progress value={done} max={tasks.length} aria-labelledby="setup-heading">
        <ProgressTrack />
      </Progress>
      <ul className="m-0 mt-1 grid list-none gap-2 p-0 sm:grid-cols-2">
        {left.map((task) => (
          <li key={task.id}>
            <Link
              to={task.section ? "/settings" : "/publishing"}
              search={task.section ? { section: task.section } : undefined}
              className="border-otl-gray-200 hover:border-otl-gray-300 hover:bg-bg-washed focus-ring flex h-full flex-col gap-0.5 rounded-lg border px-3.5 py-3 no-underline transition-colors duration-150 ease-out"
            >
              <span className="text-txt-black-900 flex items-center justify-between gap-2 font-medium">
                {t(task.title)}
                {task.status === "in-progress" && (
                  <Tag size="small" variant="warning">
                    {t("home.setup.notLive")}
                  </Tag>
                )}
              </span>
              <span className="text-txt-black-500">{t(task.hint)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the officer, or whoever had the site before them, last worked on: one row a page. */
function RecentEdits({ pages }: { pages: PageSummary[] | undefined }) {
  return (
    <section aria-labelledby="edits-heading" className={tile}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <h2 id="edits-heading" className="text-body-md text-txt-black-900 font-semibold">
          {t("dashboard.edits.title")}
        </h2>
        <Link to="/pages" className={linkClass}>
          {t("dashboard.edits.all")}
        </Link>
      </div>
      {!pages ? (
        <Skeleton className="mx-5 mb-5 h-48" />
      ) : pages.length === 0 ? (
        <p className="text-txt-black-700 px-5 pb-5">{t("home.edits.none")}</p>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">{t("dashboard.column.page")}</TableHead>
              <TableHead className="w-28">{t("dashboard.column.state")}</TableHead>
              <TableHead className="w-32 max-md:hidden">{t("dashboard.column.by")}</TableHead>
              <TableHead numeric className="w-28 pr-5">
                {t("dashboard.column.edited")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.slice(0, 6).map((page) => (
              <TableRow key={page.id} className="hover:bg-bg-washed relative">
                <TableCell className="pl-5">
                  <EditLink id={page.id} className="flex items-center gap-2.5 font-medium">
                    <KindGlyph page={page} className="text-txt-black-500 size-4 shrink-0" />
                    <span className="truncate">{page.title || t("page.untitled")}</span>
                    <span className="text-txt-black-500 truncate font-normal max-lg:hidden">
                      {page.path}
                    </span>
                  </EditLink>
                </TableCell>
                <TableCell>
                  <StateLabel state={stateOf(page)} />
                </TableCell>
                <TableCell className="text-txt-black-700 truncate max-md:hidden">
                  {page.editedBy ?? "—"}
                </TableCell>
                <TableCell
                  numeric
                  className="text-txt-black-500 pr-5 whitespace-nowrap"
                  title={formatDateTime(page.updatedAt)}
                >
                  {formatAgo(page.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/**
 * The home page as visitors see it, as a still picture that links to the site.
 * Before the first publish it shows the draft, labelled as such.
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
    <figure className={clx(tile, "m-0 flex flex-col gap-3 p-3")}>
      <PageFrame
        src={src}
        path={url ? hostOf(url) : "/"}
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
      <figcaption className="text-label-compact text-txt-black-700 px-1 pb-1">
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

/** The site's other screens, by the job rather than the name. */
function Shortcuts() {
  const canManagePeople = useCan("users.manage");
  const shortcuts: {
    to: "/navigation" | "/theme" | "/search" | "/users" | "/settings";
    label: MessageKey;
  }[] = [
    { to: "/navigation", label: "dashboard.shortcuts.navigation" },
    { to: "/theme", label: "dashboard.shortcuts.colours" },
    { to: "/search", label: "dashboard.shortcuts.search" },
    ...(canManagePeople ? [{ to: "/users", label: "dashboard.shortcuts.users" } as const] : []),
    { to: "/settings", label: "dashboard.shortcuts.settings" },
  ];
  return (
    <nav aria-labelledby="shortcuts-heading" className={clx(tile, "py-2")}>
      <h2
        id="shortcuts-heading"
        className="text-label-compact text-txt-black-500 px-5 pt-2 pb-1 font-medium"
      >
        {t("dashboard.shortcuts.title")}
      </h2>
      <ul className="m-0 list-none p-0">
        {shortcuts.map((s) => (
          <li key={s.to}>
            <Link
              to={s.to}
              className="text-txt-black-900 hover:bg-bg-washed focus-ring-inset flex items-center justify-between px-5 py-2 no-underline"
            >
              {t(s.label)}
              <ChevronRightIcon className="text-txt-black-400 size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The quiet facts: backups, the renderer, the announcement and the build. */
function Health({
  summary,
  announcing,
}: {
  summary: Summary;
  announcing: Announcement | undefined;
}) {
  const backup = backupHealth(summary.backup);
  return (
    <section aria-labelledby="health-heading" className={clx(tile, "p-5")}>
      <h2 id="health-heading" className="text-body-md text-txt-black-900 font-semibold">
        {t("dashboard.health.title")}
      </h2>
      <dl className="m-0 mt-3 flex flex-col gap-2.5">
        <Fact label={t("dashboard.health.backup")}>
          {backup === "ok" ? (
            <span title={formatDateTime(summary.backup.last!.at)}>
              {formatAgo(summary.backup.last!.at)}
            </span>
          ) : (
            <Link to="/settings" search={{ section: "backups" }} className="no-underline">
              <Tag
                size="small"
                variant={backup === "failed" || backup === "offsiteFailed" ? "danger" : "warning"}
              >
                {t(`home.backup.${backup}`)}
              </Tag>
            </Link>
          )}
        </Fact>
        {announcing && (
          <Fact label={t("dashboard.health.announcement")}>
            <Link to="/announcement" className={linkClass}>
              {announcing.until
                ? t("dashboard.health.announcementUntil", {
                    date: formatDateTime(announcing.until),
                  })
                : t("dashboard.health.announcementOn")}
            </Link>
          </Fact>
        )}
        <Fact label={t("dashboard.health.renderer")}>
          {summary.renderer.ok ? (
            t("dashboard.health.rendererOk")
          ) : (
            <span className="text-txt-danger">{t("dashboard.health.rendererDown")}</span>
          )}
        </Fact>
        <Fact label={t("dashboard.health.database")}>
          {formatBytes(summary.site.databaseBytes)}
        </Fact>
        <Fact label={t("dashboard.health.version")}>v{summary.site.version}</Fact>
      </dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-txt-black-500">{label}</dt>
      <dd className="text-txt-black-900 m-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}
