/**
 * Site settings, navigation, the announcement, site search and the theme: each a drafted document
 * with a live copy, kept in the settings table ("settings.draft",
 * "navigation.published", …). Each goes live with its own publish, so
 * publishing one never sends another's half-done changes. `siteContext`
 * resolves them for the renderer.
 */
import {
  ftdsPrimary,
  accentPasses,
  hexToRgb,
  rampPasses,
  type SiteContext,
  type SiteLink,
  type SiteNavItem,
  themeOf,
} from "@laman/blocks";
import {
  type Announcement,
  type AnnouncementDoc,
  announcementShowing,
  type LinkTarget,
  type Navigation,
  type NavigationDoc,
  type NavLink,
  type NavWarning,
  type SearchDoc,
  type SettingsDoc,
  SiteDocName,
  type SiteSearch,
  type SiteSettings,
  type SiteTheme,
  type ThemeChoice,
  type ThemeDoc,
} from "@laman/contracts";
import type { z } from "zod";
import { parseStored, siteDocSchemas } from "../db/documents.js";
import type { Db } from "../db/index.js";
import { HttpError } from "../errors.js";
import { readRow, readStored, writeRow } from "./kv.js";
import { type Loads, once } from "./loads.js";
import { mediaInfo, setUsage } from "./media.js";
import { conflictError, conflictWith, versionOf } from "./versions.js";
import { loadTree, pageTitles, treeOf } from "./tree.js";

type Scope = "draft" | "published";

type DocOf<N extends SiteDocName> = z.infer<(typeof siteDocSchemas)[N]>;
const schemaOf = <N extends SiteDocName>(name: N) =>
  siteDocSchemas[name] as unknown as z.ZodType<DocOf<N>>;

/** The settings a new site starts with; the slice kept its name under "site". */
async function defaultSettings(db: Db): Promise<SiteSettings> {
  const old = (await readRow(db, "site")) as { name?: string } | undefined;
  return {
    identity: {
      siteName: old?.name ?? "Laman Web Agensi",
      agencyName: "",
    },
    appearance: { masthead: true, navbarName: true, footerLogo: true },
    contact: { address: "", phone: "", email: "", hours: "" },
    social: [],
    phase: { phase: "off" },
    search: { hideSite: false, sitemap: true },
    publishing: { scheduleTime: "08:00", revisionsToKeep: 50 },
    analytics: { on: true, retentionDays: 395 },
    embeds: { services: [], hosts: [] },
  };
}

/** A navbar of the pages directly under the home page, as the slice had. */
async function defaultNavigation(db: Db): Promise<Navigation> {
  const tree = await loadTree(db);
  const home = tree.home;
  return {
    navbar: home
      ? tree
          .children(home.id)
          .slice(0, 8)
          .map((node) => ({
            type: "link" as const,
            label: node.slug,
            target: { kind: "page" as const, pageId: node.id },
          }))
      : [],
    footer: { columns: [] },
  };
}

const defaultAnnouncement = (): Announcement => ({
  on: false,
  tag: "Makluman",
  variant: "primary",
  message: "",
  scope: "all",
});

const defaultSearch = (): SiteSearch => ({ on: true, filters: true, pins: [] });

/** FTDS Blue: a site that never chooses colours renders as FTDS ships. */
const defaultTheme = (): SiteTheme => ({ preset: "ftds", primary: ftdsPrimary });

/** A document's draft or live copy; both start as the defaults. */
export async function readDoc<N extends SiteDocName>(
  db: Db,
  name: N,
  scope: Scope,
): Promise<DocOf<N>> {
  const stored = parseStored(
    schemaOf(name),
    await readRow(db, `${name}.${scope}`),
    `${name} (${scope})`,
  );
  if (stored) return stored;
  if (name === "announcement") return defaultAnnouncement() as DocOf<N>;
  if (name === "search") return defaultSearch() as DocOf<N>;
  if (name === "theme") return defaultTheme() as DocOf<N>;
  const fallback = name === "settings" ? await defaultSettings(db) : await defaultNavigation(db);
  // Label default navbar links with the pages' titles.
  if (name === "navigation") await titleLinks(db, fallback as Navigation);
  return fallback as DocOf<N>;
}

