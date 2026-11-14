import type { PageSummary } from "@laman/contracts";
import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { LiveTag } from "@/components/page-status";
import { t } from "@/i18n";

type Option = { value: string; label: string; path: string; status: PageSummary["status"] };

/**
 * Picks a page from the tree by title or path. Put it in a Field. Pages in
 * `exclude` aren't offered. With `showStatus`, each says whether it's published,
 * for links that visitors only see once their page is.
 */
export function PagePicker({
  pages,
  value,
  onValueChange,
  exclude,
  showStatus = false,
  placeholder = t("pagePicker.placeholder"),
}: {
  pages: PageSummary[];
  value: string | null;
  onValueChange: (id: string | null) => void;
  exclude?: Set<string>;
  showStatus?: boolean;
  placeholder?: string;
}) {
  const options = useMemo(
    () =>
      pages
        .filter((p) => !exclude?.has(p.id))
        .map((p): Option => ({
          value: p.id,
          label: p.title || t("page.untitled"),
          path: p.path,
          status: p.status,
        })),
    [pages, exclude],
  );
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox<Option>
      items={options}
      value={selected}
      onValueChange={(option) => onValueChange(option?.value ?? null)}
      itemToStringLabel={(option) => `${option.label} (${option.path})`}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <ComboboxInput placeholder={placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>{t("pagePicker.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{option.label}</span>
                <span className="text-label-compact text-txt-black-700 truncate">
                  {option.path}
                </span>
              </span>
              {showStatus && <LiveTag page={option} />}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
