/** The builder's square mark, beside its name in the sidebar and on the sign-in screens. */
import { t } from "@/i18n";

export function BrandMark() {
  return (
    <span
      aria-hidden
      className="bg-bg-primary-600 text-txt-white text-label-md grid size-7 shrink-0 place-content-center rounded-md font-semibold"
    >
      {t("shell.brand")}
    </span>
  );
}