async function titleLinks(db: Db, nav: Navigation) {
  const titles = await pageTitles(db);
  for (const item of nav.navbar)
    if (item.type === "link" && item.target.kind === "page")
      item.label = titles.get(item.target.pageId)?.slice(0, 60) || item.label;
}

async function docState<N extends SiteDocName>(db: Db, name: N) {
  const [draft, published, stored] = await Promise.all([
    readDoc(db, name, "draft"),
    readDoc(db, name, "published"),
    readStored(db, `${name}.draft`),
  ]);
  return {
    draft,
    published,
    changed: JSON.stringify(draft) !== JSON.stringify(published),
    version: versionOf(stored.value),
  };
}

/**
 * Refuses a save that started from an older draft than the stored one
 * (versions.ts). Run in the transaction that writes, so two saves can't both pass.
 */
async function checkDraft(trx: Db, name: SiteDocName, base: string | undefined) {
  if (base === undefined) return;
  const stored = await readStored(trx, `${name}.draft`);
  const conflict = conflictWith(base, stored.value, { by: stored.by, at: null });
  if (conflict) throw conflictError(conflict);
}

/** Writes a document's draft from `base`, checked and written in one transaction. */
const writeDraft = (db: Db, name: SiteDocName, value: unknown, base: string | undefined) =>
  db.transaction().execute(async (trx) => {
    await checkDraft(trx, name, base);
    await writeRow(trx, `${name}.draft`, value);
  });

/** Whether a document's draft differs from what's live, without working out its warnings. */
export async function docChanged(db: Db, name: SiteDocName) {
  const [draft, published] = await Promise.all([
    readDoc(db, name, "draft"),
    readDoc(db, name, "published"),
  ]);
  return JSON.stringify(draft) !== JSON.stringify(published);
}

export async function getSettingsDoc(db: Db): Promise<SettingsDoc> {
  const [state, previous] = await Promise.all([
    docState(db, "settings"),
    previousOf(db, "settings"),
  ]);
  return { ...state, previous };
}

/** What was live before the last publish, so it can be put back. */
async function previousOf<N extends SiteDocName>(db: Db, name: N): Promise<DocOf<N> | null> {
  const value = await readRow(db, `${name}.previous`);
  return parseStored(schemaOf(name), value, `${name} (previous)`) ?? null;
}

export async function getNavigationDoc(db: Db): Promise<NavigationDoc> {
  const [state, previous] = await Promise.all([
    docState(db, "navigation"),
    previousOf(db, "navigation"),
  ]);
  return { ...state, warnings: await navigationWarnings(db, state.draft), previous };
}

/** Warnings for a navigation that isn't saved yet, so the editor can show them as the officer types. */
export const checkNavigation = (db: Db, nav: Navigation) => navigationWarnings(db, nav);

export async function getAnnouncementDoc(db: Db): Promise<AnnouncementDoc> {
  const [state, previous] = await Promise.all([
    docState(db, "announcement"),
    previousOf(db, "announcement"),
  ]);
  return { ...state, warnings: await announcementWarnings(db, state.draft), previous };
}

export async function getSearchDoc(db: Db): Promise<SearchDoc> {
  const [state, previous] = await Promise.all([docState(db, "search"), previousOf(db, "search")]);
  return { ...state, warnings: await searchWarnings(db, state.draft), previous };
}

export async function getThemeDoc(db: Db): Promise<ThemeDoc> {
  const [state, previous] = await Promise.all([docState(db, "theme"), previousOf(db, "theme")]);
  return { ...state, previous };
}

/** Saves the choice with the ramp made from it here, so the stored ramp always passes. */
export async function saveThemeDraft(db: Db, choice: ThemeChoice, base?: string) {
  const draft: SiteTheme = themeOf(choice);
  if (!rampPasses(draft.primary))
    throw new HttpError(
      400,
      "theme_contrast",
      "These colours aren't readable enough for links and buttons",
    );
  if (draft.accentRamp && !accentPasses(draft.primary, draft.accentRamp))
    throw new HttpError(
      400,
      "theme_contrast",
      "Links and buttons aren't readable enough on this accent colour",
    );
  await writeDraft(db, "theme", draft, base);
  return getThemeDoc(db);
}

