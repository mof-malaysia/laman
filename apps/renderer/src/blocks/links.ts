/**
 * Whether a link leaves the site: a web address on another host than the
 * site's own (SITE_URL). Paths, anchors and mail links stay; without a site
 * address every web address counts as another website.
 */
export function isExternal(href: string, siteUrl?: string): boolean {
  if (!/^https?:\/\//.test(href)) return false;
  try {
    const host = new URL(href).host;
    return !siteUrl || host !== new URL(siteUrl).host;
  } catch {
    return true;
  }
}
