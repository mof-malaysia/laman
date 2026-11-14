/**
 * Where a link goes: a page picked from the tree (it follows renames and moves), or,
 * with the switch on, a web address on another website.
 */
import type { LinkTarget } from "@laman/contracts";
import { useId } from "react";
import { PagePicker } from "@/components/page-picker";
import { isLive } from "@/components/page-status";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  const id = useId();
  const pages = usePages();
  const chosen = value.kind === "page" ? pages.data?.find((p) => p.id === value.pageId) : undefined;
  // A page link whose page has gone (deleted or purged): say so, rather than show an empty picker.
  const gone = value.kind === "page" && Boolean(value.pageId) && Boolean(pages.data) && !chosen;
  const external = value.kind === "url";
  return (
    <Field name={name} invalid={Boolean(error)}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <span className="flex items-center gap-2">
          <label htmlFor={`${id}-external`} className="text-label-sm text-txt-black-700">
            {t("nav.target.url")}
          </label>
          <Switch
            id={`${id}-external`}
            size="small"
            checked={external}
            // Switching starts empty: the officer chooses the page or types the address.
            onCheckedChange={(on) =>
              onChange(on ? { kind: "url", url: "" } : { kind: "page", pageId: "" })
            }
          />
        </span>
      </div>
      {value.kind === "page" ? (
        <PagePicker
          pages={pages.data ?? []}
          value={value.pageId || null}
          showStatus
          onValueChange={(pageId) => {
            onBlur?.();
            onChange(
              { kind: "page", pageId: pageId ?? "" },
              pages.data?.find((p) => p.id === pageId)?.title,
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
      {/* Only the case that needs saying: a page visitors can't see yet, so neither the link. */}
      {chosen && !isLive(chosen) && !error && (
        <p className="text-body-sm text-txt-black-700">{t("nav.target.notLive")}</p>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