/** Keeps the media usage index current for the settings (logo, favicon, social image). */
async function syncSettingsUsage(db: Db) {
  const [draft, published] = await Promise.all([
    readDoc(db, "settings", "draft"),
    readDoc(db, "settings", "published"),
  ]);
  await setUsage(db, "settings", [draft, published]);
}

export async function saveSettingsDraft(
  db: Db,
  draft: SiteSettings,
  base?: string,
): Promise<SettingsDoc> {
  const live = await readDoc(db, "settings", "published");
  // The publishing defaults and analytics retention change how the builder
  // works, not the site: they apply on save.
  const published: SiteSettings = {
    ...live,
    publishing: draft.publishing,
    analytics: { ...live.analytics, retentionDays: draft.analytics.retentionDays },
  };
  await db.transaction().execute(async (trx) => {
    await checkDraft(trx, "settings", base);
    await writeRow(trx, "settings.draft", draft);
    if (JSON.stringify(live) !== JSON.stringify(published))
      await writeRow(trx, "settings.published", published);
    await setUsage(trx, "settings", [draft, published]);
  });
  return getSettingsDoc(db);
}

export async function saveNavigationDraft(db: Db, draft: Navigation, base?: string) {
  await writeDraft(db, "navigation", draft, base);
  return getNavigationDoc(db);
}

export async function saveAnnouncementDraft(db: Db, draft: Announcement, base?: string) {
  const { from, until } = draft;
  if (from && until && Date.parse(until) < Date.parse(from))
    throw new HttpError(
      400,
      "announcement_dates",
      "The hide-after date must be after the show-from date",
    );
  await writeDraft(db, "announcement", draft, base);
  return getAnnouncementDoc(db);
}

export async function saveSearchDraft(db: Db, draft: SiteSearch, base?: string) {
  // A word means one page: the first pin to claim it keeps it.
  const claimed = new Set<string>();
  const pins = draft.pins.flatMap((pin) => {
    const terms = [...new Set(pin.terms)].filter((term) => !claimed.has(term));
    for (const term of terms) claimed.add(term);
    return terms.length ? [{ ...pin, terms }] : [];
  });
  await writeDraft(db, "search", { ...draft, pins }, base);
  return getSearchDoc(db);
}

/** Discard changes: the draft goes back to the live copy. */
export async function discardDraft(db: Db, name: SiteDocName) {
  await writeRow(db, `${name}.draft`, await readDoc(db, name, "published"));
  if (name === "settings") await syncSettingsUsage(db);
}

/**
 * Makes the drafts live; the publish that follows writes them out. What was
 * live before is kept as `<name>.previous`, so it can be put back.
 */
export async function promoteDrafts(db: Db, names: readonly SiteDocName[] = SiteDocName.options) {
  for (const name of names) {
    const [draft, live] = await Promise.all([
      readDoc(db, name, "draft"),
      readDoc(db, name, "published"),
    ]);
    if (JSON.stringify(draft) === JSON.stringify(live)) continue;
    await writeRow(db, `${name}.previous`, live);
    await writeRow(db, `${name}.published`, draft);
  }
  if (names.includes("settings")) await syncSettingsUsage(db);
}

/** Where every page lives, and which are live. */
async function linkIndex(db: Db, loads?: Loads) {
  const [tree, rows] = await Promise.all([
    treeOf(db, loads),
    db
      .selectFrom("pages")
      .select(["id", "published_revision_id"])
      .where("deleted_at", "is", null)
      .execute(),
  ]);
  const live = new Set(rows.filter((r) => r.published_revision_id).map((r) => r.id));
  return {
    href(target: LinkTarget, scope: Scope): string | undefined {
      if (target.kind === "url") return target.url;
      if (!tree.get(target.pageId)) return undefined;
      if (scope === "published" && !live.has(target.pageId)) return undefined;
      return tree.path(target.pageId);
    },
    problem(target: LinkTarget): string | undefined {
      if (target.kind === "url") return undefined;
      if (!tree.get(target.pageId)) return "links to a page that has been deleted";
      if (!live.has(target.pageId))
        return "links to a page that isn't published yet, so it's left out until that page is published";
      return undefined;
    },
  };
}

