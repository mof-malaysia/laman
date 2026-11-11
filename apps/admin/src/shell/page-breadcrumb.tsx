/**
 * A page's path: Pages › its parents › the page. A parent opens in the editor (a
 * collection, at its entries); the page's own name opens the page switcher. The
 * shell's top bar shows it on a page's screens; the editor shows it in its own bar.
 */
import type { PageSummary } from "@fiscal-sb/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { t } from "@/i18n";
import { usePages } from "@/lib/pages";
import { useShell } from "./context";

export function PageBreadcrumb({ page }: { page: Pick<PageSummary, "id" | "title" | "parentId"> }) {
  const pages = usePages();
  const shell = useShell();
  const byId = new Map((pages.data ?? []).map((p) => [p.id, p]));
  const parents: PageSummary[] = [];
  // Home is left out: every page sits under it, and "Pages" already stands for the site.
  for (let at = byId.get(page.parentId ?? ""); at?.parentId; at = byId.get(at.parentId))
    parents.unshift(at);
  const title = page.title || t("page.untitled");
  return (
    // One line however deep: the names truncate instead of wrapping the bar.
    <Breadcrumb className="flex-nowrap">
      <BreadcrumbItem>
        <BreadcrumbLink render={<Link to="/pages" />}>{t("nav.pages")}</BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      {parents.map((parent) => (
        <Fragment key={parent.id}>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link
                  to="/pages/$id/edit"
                  params={{ id: parent.id }}
                  // A collection opens at its entries.
                  search={parent.kind === "listing" ? { panel: "entries" } : {}}
                />
              }
            >
              {parent.title || t("page.untitled")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </Fragment>
      ))}
      <BreadcrumbItem aria-current="page">
        {/* The page switcher: the Open page search, which opens what's picked in the editor. */}
        <button
          type="button"
          onClick={shell.openPage}
          aria-haspopup="dialog"
          aria-label={`${title}, ${t("shell.switchPage")}`}
          title={t("shell.switchPage")}
          className="text-txt-black-900 hover:bg-bg-washed focus-ring -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 font-medium transition-colors duration-150 ease-out"
        >
          <span className="truncate">{title}</span>
          <ChevronDownIcon aria-hidden className="text-txt-black-500 size-4 shrink-0" />
        </button>
      </BreadcrumbItem>
    </Breadcrumb>
  );
}
