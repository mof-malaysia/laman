/**
 * A collection's own parts of the page drawer: writing an entry, the Entries
 * tab (newest first, pinned on top, with search, filters and paging), and the
 * collection's settings.
 */
import { choiceCard } from "@/components/card";
import { type ListingSettings, blockDefinition, blocksFor, slugify } from "@laman/blocks";
import type { EntrySummary, ListingDetail, Page, PageStatus } from "@laman/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { PageStatusTag } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { PlusIcon } from "@/components/ui/icons/plus";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Radio, RadioButton, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { useShortcut, useShortcutScope } from "@/components/ui/shortcuts";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { blockDescription, blockLabel } from "@/i18n/registry";
import { apiError, listingApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDateTime, useRefreshPages } from "@/lib/pages";
import { BlockIcon } from "@/editor/block-meta";
import { FormRow, tabCard } from "./tab-layout";

export const useListing = (id: string) =>
  useQuery({ queryKey: ["listing", id], queryFn: () => listingApi.get(id) });

/** "1 scheduled · 1 draft · 1 changed". */
function statusSummary(detail: ListingDetail | undefined) {
  if (!detail) return "";
  const order: PageStatus[] = ["scheduled", "draft", "changed"];
  return order
    .filter((s) => detail.counts[s])
    .map((s) => t(`listing.summary.${s}`, { count: detail.counts[s] ?? 0 }))
    .join(" · ");
}

