import { Link } from "@tanstack/react-router";
import { t } from "@/i18n";

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t("notFound.title")}</h1>
      <p className="text-txt-black-700">{t("notFound.body")}</p>
      <Link to="/" className="text-txt-primary underline">
        {t("notFound.home")}
      </Link>
    </section>
  );
}
