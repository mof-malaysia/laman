/**
 * New page, as a guided full-screen flow outside the shell: an ordinary page
 * or a collection, its starting point, where it goes, then its title and
 * address (and for a collection, what its entries are called), check, create.
 * A live preview of the page as it will start sits beside every step.
 */
import {
  type TemplateId,
  blockDefinition,
  Slug,
  type TemplateKind,
  slugify,
  templateById,
  templates,
  templatesFor,
} from "@fiscal-sb/blocks";
import type { Page, PageSummary } from "@fiscal-sb/contracts";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PageFrame } from "@/components/page-frame";
import { Backlink } from "@/components/ui/backlink";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CrossIcon } from "@/components/ui/icons/cross";
import { DocumentIcon } from "@/components/ui/icons/document";
import { ListIcon } from "@/components/ui/icons/list";
import { Input } from "@/components/ui/input";
import { Radio, RadioButton } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper, StepperItem } from "@/components/ui/stepper";
import {
  SummaryList,
  SummaryListAction,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { apiError, pagesApi } from "@/lib/api";
import { type TreeItem, buildTree, childPath, usePages, useRefreshPages } from "@/lib/pages";
import { clx } from "@/lib/ftds/utils";
import { type NewPageSearch, type NewPageStep, newPageSteps } from "./search";

/** What each card shows under its description: a page template's blocks, a collection's categories. */
const tags = Object.fromEntries(
  Object.keys(templates).map((id) => {
    const template = templateById(id as TemplateId);
    return [
      id,
      template.listing
        ? (template.listing.categories ?? []).map((c) => c.name)
        : template.blocks("").map((b) => blockDefinition(b.type).label),
    ];
  }),
) as Record<TemplateId, string[]>;

/** Pages a new page can go under, depth first. A listing holds entries only, so it and its entries are left out. */
function placeOptions(pages: PageSummary[]) {
  const out: TreeItem[] = [];
  const walk = (items: TreeItem[]) => {
    for (const item of items.filter((i) => i.kind === "page")) {
      out.push(item);
      walk(item.children);
    }
  };
  walk(buildTree(pages));
  return out;
}

export function NewPageScreen() {
  const search = useSearch({ strict: false }) as NewPageSearch;
  const navigate = useNavigate();
  const pages = usePages();
  const refresh = useRefreshPages();
  const [created, setCreated] = useState<Page>();
  const [errors, setErrors] = useState<{
    title?: string;
    slug?: string;
    form?: string;
  }>({});

  const step: NewPageStep = search.step ?? "kind";
  const index = newPageSteps.indexOf(step);
  const kind: TemplateKind = search.kind ?? "page";
  // A template of the other kind (from an old link, or after switching) falls back to the first.
  const offered = templatesFor(kind);
  const template =
    search.template && offered.includes(search.template) ? search.template : offered[0]!;
  // What's typed stays here and reaches the address with the next step, not on every key.
  const [typed, setTyped] = useState(() => ({
    title: search.title ?? "",
    slug: search.slug,
  }));
  const title = typed.title;
  // The address follows the title until someone edits it.
  const slug = typed.slug ?? slugify(title);
  const home = pages.data?.find((p) => p.parentId === null);
  const parent = pages.data?.find((p) => p.id === search.parent && p.kind === "page") ?? home;
  const path = parent && slug ? childPath(parent.path, slug) : (parent?.path ?? "/");

  const set = (next: Partial<NewPageSearch>) =>
    navigate({
      to: "/pages/new",
      search: (prev: NewPageSearch) => ({ ...prev, ...next }),
      replace: true,
    });
  const stepSearch = (to: NewPageStep) => (prev: NewPageSearch) => ({
    ...prev,
    ...typed,
    step: to,
  });
  const go = (to: NewPageStep) => {
    setErrors({});
    void navigate({ to: "/pages/new", search: stepSearch(to) });
  };

  const { parent: from } = search;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      void navigate(from ? { to: "/pages/$id", params: { id: from } } : { to: "/pages" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [from, navigate]);
  const close = () =>
    navigate(from ? { to: "/pages/$id", params: { id: from } } : { to: "/pages" });

  const nameIssues = (): typeof errors => {
    if (!title.trim()) return { title: t("newPage.title.required") };
    if (!slug) return { slug: t("newPage.slug.required") };
    if (!Slug.safeParse(slug).success) return { slug: t("newPage.slug.invalid") };
    const taken = pages.data?.some((p) => p.parentId === parent?.id && p.slug === slug);
    if (taken) return { slug: t("newPage.slug.taken") };
    return {};
  };

  const create = useMutation({
    mutationFn: pagesApi.create,
    onSuccess: async (page) => {
      await refresh();
      setCreated(page);
      setTyped({ title: "", slug: undefined });
      // Back or a refresh starts a fresh flow, rather than creating the page twice.
      void navigate({
        to: "/pages/new",
        search: page.parentId ? { parent: page.parentId } : {},
        replace: true,
      });
    },
    onError: async (error) => {
      const body = await apiError(error);
      if (body?.code === "slug_taken") {
        go("name");
        setErrors({ slug: t("newPage.slug.taken") });
      } else setErrors({ form: t("newPage.failed") });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (index < newPageSteps.indexOf("name")) return go(newPageSteps[index + 1]!);
    // The name step's answers are checked again before creating: the address may have changed.
    const issues = nameIssues();
    if (Object.keys(issues).length) {
      if (step === "check") go("name");
      setErrors(issues);
      return;
    }
    if (step === "name") return go("check");
    if (!parent) return;
    create.mutate({
      title: title.trim(),
      slug,
      parentId: parent.id,
      template,
    });
  };

  const heading = useRef<HTMLHeadingElement>(null);
  // Each step moves focus to its heading, as a new page would.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- a new step or the done panel moves focus
  useEffect(() => heading.current?.focus(), [step, created]);

  return (
    <div className="bg-bg-washed flex h-dvh flex-col">
      <header className="border-otl-gray-200 bg-bg-white flex min-h-14 shrink-0 items-center gap-6 border-b px-4 py-3">
        <span className="text-txt-black-900 text-body-md shrink-0 font-semibold">
          {t("newPage.title")}
        </span>
        {created ? (
          <div className="flex-1" />
        ) : (
          <Stepper
            className="mx-auto max-w-3xl min-w-0 flex-1"
            current={index}
            aria-label={t("newPage.progress")}
            formatStep={(n, total) => t("newPage.stepOf", { n, total })}
            completeLabel={t("newPage.stepDone")}
          >
            {newPageSteps.map((id, i) => (
              <StepperItem
                key={id}
                href={i < index ? "#" : undefined}
                onLinkClick={(event) => {
                  event.preventDefault();
                  go(id);
                }}
              >
                {t(`newPage.step.${id}`)}
              </StepperItem>
            ))}
          </Stepper>
        )}
        <Button variant="default-ghost" size="small" onClick={() => void close()}>
          <CrossIcon aria-hidden />
          {t("newPage.close")}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <main id="main" className="bg-bg-white min-h-0 overflow-auto">
          <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
            {created ? (
              <Done
                page={created}
                heading={heading}
                // The address was already reset to a fresh flow when the page was created.
                onAnother={() => setCreated(undefined)}
              />
            ) : (
              <form onSubmit={submit} noValidate className="flex flex-col gap-6">
                {index > 0 ? (
                  <Backlink
                    render={<Link to="/pages/new" search={stepSearch(newPageSteps[index - 1]!)} />}
                  >
                    {t("newPage.back")}
                  </Backlink>
                ) : null}
                {step === "kind" && (
                  <KindStep heading={heading} value={kind} onChange={(k) => set({ kind: k })} />
                )}
                {step === "start" && (
                  <StartStep
                    heading={heading}
                    kind={kind}
                    offered={offered}
                    value={template}
                    onChange={(id) => void set({ template: id })}
                  />
                )}
                {step === "place" &&
                  (pages.data ? (
                    <PlaceStep
                      heading={heading}
                      pages={pages.data}
                      value={parent?.id}
                      onChange={(id) => set({ parent: id })}
                    />
                  ) : (
                    <Skeleton className="h-40" />
                  ))}
                {step === "name" && (
                  <NameStep
                    heading={heading}
                    title={title}
                    slug={slug}
                    parentPath={parent?.path ?? "/"}
                    errors={errors}
                    onTitle={(value) => setTyped((prev) => ({ ...prev, title: value }))}
                    onSlug={(value) => setTyped((prev) => ({ ...prev, slug: value }))}
                    kind={kind}
                  />
                )}
                {step === "check" && (
                  <CheckStep
                    heading={heading}
                    kind={kind}
                    template={template}
                    parent={parent}
                    title={title}
                    path={path}
                    onChange={go}
                  />
                )}
                {errors.form && (
                  <Callout variant="danger">
                    <CalloutTitle>{errors.form}</CalloutTitle>
                  </Callout>
                )}
                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" variant="primary-fill" disabled={create.isPending}>
                    {step === "check" ? t(`newPage.submit.${kind}`) : t("newPage.continue")}
                  </Button>
                  {step === "kind" && (
                    <span className="text-txt-black-500 text-body-sm">
                      {t("newPage.changeLater")}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </main>
        <aside
          aria-label={t("newPage.preview")}
          className="hidden min-h-0 flex-col gap-3 p-6 lg:flex"
        >
          <TemplatePreview
            template={template}
            title={title || templates[template].name}
            path={path}
          />
        </aside>
      </div>
    </div>
  );
}

type Heading = { heading: React.RefObject<HTMLHeadingElement | null> };

function StepHeading({ heading, title, intro }: Heading & { title: string; intro?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-txt-black-900 text-headline font-semibold text-balance outline-none"
      >
        {title}
      </h1>
      {intro && <p className="text-txt-black-700 text-body-md">{intro}</p>}
    </div>
  );
}

/** The choice cards: a radio each, with the whole card as its label. */
const choiceCard =
  "border-otl-gray-200 bg-bg-white hover:border-otl-gray-300 has-[[data-checked]]:border-otl-primary-300 has-[[data-checked]]:bg-bg-primary-50 has-[:focus-visible]:ring-fr-primary flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-3";

function KindStep({
  heading,
  value,
  onChange,
}: Heading & { value: TemplateKind; onChange: (kind: TemplateKind) => void }) {
  const kinds = [
    { id: "page", icon: <DocumentIcon aria-hidden className="size-6" /> },
    { id: "listing", icon: <ListIcon aria-hidden className="size-6" /> },
  ] as const;
  return (
    <>
      <StepHeading heading={heading} title={t("newPage.kind.title")} />
      <Fieldset render={<Radio value={value} onValueChange={(v) => onChange(v as TemplateKind)} />}>
        <FieldsetLegend className="sr-only">{t("newPage.kind.label")}</FieldsetLegend>
        {kinds.map(({ id, icon }) => (
          <label key={id} htmlFor={`kind-${id}`} className={clx(choiceCard, "gap-4 p-5")}>
            <RadioButton
              value={id}
              id={`kind-${id}`}
              className="mt-0.5"
              aria-describedby={`kind-${id}-hint`}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-txt-black-900 text-body-lg font-semibold">
                {t(`newPage.kind.${id}.title`)}
              </span>
              <span id={`kind-${id}-hint`} className="flex flex-col gap-1.5">
                <span className="text-txt-black-700 text-body-sm">
                  {t(`newPage.kind.${id}.body`)}
                </span>
                <span className="text-txt-black-500 text-label-compact">
                  {t(`newPage.kind.${id}.examples`)}
                </span>
              </span>
            </span>
            <span className="text-txt-black-500 shrink-0">{icon}</span>
          </label>
        ))}
      </Fieldset>
    </>
  );
}

function StartStep({
  heading,
  kind,
  offered,
  value,
  onChange,
}: Heading & {
  kind: TemplateKind;
  offered: TemplateId[];
  value: TemplateId;
  onChange: (id: TemplateId) => void;
}) {
  return (
    <>
      <StepHeading
        heading={heading}
        title={t(`newPage.start.${kind}.title`)}
        intro={t(`newPage.start.${kind}.intro`)}
      />
      <Fieldset render={<Radio value={value} onValueChange={(v) => onChange(v as TemplateId)} />}>
        <FieldsetLegend className="sr-only">{t("newPage.template.label")}</FieldsetLegend>
        {offered.map((id) => (
          <label key={id} htmlFor={`template-${id}`} className={choiceCard}>
            <RadioButton
              value={id}
              id={`template-${id}`}
              className="mt-0.5"
              aria-describedby={`template-${id}-hint`}
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-txt-black-900 text-body-md font-semibold">
                {templates[id].name}
              </span>
              <span id={`template-${id}-hint`} className="text-txt-black-700 text-body-sm">
                {templates[id].description}
              </span>
              <span className="mt-1 flex flex-wrap gap-1" aria-hidden>
                {tags[id].map((label, i) => (
                  <Tag key={i} size="small">
                    {label}
                  </Tag>
                ))}
              </span>
            </span>
          </label>
        ))}
      </Fieldset>
    </>
  );
}

function PlaceStep({
  heading,
  pages,
  value,
  onChange,
}: Heading & { pages: PageSummary[]; value: string | undefined; onChange: (id: string) => void }) {
  const options = useMemo(() => placeOptions(pages), [pages]);
  return (
    <>
      <StepHeading
        heading={heading}
        title={t("newPage.place.title")}
        intro={t("newPage.place.intro")}
      />
      <Fieldset render={<Radio value={value ?? ""} onValueChange={(v) => onChange(v as string)} />}>
        <FieldsetLegend className="sr-only">{t("newPage.parent.label")}</FieldsetLegend>
        <div className="flex flex-col gap-2">
          {options.map((page) => (
            <label
              key={page.id}
              htmlFor={`place-${page.id}`}
              className={clx(choiceCard, "items-center py-3")}
              style={{ marginInlineStart: `${page.depth * 1.5}rem` }}
            >
              <RadioButton value={page.id} id={`place-${page.id}`} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-txt-black-900 text-body-sm truncate font-medium">
                  {t(page.depth === 0 ? "newPage.place.top" : "newPage.place.under", {
                    title: page.title || t("page.untitled"),
                  })}
                </span>
                <span className="text-txt-black-500 text-label-compact truncate">
                  {childPath(page.path, "…")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Fieldset>
    </>
  );
}

function NameStep({
  heading,
  title,
  slug,
  parentPath,
  errors,
  onTitle,
  onSlug,
  kind,
}: Heading & {
  title: string;
  slug: string;
  parentPath: string;
  errors: { title?: string; slug?: string };
  onTitle: (value: string) => void;
  onSlug: (value: string) => void;
  kind: TemplateKind;
}) {
  const prefix = childPath(parentPath, "");
  return (
    <>
      <StepHeading
        heading={heading}
        title={t(`newPage.name.title.${kind}`)}
        intro={t("newPage.name.intro")}
      />
      <Field name="title" invalid={Boolean(errors.title)}>
        <FieldLabel>{t("newPage.title.label")}</FieldLabel>
        <FieldDescription>{t("newPage.title.hint")}</FieldDescription>
        <Input
          value={title}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the step's one question
          autoFocus
          onChange={(event) => onTitle(event.target.value)}
        />
        <FieldError>{errors.title}</FieldError>
      </Field>
      <Field name="slug" invalid={Boolean(errors.slug)}>
        <FieldLabel>{t("newPage.slug.label")}</FieldLabel>
        <FieldDescription>{t("newPage.slug.hint")}</FieldDescription>
        <div className="flex items-center gap-1">
          <span className="text-txt-black-500 text-body-sm shrink-0 font-mono">{prefix}</span>
          <Input
            value={slug}
            className="flex-1 font-mono"
            onChange={(event) => onSlug(event.target.value)}
          />
        </div>
        <FieldError>{errors.slug}</FieldError>
      </Field>
    </>
  );
}

function CheckStep({
  heading,
  kind,
  template,
  parent,
  title,
  path,
  onChange,
}: Heading & {
  kind: TemplateKind;
  template: TemplateId;
  parent: PageSummary | undefined;
  title: string;
  path: string;
  onChange: (step: NewPageStep) => void;
}) {
  const rows: { term: string; detail: string; step: NewPageStep; mono?: boolean }[] = [
    { term: t("newPage.kind.label"), detail: t(`newPage.kind.${kind}.title`), step: "kind" },
    { term: t("newPage.template.label"), detail: templates[template].name, step: "start" },
    { term: t("newPage.parent.label"), detail: parent?.title || t("page.untitled"), step: "place" },
    { term: t("newPage.check.title.label"), detail: title, step: "name" },
    { term: t("newPage.slug.label"), detail: path, step: "name", mono: true },
  ];
  return (
    <>
      <StepHeading heading={heading} title={t("newPage.check.title")} />
      <SummaryList>
        <SummaryListBody>
          {rows.map((row) => (
            <SummaryListRow key={row.term}>
              <SummaryListTerm>{row.term}</SummaryListTerm>
              <SummaryListDetail className={clx(row.mono && "font-mono")}>
                {row.detail}
              </SummaryListDetail>
              <SummaryListAction>
                <Button
                  type="button"
                  variant="default-ghost"
                  size="small"
                  onClick={() => onChange(row.step)}
                >
                  {t("newPage.check.change")}
                  <span className="sr-only"> {row.term}</span>
                </Button>
              </SummaryListAction>
            </SummaryListRow>
          ))}
        </SummaryListBody>
      </SummaryList>
      <p className="text-txt-black-700 text-body-sm">{t(`newPage.check.draft.${kind}`)}</p>
    </>
  );
}

/** What to do once it's made: a page is written, a collection gets its entries. */
const nextSteps = {
  page: ["edit", "preview", "publish"],
  listing: ["setup", "entries", "publish"],
} as const;

function Done({ page, heading, onAnother }: Heading & { page: Page; onAnother: () => void }) {
  const navigate = useNavigate();
  const kind: TemplateKind = page.kind === "listing" ? "listing" : "page";
  return (
    <div className="flex flex-col gap-6">
      <CheckCircleIcon aria-hidden className="text-txt-success size-12" />
      <StepHeading
        heading={heading}
        title={t("newPage.done.title", { title: page.draft.ms.title })}
        intro={t("newPage.done.intro", { path: page.path })}
      />
      <ol className="flex flex-col gap-3">
        {nextSteps[kind].map((id, i) => (
          <li key={id} className="flex gap-3">
            <span className="bg-bg-primary-50 text-txt-primary text-body-sm flex size-7 shrink-0 items-center justify-center rounded-full font-semibold">
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="text-txt-black-900 text-body-sm font-semibold">
                {t(`newPage.done.${kind}.${id}.title` as MessageKey)}
              </span>
              <span className="text-txt-black-700 text-body-sm">
                {t(`newPage.done.${kind}.${id}.body` as MessageKey)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary-fill"
          onClick={() => void navigate({ to: "/pages/$id/edit", params: { id: page.id } })}
        >
          {t("newPage.done.open")}
        </Button>
        <Button
          variant="default-outline"
          onClick={() =>
            void navigate({
              to: "/pages/$id",
              params: { id: page.id },
              search: kind === "listing" ? { tab: "entries" } : {},
            })
          }
        >
          {t(`newPage.done.more.${kind}`)}
        </Button>
        <Button variant="default-ghost" onClick={onAnother}>
          {t("newPage.done.another")}
        </Button>
      </div>
    </div>
  );
}

/** The page as it will start, drawn by the renderer at desktop width and scaled to fit. */
function TemplatePreview({
  template,
  title,
  path,
}: {
  template: TemplateId;
  title: string;
  path: string;
}) {
  const [src, setSrc] = useState("");

  // Typing redraws the preview after a pause, not on every key.
  useEffect(() => {
    const query = new URLSearchParams({ title, path });
    const next = `/render/templates/${template}?${query}`;
    const timer = setTimeout(() => setSrc(next), src ? 350 : 0);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- src is only read for the first draw
  }, [template, title, path]);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-txt-black-700 text-body-sm font-semibold">
          {t("newPage.preview")}
        </span>
        <span className="text-txt-black-500 text-label-compact">{t("newPage.previewHint")}</span>
      </div>
      {src && (
        <PageFrame
          src={src}
          path={path}
          title={t("newPage.preview")}
          className="flex-1 border-0 shadow-sm"
        />
      )}
    </>
  );
}
