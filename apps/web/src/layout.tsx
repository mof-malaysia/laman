import { Link, Outlet } from "@tanstack/react-router";
import { Skiplink } from "@/components/ui/skiplink";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { t } from "@/i18n";

export function RootLayout() {
  return (
    <div className="relative flex min-h-screen flex-col bg-bg-white text-txt-black-900">
      <Skiplink href="#main">{t("layout.skipToContent")}</Skiplink>
      <header className="flex items-center justify-between gap-4 bg-bg-washed px-6 py-3">
        <Link to="/" className="font-semibold">
          {t("app.name")}
        </Link>
        <ThemeSwitch />
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