/** Links that can't go live: deleted or unpublished pages. */
async function navigationWarnings(db: Db, nav: Navigation): Promise<NavWarning[]> {
  const index = await linkIndex(db);
  const out: NavWarning[] = [];
  const check = (path: string, label: string, target: LinkTarget) => {
    const problem = index.problem(target);
    if (problem) out.push({ path, message: `"${label}" ${problem}` });
  };
  nav.navbar.forEach((item, i) => {
    if (item.type === "link") return check(`navbar.${i}`, item.label, item.target);
    item.links.forEach((link, j) => check(`navbar.${i}.links.${j}`, link.label, link.target));
    item.groups.forEach((group, g) =>
      group.links.forEach((link, j) =>
        check(`navbar.${i}.groups.${g}.links.${j}`, link.label, link.target),
      ),
    );
    if (item.feature) check(`navbar.${i}.feature`, item.feature.title, item.feature.target);
    if (item.footerLink)
      check(`navbar.${i}.footerLink`, item.footerLink.text, item.footerLink.target);
  });
  nav.footer.columns.forEach((column, c) =>
    column.links.forEach((link, j) => check(`footer.${c}.links.${j}`, link.label, link.target)),
  );
  return out;
}

async function announcementWarnings(db: Db, a: Announcement): Promise<NavWarning[]> {
  if (!a.link) return [];
  const problem = (await linkIndex(db)).problem(a.link.target);
  return problem ? [{ path: "link", message: `"${a.link.label}" ${problem}` }] : [];
}

/** Pins whose page is deleted or not published: they're left out until it is. */
async function searchWarnings(db: Db, search: SiteSearch): Promise<NavWarning[]> {
  if (!search.pins.length) return [];
  const index = await linkIndex(db);
  return search.pins.flatMap((pin, i) => {
    const problem = index.problem({ kind: "page", pageId: pin.pageId });
    return problem ? [{ path: `pins.${i}`, message: `"${pin.terms.join(", ")}" ${problem}` }] : [];
  });
}

/** Whether the announcement shows on `path` at `at`. The draft ignores its dates, so it can be previewed. */
export function announcementShows(a: Announcement, path: string, scope: Scope, at = Date.now()) {
  if (a.scope === "home" && path !== "/") return false;
  return scope === "draft" ? a.on && Boolean(a.message) : announcementShowing(a, at);
}

/** An unsaved navigation, announcement or theme to show instead of the stored one: an editor's preview. */
export type SiteDraft = {
  navigation?: Navigation | undefined;
  announcement?: Announcement | undefined;
  theme?: ThemeChoice | undefined;
};

/**
 * The site around a page: settings and navigation, with page links resolved
 * to paths. An unsaved navigation or announcement in `unsaved` shows instead
 * of the stored one, its links resolved as the live site will (unpublished
 * pages left out).
 */
