/**
 * A listing page's own parts of the Pages screen: writing an entry, the
 * entries table (newest first, pinned on top, with search, filters and
 * paging), and the listing settings.
 */
import { type ListingSettings, blockDefinition, blocksFor, slugify } from "@fiscal-sb/blocks";
import type { EntrySummary, ListingDetail, Page, PageStatus } from "@fiscal-sb/contracts";
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
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { EditIcon } from "@/components/ui/icons/edit";
import { PlusIcon } from "@/components/ui/icons/plus";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Radio, RadioButton, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { useShortcut, useShortcutScope } from "@/components/ui/shortcuts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { blockDescription, blockLabel } from "@/i18n/registry";
import { apiError, listingApi } from "@/lib/api";
import { clx } from "@/lib/ftds/utils";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDateTime, useRefreshPages } from "@/lib/pages";
import { BlockIcon } from "@/editor/block-meta";
import { FormRow, Panel, card } from "./tab-layout";

export const useListing = (id: string) =>
  useQuery({ queryKey: ["listing", id], queryFn: () => listingApi.get(id) });

/** "1 scheduled · 1 draft · 1 changed". */
export function statusSummary(detail: ListingDetail | undefined) {
  if (!detail) return "";
  const order: PageStatus[] = ["scheduled", "draft", "changed"];
  return order
    .filter((s) => detail.counts[s])
    .map((s) => t(`listing.summary.${s}`, { count: detail.counts[s] ?? 0 }))
    .join(" · ");
}

