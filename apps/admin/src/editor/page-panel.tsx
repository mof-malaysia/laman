/**
 * The properties panel with nothing selected: the page's title and address,
 * and the SEO fields from the Pages screen.
 */
import { type PageDocument, Slug } from "@fiscal-sb/blocks";
import type { Page } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterCount } from "@/components/ui/character-count";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n";
import { apiError, listingApi, pagesApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import { fixedAddress, useRefreshPages } from "@/lib/pages";
import { MediaField } from "./media-field";

type EntryFields = NonNullable<PageDocument["entry"]>;

/** A date-time input's value (local time) from an ISO time, and back. */
const pad = (n: number) => String(n).padStart(2, "0");
const localOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** An entry's fixed fields: the article layout draws its header from them. */
function EntryFieldsEditor({
  page,
  entry,
  onDoc,
}: {
  page: Page;
  entry: EntryFields;
  onDoc: PagePanelProps["onDoc"];
}) {
  const listing = useQuery({
    queryKey: ["listing", page.parentId],
    queryFn: () => listingApi.get(page.parentId ?? ""),
    enabled: Boolean(page.parentId),
  });
  const categories = listing.data?.settings.categories ?? [];
  // Header changes show on the canvas, so these edits re-render it.
  const set = (next: Partial<EntryFields>, key: string) =>
    onDoc((d) => ({ ...d, entry: { ...(d.entry ?? entry), ...next } }), key, true);
  return (
    <section
      className="border-otl-gray-200 flex flex-col gap-3 border-t pt-5"
      aria-labelledby="entry-fields"
    >
      <h3 id="entry-fields" className="text-label-compact text-txt-black-500 font-medium uppercase">
        {t("entry.fields")}
      </h3>
      <Field name="entry-publish-at">
        <FieldLabel>{t("entry.publishAt")}</FieldLabel>
        <FieldDescription>{t("entry.publishAtHint")}</FieldDescription>
        <Input
          type="datetime-local"
          value={localOf(entry.publishAt)}
          onChange={(e) => {
            const date = new Date(e.target.value);
            if (!Number.isNaN(date.getTime()))
              set({ publishAt: date.toISOString() }, "entry.publishAt");
          }}
        />
      </Field>
      {categories.length > 0 && (
        <Field name="entry-category">
          <FieldLabel>{t("entry.category")}</FieldLabel>
          <Select
            items={categories.map((c) => ({ value: c.slug, label: c.name }))}
            value={entry.category ?? ""}
            clearable
            placeholder={t("editor.field.none")}
            onValueChange={(v: string) => set({ category: v || undefined }, "entry.category")}
          />
        </Field>
      )}
      <Field name="entry-summary">
        <FieldLabel>{t("entry.summary")}</FieldLabel>
        <FieldDescription>{t("entry.summaryHint")}</FieldDescription>
        <CharacterCount
          limit={200}
          rows={3}
          value={entry.summary ?? ""}
          onValueChange={(summary) => set({ summary: summary || undefined }, "entry.summary")}
        />
      </Field>
      <MediaField
        title={t("entry.cover")}
        value={entry.cover}
        required={false}
        error={undefined}
        onChange={(cover) => set({ cover }, "entry.cover")}
      />
      <Field name="entry-pinned">
        <FieldItem>
          <Checkbox
            checked={entry.pinned ?? false}
            onCheckedChange={(pinned) => set({ pinned: pinned || undefined }, "entry.pinned")}
          />
          <FieldLabel>{t("entry.pinned")}</FieldLabel>
        </FieldItem>
      </Field>
    </section>
  );
}

type PagePanelProps = {
  page: Page;
  doc: PageDocument;
  onDoc: (update: (doc: PageDocument) => PageDocument, key: string, rerender?: boolean) => void;
};

export function PagePanel({ page, doc, onDoc }: PagePanelProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <p className="bg-bg-primary-50 text-body-sm text-txt-black-900 rounded-md px-3 py-2">
        {t("editor.page.hint")}
      </p>
      <Field name="page-title">
        <FieldLabel>{t("editor.page.titleLabel")}</FieldLabel>
        <FieldDescription>{t("editor.page.titleHint")}</FieldDescription>
        <Input
          value={doc.ms.title}
          maxLength={160}
          onChange={(e) => {
            const title = e.target.value;
            onDoc((d) => ({ ...d, ms: { ...d.ms, title } }), "page.title");
          }}
        />
      </Field>
      {page.kind === "entry" && doc.entry && (
        <EntryFieldsEditor page={page} entry={doc.entry} onDoc={onDoc} />
      )}
      {fixedAddress(page) ? (
        <Field name="page-path">
          <FieldLabel>{t("editor.page.address")}</FieldLabel>
          <Input value={page.path} disabled />
        </Field>
      ) : (
        <SlugField key={page.slug} page={page} />
      )}
      <section
        className="border-otl-gray-200 flex flex-col gap-3 border-t pt-5"
        aria-labelledby="page-seo"
      >
        <h3 id="page-seo" className="text-label-md text-txt-black-900 font-semibold">
          {t("detail.tab.seo")}
        </h3>
        <Field name="page-description">
          <FieldLabel>{t("seo.description.label")}</FieldLabel>
          <CharacterCount
            limit={160}
            rows={3}
            value={doc.ms.description ?? ""}
            onValueChange={(value) =>
              onDoc(
                (d) => ({ ...d, ms: { ...d.ms, description: value || undefined } }),
                "page.description",
              )
            }
          />
        </Field>
        <Field name="page-noindex">
          <FieldItem>
            <Checkbox
              checked={doc.seo?.noindex ?? false}
              onCheckedChange={(checked) =>
                onDoc(
                  (d) => ({ ...d, seo: { ...d.seo, noindex: checked || undefined } }),
                  "page.noindex",
                )
              }
            />
            <FieldLabel>{t("seo.noindex")}</FieldLabel>
          </FieldItem>
        </Field>
        <Field name="page-sitemap">
          <FieldItem>
            <Checkbox
              checked={doc.seo?.sitemap === false}
              onCheckedChange={(checked) =>
                onDoc(
                  (d) => ({ ...d, seo: { ...d.seo, sitemap: checked ? false : undefined } }),
                  "page.sitemap",
                )
              }
            />
            <FieldLabel>{t("seo.noSitemap")}</FieldLabel>
          </FieldItem>
        </Field>
      </section>
    </div>
  );
}

/** The slug changes the address at once (not with the draft), so it has its own button. */
function SlugField({ page }: { page: Page }) {
  const refresh = useRefreshPages();
  const { toast } = useToast();
  const [slug, setSlug] = useState(page.slug);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!Slug.safeParse(slug).success) return setError(t("newPage.slug.invalid"));
    setError(undefined);
    setBusy(true);
    try {
      const { changes } = await pagesApi.move(page.id, { slug, redirect: page.status !== "draft" });
      await refresh(page.id);
      toast({ variant: "success", title: t("editor.page.moved", { count: changes.length }) });
    } catch (caught) {
      const body = await apiError(caught);
      setError(
        body?.code === "slug_taken"
          ? t("newPage.slug.taken")
          : (body?.message ?? t("common.tryAgain")),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field name="page-slug" invalid={Boolean(error)}>
      <FieldLabel>{t("editor.page.address")}</FieldLabel>
      <FieldDescription>{t("editor.page.addressHint", { path: page.path })}</FieldDescription>
      <div className="flex gap-2">
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Button
          variant="default-outline"
          disabled={busy || slug === page.slug}
          onClick={() => void save()}
        >
          {t("editor.page.changeAddress")}
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
