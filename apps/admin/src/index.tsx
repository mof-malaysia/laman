import "@fontsource-variable/inter";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setLanguage } from "./i18n";
import { preferencesApi } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// The admin is compact throughout (DESIGN.md, Layout). Set on <html>, not only
// on the AppShell, so drawers, dialogs, menus and toasts, which render in
// portals outside the shell, are compact too.
document.documentElement.dataset.density = "compact";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

/** The admin's language, before anything shows. When it can't be read, English. */
async function loadLanguage() {
  try {
    await setLanguage((await preferencesApi.get()).language);
  } catch {
    // The screens say when the server can't be reached.
  }
}

async function start(container: HTMLElement) {
  // The app downloads while the language loads, but runs only after it's set:
  // some modules format dates at load.
  const app = import(/* webpackPreload: true */ "./router");
  await loadLanguage();
  const { router } = await app;
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start(root);
