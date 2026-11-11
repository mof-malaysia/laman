/** "About this page", in the page drawer's Details tab. */
import { type TemplateId, templates } from "@fiscal-sb/blocks";
import type { Page, PageSummary } from "@fiscal-sb/contracts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Link as TextLink } from "@/components/ui/link";
import { t } from "@/i18n";
import { templateName } from "@/i18n/registry";
import { formatDateTime } from "@/lib/pages";
import { Panel } from "./tab-layout";

/**
 * "About this page": the facts a page or entry has beyond its content, each with
 * where to act on it. `onPanel` switches the page drawer it sits in to another tab.
 */
export function AboutPanel({
  page,
  pages,
  collection,
  onPanel,
}: {
  page: Page;
  pages: PageSummary[];
  collection: PageSummary | undefined;
  onPanel: (panel: "entries" | "history") => void;
}) {
  const entry = page.kind === "entry" ? page.draft.entry : undefined;
  const children = pages.filter((p) => p.parentId === page.id).length;
  const tabLink = (panel: "entries" | "history", label: string) => (
    <TextLink
      primary
      // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the link fills it with its label
      render={<button type="button" onClick={() => onPanel(panel)} />}
    >
      {label}
    </TextLink>
  );
  const created: Fact = {
    term: t("detail.details.created"),
    detail: formatDateTime(page.createdAt),
  };
  const published: Fact = {
    term: t("detail.details.published"),
    detail: page.publishedAt ? formatDateTime(page.publishedAt) : t("detail.details.never"),
    action: tabLink("history", t("detail.details.viewHistory")),
  };
  // An entry is placed by its collection (its date is a field above); a page by its template
  // and what's under it.
  const facts: Fact[] = entry
    ? [
        {
          term: t("detail.details.collection"),
          detail: collection?.title ?? "",
          action: collection && (
            <TextLink
              primary
              render={
                <Link
                  to="/pages/$id/edit"
                  params={{ id: collection.id }}
                  search={{ panel: "entries" }}
                />
              }
            >
              {t("detail.details.openCollection")}
            </TextLink>
          ),
        },
        created,
        published,
      ]
    : [
        // Only worth a line when it's known.
        ...(page.template && page.template in templates
          ? [
              {
                term: t("detail.details.template"),
                detail: templateName(page.template as TemplateId),
              },
            ]
          : []),
        page.kind === "listing"
          ? {
              term: t("detail.tab.entries"),
              detail: t("listing.count", { count: page.entryCount ?? 0 }),
              action: tabLink("entries", t("detail.details.viewEntries")),
            }
          : {
              term: t("detail.details.children"),
              detail: children
                ? t("detail.details.pagesCount", { count: children })
                : t("detail.details.none"),
              action: (
                <TextLink primary render={<Link to="/pages/new" search={{ parent: page.id }} />}>
                  {t("detail.details.addChild")}
                </TextLink>
              ),
            },
        created,
        published,
      ];

  return (
    <Panel title={t("detail.details.about")}>
      {/* One record's facts, a hairline between rows. The fact and its action share a line
          while there's room and stack when there isn't, so a date never breaks mid-way. */}
      <dl className="divide-otl-gray-200 text-body-sm m-0 flex flex-col divide-y">
        {facts.map((fact) => (
          <div key={fact.term} className="flex flex-wrap gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
            <dt className="text-txt-black-700 w-36 shrink-0 font-medium">{fact.term}</dt>
            <dd className="m-0 flex min-w-40 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-txt-black-900 tabular-nums">{fact.detail}</span>
              {fact.action}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** A row of "About this page": the fact, and a link to act on it where there is one. */
type Fact = { term: string; detail: string; action?: ReactNode };
