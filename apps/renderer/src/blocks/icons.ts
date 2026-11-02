/** The FTDS icons a feature or navbar link may use, by the registry's names. */
import type { featureIcons } from "@fiscal-sb/blocks";
import Bell from "@/components/ui/icons/bell.astro";
import Calendar from "@/components/ui/icons/calendar.astro";
import CheckShield from "@/components/ui/icons/check-shield.astro";
import Document from "@/components/ui/icons/document.astro";
import Globe from "@/components/ui/icons/globe.astro";
import GovtOffice from "@/components/ui/icons/govt-office.astro";
import Money from "@/components/ui/icons/money.astro";
import UserGroup from "@/components/ui/icons/user-group.astro";

export const featureIconComponents: Record<(typeof featureIcons)[number], typeof Bell> = {
  money: Money,
  document: Document,
  calendar: Calendar,
  "user-group": UserGroup,
  "govt-office": GovtOffice,
  globe: Globe,
  "check-shield": CheckShield,
  bell: Bell,
};
