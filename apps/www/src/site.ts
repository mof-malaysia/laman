// What every page shares: the navbar, the footer, addresses with the base path,
// and the classes sections share.
import { withBase } from "./base-path.mjs";
export type Lang = "ms" | "en";

export const GITHUB_URL = "https://github.com/mof-malaysia/laman";

/**
 * The team's inbox, for the contact page. Not decided yet: until it is, the
 * page says so instead of linking an address nobody reads.
 */
export const CONTACT_EMAIL: string | null = null;

/** A root-relative address ("/pasang") with the site's base in front ("/laman/pasang"). */
export const url = (path: string) => withBase(import.meta.env.BASE_URL, path);

/** A link in the copy: an anchor on the same page stays as it is, a site path gets the base. */
export const href = (to: string) => (to.startsWith("#") ? to : url(to));

/** The page column every section sits in: FTDS's wide column, with the navbar's gutter. */
export const pageColumn = "mx-auto w-full max-w-[1280px] px-4.5 md:px-6";

/** A section's h2. */
export const sectionTitle =
  "text-heading-sm md:text-heading-md font-semibold tracking-[-0.02em] text-balance";

export interface Link {
  label: string;
  href: string;
}

const nav: Record<Lang, Link[]> = {
  ms: [
    { label: "Ejen AI", href: "/ejen-ai" },
    { label: "Banding", href: "/banding" },
    { label: "Kedaulatan", href: "/kedaulatan" },
    { label: "Pasang", href: "/pasang" },
  ],
  en: [
    { label: "AI agents", href: "/en/agents" },
    { label: "Compare", href: "/en/compare" },
    { label: "Sovereignty", href: "/en/sovereignty" },
    { label: "Install", href: "/en/install" },
  ],
};

export const strings = {
  ms: {
    home: "/",
    install: "Pasang Laman",
    installHref: "/pasang",
    tagline: "Pembina laman web sumber terbuka untuk agensi kerajaan, dibina di atas FTDS.",
    product: "Laman",
    source: "Kod sumber",
    licence: "Sumber terbuka di bawah lesen MIT.",
    email: "E-mel pasukan",
    issues: "Buka isu di GitHub",
    emailSubject: "Laman: pertanyaan daripada agensi",
    phase: {
      tag: "Alfa",
      text: "Laman ialah perisian pra-keluaran dan masih berubah.",
      link: "Kongsi maklum balas di GitHub",
    },
    emailPending:
      "Alamat e-mel pasukan akan diterbitkan di sini tidak lama lagi. Sementara itu, buka isu di GitHub.",
    cta: {
      title: "Cuba Laman di agensi anda",
      text: "Pasang di pelayan anda sendiri dari GitHub, atau hubungi pasukan kami untuk taklimat.",
      primary: { label: "Pasang Laman", href: "/pasang" },
      secondary: { label: "Hubungi pasukan", href: "/hubungi" },
    },
  },
  en: {
    home: "/en",
    install: "Install Laman",
    installHref: "/en/install",
    tagline: "An open-source website builder for government agencies, built on FTDS.",
    product: "Product",
    source: "Source code",
    licence: "Open source under the MIT licence.",
    email: "Email the team",
    issues: "Open an issue on GitHub",
    emailSubject: "Laman: a question from an agency",
    phase: {
      tag: "Alpha",
      text: "Laman is pre-release software and still changing.",
      link: "Share feedback on GitHub",
    },
    emailPending:
      "The team's email address will be published here soon. Until then, open an issue on GitHub.",
    cta: {
      title: "Try Laman at your agency",
      text: "Install it on your own server from GitHub, or contact our team for a briefing.",
      primary: { label: "Install Laman", href: "/en/install" },
      secondary: { label: "Contact the team", href: "/en/contact" },
    },
  },
} as const;

export function navItems(lang: Lang, current: string) {
  return nav[lang].map((link) => ({
    label: link.label,
    href: url(link.href),
    current: link.href === current,
  }));
}

export function footerGroups(lang: Lang) {
  const s = strings[lang];
  return [
    {
      title: s.product,
      links: [
        { label: lang === "ms" ? "Utama" : "Home", href: url(s.home) },
        ...nav[lang].map((l) => ({ ...l, href: url(l.href) })),
      ],
    },
    { title: s.source, links: [{ label: "GitHub", href: GITHUB_URL }] },
  ];
}