/** "New entry": a title, then the new entry opens in the editor. */
export function WriteEntryButton({ listing }: { listing: Page }) {
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
            <FieldDescription>{t("listing.write.hint")}</FieldDescription>
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
  // Like the tree: selecting an entry shows its details; editing is a step on.
  const open = (entry: EntrySummary | undefined) =>
    entry && void navigate({ to: "/pages/$id", params: { id: entry.id } });
  const edit = (entry: EntrySummary | undefined) =>
    entry && void navigate({ to: "/pages/$id/edit", params: { id: entry.id } });

  useShortcutScope("entries");
  useShortcut("j", () => setIndex((i) => Math.min(items.length - 1, i + 1)), { scope: "entries" });
  useShortcut("k", () => setIndex((i) => Math.max(0, i - 1)), { scope: "entries" });
  useShortcut("o", () => open(items[index]), { scope: "entries" });
  useShortcut("e", () => edit(items[index]), { scope: "entries" });

  return (
    <div className={`${card} border-otl-gray-200`}>
      <div className="border-otl-gray-200 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("listing.search")}
          aria-label={t("listing.search")}
          className="w-64"
        />
        <Select
          items={statuses.map((s) => ({ value: s, label: t(`page.status.${s}`) }))}
          value={status}
          clearable
          placeholder={t("listing.allStatuses")}
          aria-label={t("listing.status")}
          className="w-44"
          onValueChange={(v: string) => {
            setStatus(v ?? "");
            setPage(1);
          }}
        />
        {categories.length > 0 && (
          <Select
            items={categories.map((c) => ({ value: c.slug, label: c.name }))}
            value={category}
            clearable
            placeholder={t("listing.allCategories")}
            aria-label={t("listing.category")}
            className="w-48"
            onValueChange={(v: string) => {
              setCategory(v ?? "");
              setPage(1);
            }}
          />
        )}
        <span className="text-label-compact text-txt-black-500 ml-auto flex items-center gap-1">
          <Kbd combo="j" /> <Kbd combo="k" /> {t("listing.keys.move")} · <Kbd combo="o" />{" "}
          {t("listing.keys.open")} · <Kbd combo="e" /> {t("listing.keys.edit")}
        </span>
      </div>
      {!entries.data ? (
        <Skeleton className="m-4 h-40" />
      ) : items.length === 0 ? (
        <p className="text-txt-black-700 px-4 py-10 text-center">
          {debounced || status || category ? t("listing.none.filtered") : t("listing.none")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("listing.column.title")}</TableHead>
              <TableHead>{t("listing.column.category")}</TableHead>
              <TableHead>{t("listing.column.status")}</TableHead>
              <TableHead>{t("listing.column.date")}</TableHead>
              <TableHead>{t("listing.column.saved")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("listing.column.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry, i) => (
              <TableRow
                key={entry.id}
                aria-current={i === index || undefined}
                className={clx(i === index && "bg-bg-primary-50")}
              >
                <TableCell>
                  <Link
                    to="/pages/$id"
                    params={{ id: entry.id }}
                    className="text-txt-primary focus-ring rounded-xs text-left font-medium underline underline-offset-[3px]"
                  >
                    {entry.title || t("page.untitled")}
                  </Link>
                  {entry.entry.pinned && (
                    <Tag size="small" className="ml-2">
                      {t("listing.pinned")}
                    </Tag>
                  )}
                </TableCell>
                <TableCell className="text-txt-black-700">
                  {categoryName(entry.entry.category)}
                </TableCell>
                <TableCell>
                  <PageStatusTag status={entry.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatDateTime(entry.entry.publishAt)}
                </TableCell>
                <TableCell className="text-txt-black-700 tabular-nums">
                  {formatDateTime(entry.updatedAt)}
                </TableCell>
                <TableCell className="w-px text-right">
                  <Button
                    variant="default-ghost"
                    size="small"
                    iconOnly
                    aria-label={t("listing.edit", { title: entry.title || t("page.untitled") })}
                    render={<Link to="/pages/$id/edit" params={{ id: entry.id }} />}
                  >
                    <EditIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <nav
          aria-label={t("listing.paging")}
          className="border-otl-gray-200 flex items-center justify-end gap-2 border-t px-4 py-3"
        >
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
  );
}

export function ListingTab({ listing }: { listing: Page }) {
  const detail = useListing(listing.id);
  if (!detail.data) return <Skeleton className="h-40 w-full max-w-5xl" />;
  return (
    <ListingForm
      key={JSON.stringify(detail.data.settings)}
      listing={listing}
      settings={detail.data.settings}
    />
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
    <form noValidate onSubmit={(e) => void save(e)} className="max-w-5xl">
      <Panel
        footer={
          <>
            <Button type="submit" variant="default-outline" disabled={busy}>
              {t("common.saveChanges")}
            </Button>
            {error && <p className="text-content text-txt-danger">{error}</p>}
          </>
        }
      >
        <FormRow title={t("listing.categories")} description={t("listing.categories.hint")}>
          {value.categories.map((category, i) => (
            <div key={`c${i}`} className="flex items-end gap-2">
              <Field name={`category-name-${i}`} className="flex-1">
                {/* The column names show once, over the first row. */}
                <FieldLabel className={i > 0 ? "sr-only" : undefined}>
                  {t("listing.categories.name")}
                </FieldLabel>
                <Input
                  value={category.name}
                  maxLength={60}
                  onChange={(e) => {
                    const name = e.target.value;
                    set({
                      categories: value.categories.map((c, k) =>
                        k === i
                          ? {
                              name,
                              slug: c.slug || slugify(name),
                            }
                          : c,
                      ),
                    });
                  }}
                />
              </Field>
              <Field name={`category-slug-${i}`} className="flex-1">
                <FieldLabel className={i > 0 ? "sr-only" : undefined}>
                  {t("listing.categories.slug")}
                </FieldLabel>
                <Input
                  value={category.slug}
                  maxLength={80}
                  onChange={(e) =>
                    set({
                      categories: value.categories.map((c, k) =>
                        k === i ? { ...c, slug: e.target.value } : c,
                      ),
                    })
                  }
                />
              </Field>
              <Button
                variant="danger-ghost"
                iconOnly
                aria-label={t("navigation.remove", { label: category.name })}
                onClick={() => set({ categories: value.categories.filter((_, k) => k !== i) })}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="default-outline"
              size="small"
              onClick={() => set({ categories: [...value.categories, { name: "", slug: "" }] })}
            >
              <PlusIcon /> {t("listing.categories.add")}
            </Button>
          </div>
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
        <FormRow title={t("listing.starting")} description={t("listing.starting.hint")}>
          {/* Cards as in the editor's block picker: the block's icon, name and what it's for. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {entryBlocks.map((type) => {
              const block = blockDefinition(type);
              const on = value.startingBlocks.includes(type);
              return (
                // The new-page flow's choice card: checked and keyboard focus show on the card.
                <label
                  key={type}
                  htmlFor={`starting-${type}`}
                  className="border-otl-gray-200 bg-bg-white hover:border-otl-gray-300 has-[[data-checked]]:border-otl-primary-300 has-[[data-checked]]:bg-bg-primary-50 has-[:focus-visible]:ring-fr-primary flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-3"
                >
                  <span
                    aria-hidden
                    className={clx(
                      "grid size-8 shrink-0 place-items-center rounded-md",
                      on ? "bg-bg-primary-100 text-txt-primary" : "bg-bg-washed text-txt-black-700",
                    )}
                  >
                    <BlockIcon name={block.icon} className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-content text-txt-black-900 font-medium">
                      {blockLabel(type)}
                    </span>
                    <span
                      id={`starting-${type}-hint`}
                      className="text-body-sm text-txt-black-700 line-clamp-2"
                    >
                      {blockDescription(type)}
                    </span>
                  </span>
                  <Checkbox
                    id={`starting-${type}`}
                    aria-describedby={`starting-${type}-hint`}
                    className="mt-0.5"
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
      </Panel>
    </form>
  );
}
