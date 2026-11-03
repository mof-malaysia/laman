import "@fontsource-variable/inter";
import "./styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setLanguage } from "./i18n";
import { whenSignedOut } from "./lib/api";
import { meQuery } from "./lib/auth";
import { sessionLost } from "./lib/session";
import { queryClient } from "./lib/query";

// The admin is compact throughout (DESIGN.md, Layout). Set on <html>, not only
// on the AppShell, so drawers, dialogs, menus and toasts, which render in
// portals outside the shell, are compact too.
document.documentElement.dataset.density = "compact";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

/**
 * The admin's language, before anything shows: the signed-in person's, read
 * with who they are, which the router then has ready. Signed out, English.
 */
async function loadLanguage() {
  const me = await queryClient.fetchQuery(meQuery).catch(() => undefined);
  await setLanguage(me?.language ?? "en");
}

async function start(container: HTMLElement) {
  // The app downloads while the language loads, but runs only after it's set:
  // some modules format dates at load.
  const app = import(/* webpackPreload: true */ "./router");
  await loadLanguage();
  const { router } = await app;
  // Signed out mid-session: ask them to sign in again where they are (SignInAgain), so
  // nothing on screen is lost. Signed out before that, the router sends them to Sign in.
  whenSignedOut(() => {
    if (queryClient.getQueryData(meQuery.queryKey)) sessionLost.set(true);
  });
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start(root);
