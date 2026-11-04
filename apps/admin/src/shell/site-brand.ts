/**
 * The live site's name, logo and favicon, for the admin's own brand: the
 * sidebar shows them, and the browser tab carries the site's name and icon,
 * so an officer with several sites open can tell their tabs apart. Each
 * follows a publish (which refreshes the settings), and a publish made
 * elsewhere (another officer, an agent) when the window is next focused.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { t } from "@/i18n";
import { mediaQuery, siteApi } from "@/lib/api";

const STALE = 60_000;

export function useSiteBrand() {
  // Its own entry under ["settings"]: a publish refreshes it with the rest, and
  // refetching on focus never swaps the settings editor's copy, whose version
  // its next save starts from.
  const settings = useQuery({
    queryKey: ["settings", "brand"],
    queryFn: siteApi.settings,
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });
  const identity = settings.data?.published.identity;
  const logo = useQuery({ ...mediaQuery(identity?.logo?.mediaId), staleTime: STALE });
  const favicon = useQuery({ ...mediaQuery(identity?.favicon?.mediaId), staleTime: STALE });
  return { settings, identity, logo, favicon };
}

/** The tab's title and icon: "Site name · Laman" and the site's favicon, Laman's until there is one. */
export function useSiteTab() {
  const { identity, favicon } = useSiteBrand();
  const siteName = identity?.siteName;
  const iconUrl = identity?.favicon ? favicon.data?.thumbnailUrl : undefined;

  useEffect(() => {
    document.title = siteName ? `${siteName} · ${t("app.name")}` : t("app.name");
  }, [siteName]);

  useEffect(() => {
    // The build writes Laman's icon; keep its address to go back to.
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;
    link.dataset.default ??= link.href;
    const href = iconUrl ?? link.dataset.default;
    if (link.href !== new URL(href, location.href).href) link.href = href;
    // An SVG favicon's type would be wrong for the site's PNG or WebP one.
    link.removeAttribute("type");
  }, [iconUrl]);
}
