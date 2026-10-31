/**
 * Routes, defined in code. Add a page: create it in src/pages, add a
 * createRoute() here and list it in routeTree.
 */
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./layout";
import { ErrorPage } from "./pages/error";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/not-found";

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const routeTree = rootRoute.addChildren([homeRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
