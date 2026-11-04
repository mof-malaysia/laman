/** "CMS" beside the builder's name, in the sidebar and on the sign-in screens. */
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";

export function AppTag({ className }: { className?: string }) {
  // White with a hairline: both places sit on the washed grey, which is the default tag's own.
  return (
    <Tag size="small" className={`bg-bg-white border-otl-gray-200 border ${className ?? ""}`}>
      {t("app.tag")}
    </Tag>
  );
}
