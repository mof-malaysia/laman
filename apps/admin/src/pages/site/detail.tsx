/**
 * A page's own screen (the top bar's breadcrumb is its way back): its identity and
 * actions, then its tabs (Details, Analytics, History, Settings; Entries for a
 * collection) on the Pages screens' grey canvas.
 */
import { Slug, type TemplateId, templates } from "@fiscal-sb/blocks";
import type { Page, PageSummary } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { PageFrame } from "@/components/page-frame";
import { redirectTarget } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { CharacterCount } from "@/components/character-count";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { Input } from "@/components/ui/input";
import { ParentPrefix } from "@/components/parent-prefix";
import { Link as TextLink } from "@/components/ui/link";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { templateName } from "@/i18n/registry";
import { apiError, pagesApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import {
  fixedAddress,
  formatAgo,
  formatDateTime,
  isHome,
  previewHref,
  useRefreshPages,
  useSummary,
} from "@/lib/pages";
import { PageAnalyticsTab } from "@/analytics/page-tab";
import { HistoryTab } from "./history-tab";
import { DotsGlyph, EyeGlyph, KindGlyph, PenGlyph } from "./line-icons";
import { EntriesTab, ListingTab, WriteEntryButton, statusSummary, useListing } from "./listing";
import { PathChanges } from "./move";
import { StateLabel, stateOf } from "./page-state";
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
  // A tab the page lacks (a link from another kind of page) falls back to the first.
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : tabs[0];
  const goTo = (next: { tab: DetailTab; section?: SettingsSection }) =>
    void navigate({ to: "/pages/$id", params: { id }, search: next, replace: true });

  if (page.isError)
    return (
      <Canvas>
        <Callout variant="danger">
          <CalloutTitle>{t("detail.loadFailed")}</CalloutTitle>
        </Callout>
      </Canvas>
    );
  if (!page.data)
    return (
      <Canvas>
        <Skeleton className="h-5 w-56 rounded-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-2xl" />
          <Skeleton className="h-9 w-72" />
        </div>
        <Skeleton className="h-10 w-80 rounded-full" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </Canvas>
    );

  const data = page.data;
  const target = redirectTarget(data, pages);
  const more = (section: SettingsSection) => () => goTo({ tab: "settings", section });
  const title = data.title || t("page.untitled");

  // An entry isn't in the page list; its collection is, and leads back to its entries.
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
      className="gap-0"
    >
      <Canvas>
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-[1_1_22rem] items-start gap-4">
            <span className="bg-bg-washed text-txt-black-700 flex size-12 shrink-0 items-center justify-center rounded-2xl">
              <KindGlyph page={data} className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="font-heading text-txt-black-900 text-heading-xs truncate font-semibold tracking-tight">
                  {title}
                </h1>
                <StateLabel state={stateOf(data)} className="text-txt-black-700" />
              </div>
              {/* A dot goes between the facts, however many there are. */}
              <p className="text-body-sm text-txt-black-500 flex flex-wrap items-center gap-x-2 gap-y-1 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
                <span>{t(`detail.kind.${isHome(data) ? "home" : data.kind}`)}</span>
                <span className="font-mono">{data.path}</span>
                {listing && <ListingMeta page={data} />}
                {target !== null && <span>{t("detail.redirects", { target })}</span>}
                <span title={formatDateTime(data.updatedAt)}>
                  {t("detail.saved", { time: formatAgo(data.updatedAt, { inline: true }) })}
                  {data.editedBy && ` · ${data.editedBy}`}
                </span>
              </p>
            </div>
          </div>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
            <Button
              variant="default-outline"
              render={
                <a
                  href={previewHref(id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("detail.preview")}
                />
              }
            >
              <EyeGlyph className="size-[18px]" /> {t("detail.preview")}
            </Button>
            <Button
              variant={listing ? "default-outline" : "primary-fill"}
              render={<Link to="/pages/$id/edit" params={{ id }} />}
            >
              <PenGlyph className="size-[18px]" /> {t("detail.openEditor")}
            </Button>
            {listing && <WriteEntryButton listing={data} />}
            <Menu>
              <MenuTrigger
                render={<Button variant="default-outline" iconOnly aria-label={t("detail.more")} />}
              >
                <DotsGlyph className="size-5" />
              </MenuTrigger>
              <MenuContent align="end">
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
        </header>
        <TabsList width="full">
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`detail.tab.${value}`)}
              {value === "entries" && <TabsCounter>{data.entryCount ?? 0}</TabsCounter>}
            </TabsTrigger>
          ))}
        </TabsList>

        <div>
          {tabs.map((value) => (
            <TabsContent key={value} value={value}>
              {panels[value]}
            </TabsContent>
          ))}
        </div>
      </Canvas>
    </Tabs>
  );
}

/** The page screen's grey canvas, with the index's column. */
function Canvas({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-gray-50 min-h-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-6 pb-16">{children}</div>
    </div>
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

/**
 * "About this page": the facts a page or entry has beyond its content, each with
 * where to act on it. `onHistory`: where "View history" goes instead of the page's
 * screen (the editor's drawer switches to its History tab).
 */
export function AboutPanel({
  page,
  pages,
  collection,
  onHistory,
}: {
  page: Page;
  pages: PageSummary[];
  collection: PageSummary | undefined;
  onHistory?: () => void;
}) {
  const entry = page.kind === "entry" ? page.draft.entry : undefined;
  const children = pages.filter((p) => p.parentId === page.id).length;
  const tabLink = (tab: DetailTab, label: string) =>
    tab === "history" && onHistory ? (
      <TextLink
        primary
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the link fills it with its label
        render={<button type="button" onClick={onHistory} />}
      >
        {label}
      </TextLink>
    ) : (
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
      <AboutPanel page={page} pages={pages} collection={collection} />
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
      <p className="text-label-compact text-txt-black-700">{t("detail.snapshot.hint")}</p>
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
            <span className="text-label-compact text-txt-black-700 truncate">
              {siteUrl + page.path}
            </span>
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
