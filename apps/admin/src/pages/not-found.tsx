import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** An admin address that doesn't exist: laid out like the error screen, with the way home. */
export function NotFoundPage() {
  return (
    <section className="p-surface gap-stack-md flex max-w-2xl flex-col">
      <h1 className="text-heading-xs text-txt-black-900 font-semibold">{t("notFound.title")}</h1>
      <p className="text-body-md text-txt-black-700">{t("notFound.body")}</p>
      <div>
        <Button variant="primary-fill" render={<Link to="/" />}>
          {t("notFound.home")}
        </Button>
      </div>
    </section>
  );
}
