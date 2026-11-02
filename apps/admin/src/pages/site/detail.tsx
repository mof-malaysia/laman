/** The selected page: its header and actions, then Details, SEO and Settings tabs. */
import { Slug, type TemplateId, templates } from "@fiscal-sb/blocks";
import type { Page, PageSummary } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { PageFrame } from "@/components/page-frame";
import { PageStatusTag, PageKindIcon, redirectTarget } from "@/components/page-status";
import { Backlink } from "@/components/ui/backlink";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { CharacterCount } from "@/components/ui/character-count";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { EllipsisVerticalIcon } from "@/components/ui/icons/ellipsis-vertical";
import { EditIcon } from "@/components/ui/icons/edit";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { Input, InputAddon } from "@/components/ui/input";
import { Link as TextLink } from "@/components/ui/link";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryList,
  SummaryListAction,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { Tabs, TabsContent, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { apiError, pagesApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import {
  fixedAddress,
  formatDateTime,
  isHome,
  previewHref,
  useRefreshPages,
  useSummary,
} from "@/lib/pages";
import { PageAnalyticsTab } from "@/analytics/page-tab";
import { HistoryTab } from "./history-tab";
import { EntriesTab, ListingTab, WriteEntryButton, statusSummary, useListing } from "./listing";
import { PathChanges } from "./move";
import { type DetailSearch, type DetailTab, type SettingsSection, tabsFor } from "./search";
import { SettingsTab } from "./settings-tab";
import { Panel, TabColumns } from "./tab-layout";
import { useSaveDraft } from "./use-save-draft";

export function PageDetail({
  id,
  pages,
  search,
}: {
  id: string;
  pages: PageSummary[];
  search: DetailSearch;
}) {
  const navigate = useNavigate();
  const page = useQuery({ queryKey: ["page", id], queryFn: () => pagesApi.get(id) });
  const listing = page.data?.kind === "listing";
  const tabs = tabsFor(page.data?.kind ?? "page");
  // The tree keeps the tab when it moves to another page; a tab this page lacks falls back.
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : tabs[0];
  const goTo = (next: { tab: DetailTab; section?: SettingsSection }) =>
    void navigate({ to: "/pages/$id", params: { id }, search: next, replace: true });

  if (page.isError)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("detail.loadFailed")}</CalloutTitle>
        </Callout>
      </div>
    );
  if (!page.data)
    return (
      <div className="p-surface flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const data = page.data;
  const target = redirectTarget(data, pages);
  const more = (section: SettingsSection) => () => goTo({ tab: "settings", section });

  // An entry isn't in the tree: the way back is to its collection's entries.
  const collection = data.kind === "entry" ? pages.find((p) => p.id === data.parentId) : undefined;
  const panels: Record<DetailTab, ReactNode> = {
    entries: <EntriesTab listing={data} />,
    listing: <ListingTab listing={data} />,
    // What the page is and how search engines show it: one place for its identity.
    details: (
      <div className="flex flex-col gap-6">
        <DetailsTab
          key={data.updatedAt + data.path}
          page={data}
          pages={pages}
          collection={collection}
        />
        <SeoTab key={data.updatedAt} page={data} />
      </div>
    ),
    analytics: <PageAnalyticsTab pageId={data.id} />,
    history: <HistoryTab page={data} />,
    settings: <SettingsTab page={data} pages={pages} section={search.section} />,
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => goTo({ tab: value as DetailTab })}
      className="flex min-h-full flex-col gap-0"
    >
      <header className="bg-bg-white px-surface flex flex-col gap-4 pt-5">
        {collection && (
          <Backlink
            className="-mb-1 w-fit"
            render={
              <Link to="/pages/$id" params={{ id: collection.id }} search={{ tab: "entries" }} />
            }
          >
            {t("detail.backToEntries", { title: collection.title })}
          </Backlink>
        )}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
            <span
              aria-hidden
              className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
            >
              <PageKindIcon page={data} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="text-title text-txt-black-900 truncate font-semibold">
                  {data.title || t("page.untitled")}
                </h1>
                <PageStatusTag status={data.status} size="small" />
              </div>
              {/* A dot goes between the facts, however many there are. */}
              <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-x-2 gap-y-1 [&>*+*]:before:text-txt-black-500 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
                <span>{t(`detail.kind.${isHome(data) ? "home" : data.kind}`)}</span>
                {listing && <ListingMeta page={data} />}
                {target !== null && <span>{t("detail.redirects", { target })}</span>}
                <span>{t("detail.saved", { time: formatDateTime(data.updatedAt) })}</span>
              </p>
            </div>
          </div>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
            <Button
              variant="default-ghost"
              render={
                <a
                  href={previewHref(id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("detail.preview")}
                />
              }
            >
              <EyeShowIcon /> {t("detail.preview")}
            </Button>
            <Button
              variant={listing ? "default-outline" : "primary-fill"}
              render={<Link to="/pages/$id/edit" params={{ id }} />}
            >
              <EditIcon /> {t("detail.openEditor")}
            </Button>
            {listing && <WriteEntryButton listing={data} />}
            <Menu>
              <MenuTrigger
                render={<Button variant="default-outline" iconOnly aria-label={t("detail.more")} />}
              >
                <EllipsisVerticalIcon />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onClick={more("duplicate")}>{t("settings.duplicate.title")}</MenuItem>
                {data.kind !== "entry" && (
                  <MenuItem disabled={isHome(data)} onClick={more("move")}>
                    {t("detail.moveTo")}
                  </MenuItem>
                )}
                <MenuItem
                  disabled={isHome(data) || data.status === "draft"}
                  onClick={more("unpublish")}
                >
                  {t("settings.unpublish.title")}
                </MenuItem>
                <MenuSeparator />
                <MenuItem variant="danger" disabled={isHome(data)} onClick={more("delete")}>
                  {t("settings.delete.title")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
        <TabsList width="full">
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`detail.tab.${value}`)}
              {value === "entries" && <TabsCounter>{data.entryCount ?? 0}</TabsCounter>}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>
      <div className="bg-bg-washed p-surface flex-1">
        {tabs.map((value) => (
          <TabsContent key={value} value={value}>
            {panels[value]}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

function ListingMeta({ page }: { page: Page }) {
  const detail = useListing(page.id);
  const summary = statusSummary(detail.data);
  return (
    <>
      <span>{t("listing.count", { count: page.entryCount ?? 0 })}</span>
      {summary && <span>{summary}</span>}
    </>
  );
}

/** A row of "About this page": the fact, and a link to act on it where there is one. */
type Fact = { term: string; detail: string; action?: ReactNode };

function DetailsTab({
  page,
  pages,
  collection,
}: {
  page: Page;
  pages: PageSummary[];
  collection: PageSummary | undefined;
}) {
  const save = useSaveDraft(page);
  const refresh = useRefreshPages();
  const { toast } = useToast();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [redirect, setRedirect] = useState(true);
  const [error, setError] = useState<{ title?: string; slug?: string }>({});
  const fixed = fixedAddress(page);

  const debounced = useDebounced(slug, 300);
  const slugChanged = debounced !== page.slug;
  const slugValid = Slug.safeParse(debounced).success;
  const slugInvalid = slugChanged && !slugValid;
  const preview = useQuery({
    queryKey: ["move-preview", page.id, debounced],
    queryFn: () => pagesApi.move(page.id, { slug: debounced, dryRun: true }),
    enabled: !fixed && slugValid && slugChanged,
    retry: false,
  });
  const changes = slugChanged ? (preview.data?.changes ?? []) : [];
  const anyPublished = changes.some((c) => c.published);

  const submit = async () => {
    setError({});
    if (!title.trim()) return setError({ title: t("newPage.title.required") });
    if (!fixed && !Slug.safeParse(slug).success)
      return setError({ slug: t("newPage.slug.invalid") });
    try {
      if (title.trim() !== page.title)
        await save.mutateAsync((draft) => ({ ...draft, ms: { ...draft.ms, title: title.trim() } }));
      if (!fixed && slug !== page.slug) {
        await pagesApi.move(page.id, { slug, redirect: anyPublished && redirect });
        await refresh(page.id);
      }
      toast({ variant: "success", title: t("detail.details.saved") });
    } catch (caught) {
      const body = await apiError(caught);
      if (body?.code === "slug_taken") setError({ slug: t("newPage.slug.taken") });
      else setError({ title: body?.message ?? t("common.tryAgain") });
    }
  };

  const entry = page.kind === "entry" ? page.draft.entry : undefined;
  const children = pages.filter((p) => p.parentId === page.id).length;
  const tabLink = (tab: DetailTab, label: string) => (
    <TextLink primary render={<Link to="/pages/$id" params={{ id: page.id }} search={{ tab }} />}>
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
  // An entry is placed by its collection and date; a page by its template and what's under it.
  const facts: Fact[] = entry
    ? [
        {
          term: t("detail.details.collection"),
          detail: collection?.title ?? "",
          action: collection && (
            <TextLink
              primary
              render={
                <Link to="/pages/$id" params={{ id: collection.id }} search={{ tab: "entries" }} />
              }
            >
              {t("detail.details.openCollection")}
            </TextLink>
          ),
        },
        { term: t("listing.column.date"), detail: formatDateTime(entry.publishAt) },
        created,
        published,
      ]
    : [
        // Only worth a line when it's known.
        ...(page.template && page.template in templates
          ? [
              {
                term: t("detail.details.template"),
                detail: templates[page.template as TemplateId].name,
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
    <TabColumns split="half" aside={<SnapshotPanel page={page} />}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Panel
          footer={
            <Button
              type="submit"
              variant="default-outline"
              disabled={save.isPending || (title === page.title && slug === page.slug)}
            >
              {t("common.saveChanges")}
            </Button>
          }
        >
          <Field name="title" invalid={Boolean(error.title)}>
            <FieldLabel>{t("newPage.title.label")}</FieldLabel>
            <FieldDescription>{t("editor.page.titleHint")}</FieldDescription>
            <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            <FieldError>{error.title}</FieldError>
          </Field>
          <Field name="slug" invalid={Boolean(error.slug) || slugInvalid}>
            <FieldLabel>{t("newPage.slug.label")}</FieldLabel>
            {!fixed && <FieldDescription>{t("newPage.slug.hint")}</FieldDescription>}
            <Input
              value={fixed ? page.path : slug}
              disabled={fixed}
              onChange={(e) => setSlug(e.target.value)}
              prepend={fixed ? undefined : <ParentPrefix path={page.path} />}
            />
            <FieldError>
              {error.slug ?? (slugInvalid ? t("newPage.slug.invalid") : undefined)}
            </FieldError>
          </Field>
          {changes.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-body-sm">
                {t("detail.details.pathsChange", { count: changes.length })}
              </p>
              <PathChanges changes={changes} />
              {anyPublished && (
                <Field name="redirect">
                  <FieldItem>
                    <Checkbox checked={redirect} onCheckedChange={setRedirect} />
                    <FieldLabel>{t("move.redirect")}</FieldLabel>
                  </FieldItem>
                </Field>
              )}
            </div>
          )}
        </Panel>
      </form>
      <Panel title={t("detail.details.about")}>
        {/* FTDS's SummaryList: one record's facts, a hairline between rows, an action at the end. */}
        <SummaryList>
          <SummaryListBody>
            {facts.map((fact) => (
              <SummaryListRow key={fact.term} className="last:border-b-0">
                <SummaryListTerm className="min-w-0 whitespace-nowrap">{fact.term}</SummaryListTerm>
                <SummaryListDetail className="tabular-nums">{fact.detail}</SummaryListDetail>
                {/* Every row has the cell, so the columns line up. */}
                <SummaryListAction className="py-3">{fact.action}</SummaryListAction>
              </SummaryListRow>
            ))}
          </SummaryListBody>
        </SummaryList>
      </Panel>
    </TabColumns>
  );
}

/** The saved draft as a picture; selecting it opens the full preview. */
function SnapshotPanel({ page }: { page: Page }) {
  const href = previewHref(page.id);
  return (
    <Panel title={t("detail.preview")}>
      <PageFrame
        // The save time in the address redraws the picture after each save.
        src={`${href}&v=${encodeURIComponent(page.updatedAt)}`}
        path={page.path}
        title={t("detail.snapshot.title", { title: page.title || t("page.untitled") })}
        className="aspect-[4/3]"
        overlay={
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group focus-ring-inset absolute inset-0 grid place-items-center"
          >
            <span className="sr-only">{t("detail.snapshot.open")}</span>
            <span
              aria-hidden
              className="bg-bg-white text-label-sm text-txt-black-900 shadow-card flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <EyeShowIcon className="size-4" /> {t("detail.snapshot.openShort")}
            </span>
          </a>
        }
      />
      <p className="text-body-xs text-txt-black-700">{t("detail.snapshot.hint")}</p>
    </Panel>
  );
}

const DESCRIPTION_LIMIT = 160;

function SeoTab({ page }: { page: Page }) {
  const save = useSaveDraft(page);
  const summary = useSummary();
  const { toast } = useToast();
  const [description, setDescription] = useState(page.draft.ms.description ?? "");
  const [noindex, setNoindex] = useState(page.draft.seo?.noindex ?? false);
  const [noSitemap, setNoSitemap] = useState(page.draft.seo?.sitemap === false);
  const [error, setError] = useState<string>();
  const siteUrl = summary.data?.site.url?.replace(/\/$/, "") ?? "";

  const submit = async () => {
    setError(undefined);
    if (description.length > DESCRIPTION_LIMIT) return setError(t("seo.description.tooLong"));
    try {
      await save.mutateAsync((draft) => ({
        ...draft,
        ms: { ...draft.ms, description: description.trim() || undefined },
        seo: { noindex: noindex || undefined, sitemap: noSitemap ? false : undefined },
      }));
      toast({ variant: "success", title: t("seo.saved") });
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
    }
  };

  return (
    <TabColumns
      split="half"
      aside={
        <Panel title={t("seo.preview")}>
          <div className="border-otl-gray-200 flex flex-col gap-1 rounded-md border p-3">
            <span className="text-body-xs text-txt-black-700 truncate">{siteUrl + page.path}</span>
            <span className="text-txt-primary text-body-md truncate font-medium">
              {page.title || t("page.untitled")}
            </span>
            <span className="text-body-sm text-txt-black-700 line-clamp-3">
              {description || t("seo.preview.noDescription")}
            </span>
          </div>
          {noindex && <p className="text-body-sm text-txt-warning">{t("seo.preview.hidden")}</p>}
        </Panel>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Panel
          footer={
            <>
              <Button type="submit" variant="default-outline" disabled={save.isPending}>
                {t("common.saveChanges")}
              </Button>
              <p className="text-body-sm text-txt-black-700">{t("seo.whenLive")}</p>
            </>
          }
        >
          <Field name="description" invalid={Boolean(error)}>
            <FieldLabel>{t("seo.description.label")}</FieldLabel>
            <FieldDescription>{t("seo.description.hint")}</FieldDescription>
            <CharacterCount
              limit={DESCRIPTION_LIMIT}
              value={description}
              onValueChange={setDescription}
              rows={3}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <div className="flex flex-col gap-2">
            <Field name="noindex">
              <FieldItem>
                <Checkbox checked={noindex} onCheckedChange={setNoindex} />
                <FieldLabel>{t("seo.noindex")}</FieldLabel>
              </FieldItem>
            </Field>
            <Field name="sitemap">
              <FieldItem>
                <Checkbox checked={noSitemap} onCheckedChange={setNoSitemap} />
                <FieldLabel>{t("seo.noSitemap")}</FieldLabel>
              </FieldItem>
            </Field>
          </div>
        </Panel>
      </form>
    </TabColumns>
  );
}

/**
 * Where the address sits: the nearest parent's part of it, with "../" when there are
 * more above. The whole parent address is in its tooltip.
 */
function ParentPrefix({ path }: { path: string }) {
  const above = path.split("/").filter(Boolean).slice(0, -1);
  const parent = above.at(-1);
  const prefix = parent ? `${above.length > 1 ? "../" : "/"}${parent}/` : "/";
  return (
    <InputAddon
      title={`/${above.map((part) => `${part}/`).join("")}`}
      className="bg-bg-washed text-txt-black-500 max-w-1/2 shrink-0 rounded-l-md"
    >
      <span className="truncate">{prefix}</span>
    </InputAddon>
  );
}
