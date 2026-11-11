import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useCopy } from "@/lib/ftds/hooks/use-copy";
import { Screen } from "@/components/screen";

/**
 * Shown when a screen throws while rendering or loading. Inside the admin it
 * takes only the screen's place, so the sidebar and header stay: the way
 * on is always there. Saved work is safe, and what to tell whoever runs the
 * builder (each agency runs its own) is one copy away.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  // When it happened: fixed at the first render, not each one after.
  const [at] = useState(() => new Date().toISOString());
  const what = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const details = [
    what,
    `${t("error.details.where")}: ${window.location.pathname}`,
    `${t("error.details.when")}: ${at}`,
  ].join("\n");
  const [copied, copy] = useCopy(details);

  const again = () => {
    reset();
    void router.invalidate();
  };

  return (
    <Screen className="gap-stack-md max-w-2xl">
      <h1 className="text-heading-xs text-txt-black-900 font-semibold">{t("error.title")}</h1>
      <p className="text-body-md text-txt-black-700">{t("error.body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary-fill" onClick={again}>
          {t("error.retry")}
        </Button>
        <Button variant="default-outline" render={<Link to="/pages" />}>
          {t("error.toPages")}
        </Button>
        <Button variant="default-ghost" render={<Link to="/" />}>
          {t("error.toDashboard")}
        </Button>
      </div>
      <div className="border-otl-gray-200 gap-stack-sm flex flex-col border-t pt-4">
        <h2 className="text-label-md text-txt-black-900 font-semibold">
          {t("error.report.title")}
        </h2>
        <p className="text-body-sm text-txt-black-700">{t("error.report.body")}</p>
        <pre className="bg-bg-washed text-body-sm text-txt-black-700 overflow-x-auto rounded-md p-3 whitespace-pre-wrap">
          {details}
        </pre>
        <div className="flex items-center gap-3">
          <button type="button" className={`text-body-sm ${linkClass}`} onClick={() => void copy()}>
            {t("error.report.copy")}
          </button>
          <output className="text-body-sm text-txt-success">
            {copied && t("error.report.copied")}
          </output>
        </div>
      </div>
    </Screen>
  );
}
