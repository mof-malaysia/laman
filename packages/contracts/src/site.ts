/**
 * Site settings, navigation, the announcement, site search and the theme: drafted documents, each
 * made live by its own publish, like pages. Page links are by id, so they
 * follow renames and moves.
 */
import {
  embedHostPattern,
  embedServiceIds,
  featureIcons,
  hexPattern,
  rampSteps,
  themePresets,
} from "@fiscal-sb/blocks";
import { z } from "zod";

const Id = z.uuid();

/** A page from the tree, or a web address. */
export const LinkTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), pageId: Id }),
  z.object({
    kind: z.literal("url"),
    url: z
      .string()
      .trim()
      .max(500)
      .regex(/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/, "Enter a web address starting with https://"),
  }),
]);
export type LinkTarget = z.infer<typeof LinkTarget>;

const Label = z.string().trim().min(1, "Enter a label").max(60);

export const NavLink = z.object({
  label: Label,
  target: LinkTarget,
  /** Described dropdowns only. */
  description: z.string().trim().max(120).optional(),
  icon: z.enum(featureIcons).optional(),
});
export type NavLink = z.infer<typeof NavLink>;

export const NavGroup = z.object({
  heading: Label,
  links: z.array(NavLink).max(12),
});
export type NavGroup = z.infer<typeof NavGroup>;

export const DropdownLayout = z.enum(["list", "described", "grouped"]);
export type DropdownLayout = z.infer<typeof DropdownLayout>;

export const NavFeature = z.object({
  eyebrow: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1, "Enter a title").max(80),
  description: z.string().trim().max(200).optional(),
  target: LinkTarget,
  linkText: z.string().trim().max(40).optional(),
});
export type NavFeature = z.infer<typeof NavFeature>;

export const NavItem = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link"), label: Label, target: LinkTarget }),
  z.object({
    type: z.literal("dropdown"),
    label: Label,
    /** List: plain links in columns. Described: icon and one line each. Grouped: titled columns. */
    layout: DropdownLayout,
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
    /** List and Described. */
    links: z.array(NavLink).max(16),
    /** Grouped. */
    groups: z.array(NavGroup).max(4),
    feature: NavFeature.optional(),
    footerLink: z.object({ text: Label, target: LinkTarget }).optional(),
  }),
]);
export type NavItem = z.infer<typeof NavItem>;
export type NavDropdown = Extract<NavItem, { type: "dropdown" }>;

/** Tag colours, by meaning. */
export const AnnouncementVariant = z.enum(["primary", "warning", "danger", "success", "default"]);
export type AnnouncementVariant = z.infer<typeof AnnouncementVariant>;

export const Announcement = z.object({
  on: z.boolean(),
  tag: z.string().trim().max(24),
  variant: AnnouncementVariant,
  message: z.string().trim().max(120),
  link: z.object({ label: Label, target: LinkTarget }).optional(),
  /** ISO date-times: the bar shows from `from` until the end of `until`'s day. */
  from: z.iso.datetime({ offset: true }).optional(),
  until: z.iso.datetime({ offset: true }).optional(),
  scope: z.enum(["all", "home"]),
});
export type Announcement = z.infer<typeof Announcement>;

/** Whether an announcement is up at `at`: switched on, with a message, between its dates. */
export const announcementShowing = (a: Announcement, at = Date.now()) =>
  a.on &&
  Boolean(a.message) &&
  !(a.from && at < Date.parse(a.from)) &&
  !(a.until && at > Date.parse(a.until));

export const FooterColumn = z.object({
  heading: Label,
  links: z.array(NavLink).max(12),
});

export const Navigation = z.object({
  navbar: z.array(NavItem).max(8),
  footer: z.object({ columns: z.array(FooterColumn).max(4) }),
});
export type Navigation = z.infer<typeof Navigation>;

/** How many pinned results a site can have, words a pin can have, and characters a word. */
export const searchLimits = { pins: 50, terms: 10, term: 40 } as const;

/** A page put first when a visitor's search is one of its words. */
export const SearchPin = z.object({
  terms: z
    .array(z.string().trim().toLowerCase().min(1).max(searchLimits.term))
    .min(1, "Add at least one word")
    .max(searchLimits.terms, `Add at most ${searchLimits.terms} words`),
  pageId: Id,
});

