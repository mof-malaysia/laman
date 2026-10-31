import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Shown when a route throws while rendering or loading. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  console.error(error);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t("error.title")}</h1>
      <p className="text-txt-black-700">{t("error.body")}</p>
      <div>
        <Button onClick={reset}>{t("error.retry")}</Button>
      </div>
    </section>
  );
}
