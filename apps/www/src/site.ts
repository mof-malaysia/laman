// What every page shares: the navbar, the footer and addresses with the base path.
export type Lang = "ms" | "en";

export const GITHUB_URL = "https://github.com/mof-malaysia/laman";

/** A root-relative address ("/pasang") with the site's base in front ("/laman/pasang"). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (!base) return path;
  return path === "/" ? base : base + path;
}

interface Link {
  label: string;
  href: string;
}

const nav: Record<Lang, Link[]> = {
  ms: [
    { label: "Kedaulatan", href: "/kedaulatan" },
    { label: "Banding", href: "/banding" },
    { label: "Pasang", href: "/pasang" },
  ],
  en: [
    { label: "Sovereignty", href: "/en/sovereignty" },
    { label: "Compare", href: "/en/compare" },
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
  },
  en: {
    home: "/en",
    install: "Install Laman",
    installHref: "/en/install",
    tagline: "An open-source website builder for government agencies, built on FTDS.",
    product: "Product",
    source: "Source code",
    licence: "Open source under the MIT licence.",
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
