import { EmptyState, EmptyStateDescription, EmptyStateTitle } from "@/components/ui/empty-state";
import { PageHeader, PageHeaderContent, PageHeaderTitle } from "@/components/ui/page-header";
import { type MessageKey, t } from "@/i18n";
import { Screen } from "@/components/screen";

/** A rail destination whose screen isn't built yet. */
export function SectionPage({ title }: { title: MessageKey }) {
  return (
    <Screen>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t(title)}</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <EmptyState>
        <EmptyStateTitle>{t("section.soon")}</EmptyStateTitle>
        <EmptyStateDescription>{t("section.soonBody")}</EmptyStateDescription>
      </EmptyState>
    </Screen>
  );
}
