/** Whether someone signs in with two-factor: on Users and Account. */
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";

export function TwoFactorTag({ on }: { on: boolean }) {
  return on ? (
    <Tag size="small" variant="success">
      {t("users.twoFactor.on")}
    </Tag>
  ) : (
    <Tag size="small">{t("users.twoFactor.off")}</Tag>
  );
}
