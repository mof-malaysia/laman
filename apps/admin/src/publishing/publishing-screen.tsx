/**
 * Publishing, built around what will change: Ready to publish lists what
 * isn't live and shows each change as the site has it beside what publishing
 * makes of it; History is every publish, with the way to put one back.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useSiteState } from "@/components/site-state";
import { PublishConfirm, PublishOutcome, useWaitingPublish } from "@/components/waiting-list";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { PageHeaderTitle } from "@/components/ui/page-header";
import { Callout, CalloutAction, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Tabs, TabsContent, TabsCounter, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { useCan } from "@/lib/auth";
import { UploadGlyph } from "@/pages/site/line-icons";
import { Compare } from "./compare";
import { PublishingHistory } from "./history";

type Tab = "ready" | "history";

export function PublishingScreen() {
  const search = useSearch({ from: "/signed-in/shell/publishing" });
  const navigate = useNavigate();
  const tab: Tab = search.tab ?? "ready";
  const go = (next: Tab) =>
    void navigate({
      to: "/publishing",
      search: next === "history" ? { tab: "history" } : {},
      replace: true,
    });

  const state = useWaitingPublish();
  const { state: site } = useSiteState();
  const canPublish = useCan("content.publish");
  const [confirming, setConfirming] = useState(false);
  const items = state.waiting.items.length;

  return (
    // From md up the comparison scrolls in its own panes, so the screen fills the main area.
    <div className="h-full overflow-y-auto md:overflow-hidden">
      <Tabs
        value={tab}
        onValueChange={(value) => go(value as Tab)}
        render={<Screen className="text-body-sm h-full min-h-0" />}
      >
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <PageHeaderTitle size="headline">{t("nav.publishing")}</PageHeaderTitle>
          <TabsList>
            <TabsTrigger value="ready">
              {t("publishing.tab.ready")}
              {items > 0 && <TabsCounter>{items}</TabsCounter>}
            </TabsTrigger>
            <TabsTrigger value="history">{t("publishing.tab.history")}</TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          {tab === "ready" && canPublish && items > 0 && (
            <Button
              variant="primary-fill"
              disabled={state.busy || state.count === 0}
              onClick={() => setConfirming(true)}
            >
              <UploadGlyph className="size-[18px]" />
              {state.busy
                ? t("publish.busy")
                : state.count === 0
                  ? t("publishing.nothingTicked")
                  : state.label}
            </Button>
          )}
        </header>

        {/* The one state an occasional officer must not miss, whichever tab is open. */}
        {site === "failed" && state.outcome.status !== "failed" && (
          <Callout variant="danger">
            <CalloutTitle>{t("home.status.failed")}</CalloutTitle>
            <CalloutContent>{t("publishing.status.failedBody")}</CalloutContent>
            {tab === "ready" && (
              <CalloutAction>
                <Button variant="default-outline" size="small" onClick={() => go("history")}>
                  {t("home.seeWhy")}
                </Button>
              </CalloutAction>
            )}
          </Callout>
        )}

        <TabsContent value="ready" className="gap-stack-lg flex min-h-0 flex-1 flex-col">
          <PublishOutcome state={state} />
          <Compare state={state} item={search.item} />
          {items > 0 && !canPublish && (
            <p className="text-txt-black-700 m-0">{t("waiting.byManager")}</p>
          )}
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <PublishingHistory />
        </TabsContent>
      </Tabs>
      <PublishConfirm state={state} open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}
