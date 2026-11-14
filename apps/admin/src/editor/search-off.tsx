import { Link } from "@tanstack/react-router";
import { linkClass } from "@/components/text-link";
import { t } from "@/i18n";

/** Under a listing's "Search this listing" while site search is off: why it can't be ticked, and where to change that. */
export function SearchOffNote() {
  return (
    <p className="text-body-sm text-txt-black-700">
      {t("editor.listingSearch.off")}{" "}
      <Link to="/search" className={linkClass}>
        {t("editor.listingSearch.turnOn")}
      </Link>
    </p>
  );
}
