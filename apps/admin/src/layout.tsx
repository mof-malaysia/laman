import { Outlet } from "@tanstack/react-router";
import { Skiplink } from "@/components/ui/skiplink";
import { AutoToast } from "@/components/ui/toast";
import { t } from "@/i18n";

/**
 * Every screen fills the window and scrolls inside itself, so the document never does. The
 * root is the containing block for absolutely positioned elements (sr-only text, Base UI's
 * hidden inputs) and clips them, so one low in a long panel can't make the page taller.
 * It clips rather than hides: an overflow-hidden box can still be scrolled, and focusing
 * a control would scroll the whole admin up out of the window.
 */
export function RootLayout() {
  return (
    <div className="bg-bg-white text-txt-black-900 relative h-dvh overflow-clip">
      <Skiplink href="#main">{t("layout.skipToContent")}</Skiplink>
      <Outlet />
      <AutoToast />
    </div>
  );
}
