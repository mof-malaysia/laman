import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { Screen } from "@/components/screen";

/** An admin address that doesn't exist: laid out like the error screen, with the way home. */
export function NotFoundPage() {
  return (
    <Screen className="gap-stack-md max-w-2xl">
      <h1 className="text-heading-xs text-txt-black-900 font-semibold">{t("notFound.title")}</h1>
      <p className="text-body-md text-txt-black-700">{t("notFound.body")}</p>
      <div>
        <Button variant="primary-fill" render={<Link to="/" />}>
          {t("notFound.home")}
        </Button>
      </div>
    </Screen>
  );
}