export async function siteContext(
  db: Db,
  scope: Scope,
  path = "/",
  siteUrl?: string | undefined,
  unsaved: SiteDraft = {},
  loads?: Loads,
): Promise<SiteContext> {
  const { navigation, announcement, theme: choice } = unsaved;
  const doc = <N extends SiteDocName>(name: N) =>
    once(loads, `doc:${name}:${scope}`, () => readDoc(db, name, scope));
  const [settings, stored, a, search, theme, index] = await Promise.all([
    doc("settings"),
    navigation ?? doc("navigation"),
    announcement ?? doc("announcement"),
    doc("search"),
    choice ? themeOf(choice) : doc("theme"),
    once(loads, "links", () => linkIndex(db, loads)),
  ]);
  const nav = stored;
  // An unsaved document's links resolve as the live site will show them.
  const linksOf = (unsavedDoc: unknown): Scope => (unsavedDoc ? "published" : scope);
  const linkScope = linksOf(navigation);
  const { identity, appearance } = settings;
  const media = await once(loads, `identity:${scope}`, () => mediaInfo(db, [identity]));
  const file = (ref: { mediaId: string } | undefined) => (ref ? media[ref.mediaId] : undefined);
  const links = (list: NavLink[]): SiteLink[] =>
    list.flatMap((link) => {
      const href = index.href(link.target, linkScope);
      return href
        ? [
            {
              label: link.label,
              href,
              ...(link.description && { description: link.description }),
              ...(link.icon && { icon: link.icon }),
            },
          ]
        : [];
    });

  const navItems = nav.navbar.flatMap((item): SiteNavItem[] => {
    if (item.type === "link") {
      const href = index.href(item.target, linkScope);
      return href ? [{ label: item.label, href }] : [];
    }
    const out: SiteNavItem = { label: item.label };
    // Switching style never loses links: grouped flattens, a list becomes one column.
    if (item.layout === "grouped")
      out.groups = item.groups
        .map((g) => ({ title: g.heading, links: links(g.links) }))
        .filter((g) => g.links.length);
    else {
      out.children = links(
        item.layout === "described"
          ? item.links
          : item.links.map(({ label, target }) => ({ label, target })),
      );
      if (item.layout === "list") out.columns = item.columns;
    }
    const featureHref = item.feature && index.href(item.feature.target, linkScope);
    if (item.feature && featureHref)
      out.feature = {
        href: featureHref,
        title: item.feature.title,
        ...(item.feature.description && { description: item.feature.description }),
        ...(item.feature.eyebrow && { eyebrow: item.feature.eyebrow }),
        ...(item.feature.linkText && { linkLabel: item.feature.linkText }),
      };
    const footerHref = item.footerLink && index.href(item.footerLink.target, linkScope);
    if (item.footerLink && footerHref)
      out.footer = { label: item.footerLink.text, href: footerHref };
    const empty = !out.children?.length && !out.groups?.length && !out.feature;
    return empty ? [] : [out];
  });

  const announcementHref = a.link && index.href(a.link.target, linksOf(announcement));
  const logo = file(identity.logo);
  return {
    name: identity.siteName,
    agency: identity.agencyName,
    ...(logo && {
      logo: { src: logo.url, alt: logo.alt || identity.agencyName || identity.siteName },
    }),
    // Without a logo the name is all the navbar has, so it stays.
    ...(logo && !appearance.navbarName && { hideNavbarName: true }),
    ...(!appearance.footerLogo && { hideFooterLogo: true }),
    ...(!appearance.masthead && { hideMasthead: true }),
    ...(file(identity.favicon) && { favicon: file(identity.favicon)?.url }),
    ...(file(identity.socialImage) && { socialImage: file(identity.socialImage)?.url }),
    nav: navItems,
    ...(announcementShows(a, path, scope) && {
      announcement: {
        tag: a.tag,
        variant: a.variant,
        message: a.message,
        ...(a.link &&
          announcementHref && { link: { label: a.link.label, href: announcementHref } }),
      },
    }),
    footer: nav.footer.columns
      .map((c) => ({
        title: c.heading,
        links: links(c.links).map(({ label, href }) => ({ label, href })),
      }))
      .filter((c) => c.links.length),
    contact: settings.contact,
    social: settings.social,
    ...(settings.phase.phase !== "off" && {
      phase: {
        phase: settings.phase.phase,
        ...(settings.phase.feedbackUrl && { feedbackUrl: settings.phase.feedbackUrl }),
      },
    }),
    hideSite: settings.search.hideSite,
    ...(search.on && { search: true as const }),
    ...(siteUrl && { url: siteUrl }),
    embeds: settings.embeds,
    ...(settings.analytics.on && { analytics: true }),
    theme: {
      primary: theme.primary,
      ...(theme.accent &&
        theme.accentRamp && {
          accent: { seed: hexToRgb(theme.accent), ramp: theme.accentRamp },
        }),
    },
  };
}
