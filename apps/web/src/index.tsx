import "@fontsource-variable/inter";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/lib/ftds/hooks";
import { router } from "./router";
import { THEME_KEY } from "./theme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The inline script in rsbuild.config.ts has already applied the saved (or OS) theme.
const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey={THEME_KEY} defaultTheme={theme}>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
