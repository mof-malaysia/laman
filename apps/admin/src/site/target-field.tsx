/** Where a link goes: a page picked from the tree (it follows renames and moves) or a web address. */
import type { LinkTarget } from "@fiscal-sb/contracts";
import { PagePicker } from "@/components/page-picker";
import { LiveTag, isLive } from "@/components/page-status";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { t } from "@/i18n";
import { usePages } from "@/lib/pages";

export function TargetField({
  name,
  label = t("nav.target"),
  value,
  error,
  onChange,
  onBlur,
}: {
  name: string;
  label?: string;
  value: LinkTarget;
  error?: string | undefined;
  /** With the chosen page's title, so a link with no label yet can take it. */
  onChange: (target: LinkTarget, pageTitle?: string) => void;
  onBlur?: () => void;
}) {
  const pages = usePages();
  const chosen = value.kind === "page" ? pages.data?.find((p) => p.id === value.pageId) : undefined;
  // A page link whose page has gone (deleted or purged): say so, rather than show an empty picker.
  const gone = value.kind === "page" && Boolean(value.pageId) && Boolean(pages.data) && !chosen;
  return (
    <Field name={name} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        size="small"
        value={[value.kind]}
        aria-label={label}
        onValueChange={(v) => {
          // Switching starts empty: the officer chooses the page or types the address.
          if (v[0] === "page" && value.kind !== "page") onChange({ kind: "page", pageId: "" });
          if (v[0] === "url" && value.kind !== "url") onChange({ kind: "url", url: "" });
        }}
      >
        <Toggle value="page">{t("nav.target.page")}</Toggle>
        <Toggle value="url">{t("nav.target.url")}</Toggle>
      </ToggleGroup>
      {value.kind === "page" ? (
        <PagePicker
          pages={pages.data ?? []}
          value={value.pageId || null}
          showStatus
          onValueChange={(id) => {
            onBlur?.();
            onChange(
              { kind: "page", pageId: id ?? "" },
              pages.data?.find((p) => p.id === id)?.title,
            );
          }}
        />
      ) : (
        <Input
          type="url"
          value={value.url}
          placeholder="https://"
          onBlur={onBlur}
          onChange={(e) => onChange({ kind: "url", url: e.target.value })}
        />
      )}
      {gone && !error && <p className="text-body-sm text-txt-warning">{t("nav.target.gone")}</p>}
      {chosen && !error && (
        <p className="text-body-sm text-txt-black-700 flex items-center gap-2">
          <LiveTag page={chosen} />
          {t(isLive(chosen) ? "nav.target.live" : "nav.target.notLive")}
        </p>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
