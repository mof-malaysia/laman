import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { Greeting } from "@fiscal-sb/contracts";

export function HomePage() {
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: () => api.get("healthz").json<{ ok: boolean }>(),
  });
  const hello = useQuery({
    queryKey: ["hello"],
    queryFn: () =>
      api.get("v1/hello", { searchParams: { name: "FTDS" } }).json<{ data: Greeting }>(),
  });
  const status = health.isPending ? "checking" : health.data?.ok ? "up" : "down";

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{t("home.title")}</h1>
      <p className="text-txt-black-700">{t("home.intro")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Tag variant={status === "up" ? "success" : status === "down" ? "danger" : "default"}>
          {t(`home.api.${status}`)}
        </Tag>
        {hello.data && <span>{hello.data.data.message}</span>}
      </div>
      <div>
        <Button onClick={() => void health.refetch()}>{t("home.api.recheck")}</Button>
      </div>
    </section>
  );
}