/** "New entry": a title, then the new entry opens in the editor. */
function WriteEntryButton({ listing }: { listing: Page }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary-fill" onClick={() => setOpen(true)}>
        <PlusIcon /> {t("listing.write")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <WriteEntryForm listing={listing} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function WriteEntryForm({ listing, onDone }: { listing: Page; onDone: () => void }) {
  const navigate = useNavigate();
  const refresh = useRefreshPages();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(t("newPage.title.required"));
    setBusy(true);
    try {
      const entry = await listingApi.write(listing.id, title.trim());
      await Promise.all([
        refresh(listing.id),
        queryClient.invalidateQueries({ queryKey: ["entries", listing.id] }),
      ]);
      onDone();
      await navigate({ to: "/pages/$id/edit", params: { id: entry.id } });
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
      setBusy(false);
    }
  };
  return (
    <DialogBody className="sm:w-lg">
      <form noValidate onSubmit={(e) => void submit(e)} className="w-full">
        <DialogHeader>
          <DialogTitle>{t("listing.write")}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <Field name="entry-title" invalid={Boolean(error)}>
            <FieldLabel>{t("newPage.title.label")}</FieldLabel>
            <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            <FieldError>{error}</FieldError>
          </Field>
        </DialogContent>
        <DialogFooter>
          <DialogClose render={<Button variant="default-outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button type="submit" variant="default-outline" disabled={busy}>
            {t("listing.write.submit")}
          </Button>
        </DialogFooter>
      </form>
    </DialogBody>
  );
}

const PAGE_SIZE = 25;
const statuses: PageStatus[] = ["draft", "changed", "published", "scheduled"];

/**
 * The Entries tab of a collection's page drawer: search and filters, then one row per
 * entry (its title, then its state, date and category), newest first with pinned on top.
 * An entry opens in the editor.
 */
export function EntriesTab({ listing }: { listing: Page }) {
  const navigate = useNavigate();
  const detail = useListing(listing.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [index, setIndex] = useState(0);
  const debounced = useDebounced(search);
  const entries = useQuery({
    queryKey: ["entries", listing.id, { debounced, status, category, page }],
    queryFn: () =>
      listingApi.entries(listing.id, {
        search: debounced || undefined,
        status: (status || undefined) as PageStatus | undefined,
        category: category || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const items = entries.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((entries.data?.total ?? 0) / PAGE_SIZE));
  const categories = detail.data?.settings.categories ?? [];
  const categoryName = (slug?: string) => categories.find((c) => c.slug === slug)?.name ?? "";
  const summary = statusSummary(detail.data);
  const edit = (entry: EntrySummary | undefined, panel?: "details") =>
    entry &&
    void navigate({
      to: "/pages/$id/edit",
      params: { id: entry.id },
      search: panel ? { panel } : {},
    });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
    setIndex(0);
  };

  useShortcutScope("entries");
  useShortcut("j", () => setIndex((i) => Math.min(items.length - 1, i + 1)), { scope: "entries" });
  useShortcut("k", () => setIndex((i) => Math.max(0, i - 1)), { scope: "entries" });
  useShortcut("o", () => edit(items[index], "details"), { scope: "entries" });
  useShortcut("e", () => edit(items[index]), { scope: "entries" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-txt-black-700 flex flex-wrap gap-x-2 tabular-nums [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
          <span>
            {t("listing.count", { count: entries.data?.total ?? listing.entryCount ?? 0 })}
          </span>
          {summary && <span>{summary}</span>}
        </p>
        <WriteEntryButton listing={listing} />
      </div>
      <div className={clx(tabCard, "border-otl-gray-200")}>
        <div className="border-otl-gray-200 flex flex-wrap items-center gap-2 border-b p-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => filter(() => setSearch(e.target.value))}
            placeholder={t("listing.search")}
            aria-label={t("listing.search")}
            className="min-w-48 flex-1"
          />
          <Select
            items={statuses.map((s) => ({ value: s, label: t(`page.status.${s}`) }))}
            value={status}
            clearable
            placeholder={t("listing.allStatuses")}
            aria-label={t("listing.status")}
            className="w-40"
            onValueChange={(v: string) => filter(() => setStatus(v ?? ""))}
          />
          {categories.length > 0 && (
            <Select
              items={categories.map((c) => ({ value: c.slug, label: c.name }))}
              value={category}
              clearable
              placeholder={t("listing.allCategories")}
              aria-label={t("listing.category")}
              className="w-40"
              onValueChange={(v: string) => filter(() => setCategory(v ?? ""))}
            />
          )}
        </div>
        {!entries.data ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-content text-txt-black-700 px-4 py-10 text-center">
            {debounced || status || category ? t("listing.none.filtered") : t("listing.none")}
          </p>
        ) : (
          <ul className="divide-otl-gray-200 m-0 flex list-none flex-col divide-y p-0">
            {items.map((entry, i) => (
              <li key={entry.id}>
                <Link
                  to="/pages/$id/edit"
                  params={{ id: entry.id }}
                  aria-current={i === index || undefined}
                  className={clx(
                    "hover:bg-bg-gray-50 focus-ring flex flex-col gap-1 px-4 py-3 transition-colors duration-150 ease-out",
                    i === index && "bg-bg-primary-50 hover:bg-bg-primary-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-content text-txt-black-900 truncate font-medium">
                      {entry.title || t("page.untitled")}
                    </span>
                    {entry.entry.pinned && (
                      <Tag size="small" className="shrink-0">
                        {t("listing.pinned")}
                      </Tag>
                    )}
                  </span>
                  <span className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                    <PageStatusTag status={entry.status} />
                    <span title={t("listing.column.date")}>
                      {formatDateTime(entry.entry.publishAt)}
                    </span>
                    {entry.entry.category && (
                      <span className="before:mr-2 before:content-['·']">
                        {categoryName(entry.entry.category)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-otl-gray-200 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-label-compact text-txt-black-500 flex items-center gap-1">
            <Kbd combo="j" /> <Kbd combo="k" /> {t("listing.keys.move")} · <Kbd combo="e" />{" "}
            {t("listing.keys.edit")} · <Kbd combo="o" /> {t("listing.keys.open")}
          </span>
          {pages > 1 && (
            <nav aria-label={t("listing.paging")} className="flex items-center gap-2">
              <span className="text-body-sm text-txt-black-700 tabular-nums">
                {t("media.pageOf", { page, pages })}
              </span>
              <Button
                variant="default-outline"
                size="small"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="default-outline"
                size="small"
                disabled={page === pages}
                onClick={() => setPage((n) => n + 1)}
              >
                {t("common.next")}
              </Button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

/** The collection's own settings, as a section of the page drawer's Settings tab. */
export function CollectionSettings({ listing }: { listing: Page }) {
  const detail = useListing(listing.id);
  if (!detail.data) return <Skeleton className="h-40 w-full" />;
  return (
    <ListingForm
      key={JSON.stringify(detail.data.settings)}
      listing={listing}
      settings={detail.data.settings}
    />
  );
}

/** Named choices with addresses (categories, locations): a row each, the address following the name until it's edited. */
function SlugNameRows({
  kind,
  rows,
  onChange,
  addLabel,
}: {
  kind: "category" | "location";
  rows: { slug: string; name: string }[];
  onChange: (rows: { slug: string; name: string }[]) => void;
  addLabel: string;
}) {
  return (
    <>
      {rows.map((row, i) => (
        <div key={`${kind}${i}`} className="flex items-end gap-2">
          <Field name={`${kind}-name-${i}`} className="flex-1">
            {/* The column names show once, over the first row. */}
            <FieldLabel className={i > 0 ? "sr-only" : undefined}>
              {t("listing.categories.name")}
            </FieldLabel>
            <Input
              value={row.name}
              maxLength={60}
              onChange={(e) => {
                const name = e.target.value;
                onChange(
                  rows.map((r, k) => (k === i ? { name, slug: r.slug || slugify(name) } : r)),
                );
              }}
            />
          </Field>
          <Field name={`${kind}-slug-${i}`} className="flex-1">
            <FieldLabel className={i > 0 ? "sr-only" : undefined}>
              {t("listing.categories.slug")}
            </FieldLabel>
            <Input
              value={row.slug}
              maxLength={80}
              onChange={(e) =>
                onChange(rows.map((r, k) => (k === i ? { ...r, slug: e.target.value } : r)))
              }
            />
          </Field>
          <Button
            variant="danger-ghost"
            iconOnly
            aria-label={t("navigation.remove", { label: row.name })}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="default-outline"
          size="small"
          onClick={() => onChange([...rows, { name: "", slug: "" }])}
        >
          <PlusIcon /> {addLabel}
        </Button>
      </div>
    </>
  );
}

const entryBlocks = blocksFor("entry");
/** For the example address of the year pattern. */
const THIS_YEAR = new Date().getFullYear();

function ListingForm({ listing, settings }: { listing: Page; settings: ListingSettings }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState(settings);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (next: Partial<ListingSettings>) => setValue((v) => ({ ...v, ...next }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const saved = await listingApi.save(listing.id, value);
      queryClient.setQueryData(["listing", listing.id], saved);
      toast({ variant: "success", title: t("listing.saved") });
    } catch (caught) {
      const body = await apiError(caught);
      setError(body?.details?.[0]?.message ?? body?.message ?? t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  };

  return (
    // In a Settings section: the rows stack while the drawer is narrow, and sit beside
    // their titles when it's wide.
    <form noValidate onSubmit={(e) => void save(e)} className="@container flex flex-col pt-2">
      <FormRow title={t("listing.categories")} description={t("listing.categories.hint")}>
        <SlugNameRows
          kind="category"
          rows={value.categories}
          onChange={(categories) => set({ categories })}
          addLabel={t("listing.categories.add")}
        />
      </FormRow>
      <FormRow title={t("listing.sort")} description={t("listing.sort.hint")}>
        <Field name="listing-sort">
          <Fieldset
            className="flex-row flex-wrap gap-x-6 gap-y-2"
            render={
              <Radio
                value={value.sort}
                onValueChange={(v) => set({ sort: v as ListingSettings["sort"] })}
              />
            }
          >
            <FieldsetLegend className="sr-only">{t("listing.sort")}</FieldsetLegend>
            {(["publishAt", "eventStart"] as const).map((sort) => (
              <FieldItem key={sort} className="w-auto">
                <RadioItem>
                  <RadioButton value={sort} id={`sort-${sort}`} />
                  <RadioLabel htmlFor={`sort-${sort}`}>{t(`listing.sort.${sort}`)}</RadioLabel>
                </RadioItem>
              </FieldItem>
            ))}
          </Fieldset>
        </Field>
      </FormRow>
      <FormRow title={t("listing.locations")} description={t("listing.locations.hint")}>
        <SlugNameRows
          kind="location"
          rows={value.locations}
          onChange={(locations) => set({ locations })}
          addLabel={t("listing.locations.add")}
        />
      </FormRow>
      <FormRow title={t("listing.pattern")} description={t("listing.pattern.hint")}>
        <Field name="address-pattern">
          <Fieldset
            className="flex-row flex-wrap gap-x-6 gap-y-2"
            render={
              <Radio
                value={value.addressPattern}
                onValueChange={(v) => set({ addressPattern: v as "slug" | "year" })}
              />
            }
          >
            <FieldsetLegend className="sr-only">{t("listing.pattern")}</FieldsetLegend>
            {(["slug", "year"] as const).map((pattern) => (
              <FieldItem key={pattern} className="w-auto">
                <RadioItem>
                  <RadioButton value={pattern} id={`pattern-${pattern}`} />
                  <RadioLabel htmlFor={`pattern-${pattern}`} className="font-mono">
                    {`${listing.path === "/" ? "" : listing.path}${pattern === "year" ? `/${THIS_YEAR}` : ""}/tajuk`}
                  </RadioLabel>
                </RadioItem>
              </FieldItem>
            ))}
          </Fieldset>
        </Field>
      </FormRow>
      <FormRow title={t("listing.starting")}>
        {/* Compact cards: the block's icon and name, with what it's for on hover. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {entryBlocks.map((type) => {
            const block = blockDefinition(type);
            const on = value.startingBlocks.includes(type);
            return (
              <label
                key={type}
                htmlFor={`starting-${type}`}
                title={blockDescription(type)}
                className={clx(choiceCard, "items-center rounded-md px-3 py-2")}
              >
                <span
                  aria-hidden
                  className={clx(
                    "grid size-7 shrink-0 place-items-center rounded-md",
                    on ? "bg-bg-primary-100 text-txt-primary" : "bg-bg-washed text-txt-black-700",
                  )}
                >
                  <BlockIcon name={block.icon} className="size-4" />
                </span>
                <span className="text-content text-txt-black-900 min-w-0 flex-1 truncate font-medium">
                  {blockLabel(type)}
                </span>
                <Checkbox
                  id={`starting-${type}`}
                  checked={on}
                  onCheckedChange={(checked) =>
                    set({
                      startingBlocks: checked
                        ? [...value.startingBlocks, type]
                        : value.startingBlocks.filter((b) => b !== type),
                    })
                  }
                />
              </label>
            );
          })}
        </div>
      </FormRow>
      <FormRow title={t("listing.feed")}>
        <Field name="rss">
          <FieldItem>
            <Checkbox checked={value.rss} onCheckedChange={(rss) => set({ rss })} />
            <FieldLabel>{t("listing.rss")}</FieldLabel>
          </FieldItem>
        </Field>
      </FormRow>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="default-outline" disabled={busy}>
          {t("common.saveChanges")}
        </Button>
        {error && <p className="text-content text-txt-danger">{error}</p>}
      </div>
    </form>
  );
}