/** Search on the published site (Pagefind): the Cari link, the /carian page and its index. */
export const SiteSearch = z.object({
  on: z.boolean(),
  /** Visitors can narrow results by collection, then category. */
  filters: z.boolean(),
  pins: z.array(SearchPin).max(searchLimits.pins),
});
export type SiteSearch = z.infer<typeof SiteSearch>;

const MediaRef = z.object({ mediaId: Id });

export const socialPlatforms = [
  "facebook",
  "x",
  "instagram",
  "youtube",
  "tiktok",
  "linkedin",
] as const;

export const SiteSettings = z.object({
  identity: z.object({
    siteName: z.string().trim().min(1, "Enter the site name").max(80),
    /** The masthead and footer owner. */
    agencyName: z.string().trim().max(120),
    logo: MediaRef.optional(),
    favicon: MediaRef.optional(),
    socialImage: MediaRef.optional(),
  }),
  /** What the site around every page shows. */
  appearance: z.object({
    /** The Malaysian government masthead above the navbar. Off suits an agency that isn't part of the government itself. */
    masthead: z.boolean(),
    /** The site name beside the navbar logo. Off suits a logo that already says it; needs a logo. */
    navbarName: z.boolean(),
    /** The logo in the footer, beside the agency name. */
    footerLogo: z.boolean(),
  }),
  contact: z.object({
    address: z.string().trim().max(300),
    phone: z.string().trim().max(40),
    email: z.union([z.email("Enter an email address like nama@agensi.gov.my"), z.literal("")]),
    hours: z.string().trim().max(200),
  }),
  social: z
    .array(
      z.object({
        platform: z.enum(socialPlatforms),
        url: z
          .string()
          .trim()
          .regex(/^https:\/\/[^\s]+$/, "Enter a web address starting with https://"),
      }),
    )
    .max(socialPlatforms.length),
  /** The phase banner under the masthead, telling visitors the site is new. Shown on the Appearance page. */
  phase: z.object({
    phase: z.enum(["off", "alpha", "beta"]),
    feedbackUrl: z
      .union([
        z
          .string()
          .trim()
          .regex(
            /^(https?:\/\/|\/|mailto:)[^\s]*$/,
            "Enter a page on the site (/maklum-balas) or a web address starting with https://",
          ),
        z.literal(""),
      ])
      .optional(),
  }),
  search: z.object({
    /** Asks search engines to leave the whole site out. */
    hideSite: z.boolean(),
    sitemap: z.boolean(),
  }),
  publishing: z.object({
    /** The time of day a new scheduled publish starts at, "08:00". */
    scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time"),
    /** Revisions kept per page; older ones are pruned. */
    revisionsToKeep: z
      .number({ error: "Enter a number from 5 to 500" })
      .int("Enter a whole number")
      .min(5, "Keep at least 5")
      .max(500, "Keep at most 500"),
  }),
  /** Sites from before analytics count visitors from their next settings publish. */
  analytics: z
    .object({
      /** Writes the beacon into the published pages. */
      on: z.boolean(),
      /** Days of analytics kept; older views are deleted. Applies on save. */
      retentionDays: z
        .number({ error: "Enter a number from 30 to 1095" })
        .int("Enter a whole number")
        .min(30, "Keep at least 30 days")
        .max(1095, "Keep at most 1095 days (3 years)"),
    })
    .default({ on: true, retentionDays: 395 }),
  /** Sites from before embeds allow none until an officer lists some. */
  embeds: z
    .object({
      /** Built-in services switched on: only each one's embed addresses are framed (`embedServices`). */
      services: z.array(z.enum(embedServiceIds)).max(embedServiceIds.length).default([]),
      /** The site's own hosts the Embed block may frame, whole: the exact name, not its subdomains. */
      hosts: z
        .array(
          z
            .string()
            .trim()
            .toLowerCase()
            .regex(
              embedHostPattern,
              "Enter a host name like peta.agensi.gov.my, without https:// or anything after it",
            ),
        )
        .max(50, "List at most 50 sites"),
    })
    .default({ services: [], hosts: [] }),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

/** A drafted document with its live copy. */
/** A save of a drafted document, from the version it started from (see `SaveDraftBody`). */
export const savable = <T extends z.ZodType>(draft: T) =>
  z.object({ draft, base: z.string().optional() });

export const drafted = <T extends z.ZodType>(doc: T) =>
  z.object({
    draft: doc,
    published: doc,
    /** The draft differs from what's live. */
    changed: z.boolean(),
    /** Changes whenever the draft does: send it back as a save's `base` (see `SaveDraftBody`). */
    version: z.string(),
  });

export const SettingsDoc = drafted(SiteSettings).extend({
  /** What was live before the last publish, so it can be put back. */
  previous: SiteSettings.nullable(),
});
export type SettingsDoc = z.infer<typeof SettingsDoc>;

/** What keeping fewer revisions would remove: older saved drafts, across how many pages. */
export const PruneQuery = z.object({ keep: z.coerce.number().int().min(5).max(500) });
export const PrunePreview = z.object({
  drafts: z.number().int(),
  pages: z.number().int(),
});
export type PrunePreview = z.infer<typeof PrunePreview>;

/** A navbar or footer link that can't go live yet. */
export const NavWarning = z.object({
  /** Where in the document, e.g. "navbar.1.links.0". */
  path: z.string(),
  message: z.string(),
});
export type NavWarning = z.infer<typeof NavWarning>;

export const NavigationDoc = drafted(Navigation).extend({
  warnings: z.array(NavWarning),
  /** What was live before the last publish, so it can be put back. */
  previous: Navigation.nullable(),
});
export type NavigationDoc = z.infer<typeof NavigationDoc>;

/** The bar under the navbar: its own document, so posting it never publishes navbar changes. */
export const AnnouncementDoc = drafted(Announcement).extend({
  warnings: z.array(NavWarning),
  /** What was live before the last publish, so it can be put back. */
  previous: Announcement.nullable(),
});
export type AnnouncementDoc = z.infer<typeof AnnouncementDoc>;

/** Site search; its warnings are pins whose page can't be shown. */
export const SearchDoc = drafted(SiteSearch).extend({
  warnings: z.array(NavWarning),
  /** What was live before the last publish, so it can be put back. */
  previous: SiteSearch.nullable(),
});
export type SearchDoc = z.infer<typeof SearchDoc>;

const Byte = z.number().int().min(0).max(255);
const Ramp = z.record(z.enum(rampSteps), z.tuple([Byte, Byte, Byte]));

/** What the officer chooses: a preset, or their own colour. */
export const ThemeChoice = z
  .object({
    preset: z.enum([...(Object.keys(themePresets) as (keyof typeof themePresets)[]), "custom"]),
    /** "#0b6b3a"; only with "custom". */
    seed: z.string().regex(hexPattern, "Enter a colour like #0b6b3a").optional(),
    /** A second brand colour, "#cb2043", for decoration only; none when unset. */
    accent: z.string().regex(hexPattern, "Enter a colour like #cb2043").optional(),
  })
  .refine((t) => t.preset !== "custom" || t.seed, {
    message: "Enter a colour like #0b6b3a",
    path: ["seed"],
  });
export type ThemeChoice = z.infer<typeof ThemeChoice>;

/**
 * The site's colours: the choice, and the primary ramp the server made from it
 * on save. The ramp is stored so what was reviewed is what goes live.
 */
export const SiteTheme = z.object({
  preset: ThemeChoice.shape.preset,
  seed: ThemeChoice.shape.seed,
  primary: Ramp,
  /** The accent as chosen, "#cb2043"; none when the site has one colour. */
  accent: ThemeChoice.shape.accent,
  /** The ramp made from the accent on save, stored like `primary`. */
  accentRamp: Ramp.optional(),
});
export type SiteTheme = z.infer<typeof SiteTheme>;

export const ThemeDoc = drafted(SiteTheme).extend({
  /** What was live before the last publish, so it can be put back. */
  previous: SiteTheme.nullable(),
});
export type ThemeDoc = z.infer<typeof ThemeDoc>;

export const SaveSettingsBody = savable(SiteSettings);
export const SaveNavigationBody = savable(Navigation);
export const NavigationCheck = z.object({ warnings: z.array(NavWarning) });
export type NavigationCheck = z.infer<typeof NavigationCheck>;
export const SaveAnnouncementBody = savable(Announcement);
export const SaveSearchBody = savable(SiteSearch);
export const SaveThemeBody = savable(ThemeChoice);

/** The drafted documents that aren't pages. */
export const SiteDocName = z.enum(["settings", "navigation", "announcement", "search", "theme"]);
export type SiteDocName = z.infer<typeof SiteDocName>;
