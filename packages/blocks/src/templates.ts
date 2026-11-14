/**
 * Page templates: real starting pages, not empty ones. Each has a name, a
 * description and its starting blocks; the registry test checks that every
 * template's blocks pass their schemas. Collection templates (kind
 * "listing") also say what their entries are called and their categories.
 */
import { type ListingSettings, defaultListingSettings } from "./content.js";
import { type Block, type BlockType, type PageKind, newBlock } from "./registry.js";
import { paragraphs } from "./rich-text.js";

export type Template = {
  name: string;
  description: string;
  /** Present on collection templates: the categories a new collection starts with, the blocks its entries start with, and its order. */
  listing?: {
    categories?: { slug: string; name: string }[];
    startingBlocks?: BlockType[];
    sort?: "publishAt" | "eventStart";
  };
  /** The blocks a new page starts with, given its title. */
  blocks: (title: string) => Block[];
};

/** A new block of `type` with some of its props replaced. */
function block<T extends BlockType>(type: T, props: Record<string, unknown> = {}): Block {
  const fresh = newBlock(type);
  return { ...fresh, props: { ...fresh.props, ...props } } as Block;
}

/** For the colour sample (`theme-sample.ts`), which starts its blocks the same way. */
export { block as presetBlock };

export const templates = {
  blank: {
    name: "Blank",
    description: "A title and a text block.",
    blocks: (title) => [block("pageIntro", { title, description: undefined }), block("prose")],
  },
  utama: {
    name: "Utama",
    description: "The home page.",
    blocks: (title) => [
      block("hero", {
        eyebrow: "Selamat datang",
        title,
        description: "Bayar, mohon dan semak status permohonan anda dalam talian.",
        primaryAction: { label: "Lihat perkhidmatan", href: "/perkhidmatan" },
        secondaryAction: { label: "Hubungi kami", href: "/hubungi" },
      }),
      block("serviceHighlights"),
      block("callout"),
      block("ctaBand"),
    ],
  },
  perkhidmatan: {
    name: "Perkhidmatan",
    description: "One service: who can apply, how, and the forms.",
    blocks: (title) => [
      block("pageIntro", {
        title,
        description: "Terangkan perkhidmatan ini dalam satu atau dua ayat.",
      }),
      block("prose", {
        body: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Tentang perkhidmatan ini" }],
            },
            ...paragraphs("Terangkan apa yang orang ramai dapat daripada perkhidmatan ini.")
              .content,
          ],
        },
      }),
      block("eligibility"),
      block("steps", { action: { label: "Mohon sekarang", href: "/" } }),
      block("downloadList", { title: "Borang dan panduan" }),
      block("faq"),
      block("ctaBand", { title: "Sedia untuk memohon?" }),
    ],
  },
  hubungi: {
    name: "Hubungi",
    description: "How to reach the agency.",
    blocks: (title) => [
      block("pageIntro", {
        title,
        description: "Kami sedia membantu. Pilih cara yang paling mudah untuk anda.",
      }),
      block("contact", { title: "Saluran perhubungan" }),
      block("faq", { title: "Sebelum anda menghubungi kami" }),
    ],
  },
  koleksi: {
    name: "Blank collection",
    description: "Entries, newest first. For circulars, publications, vacancies.",
    listing: {},
    blocks: (title) => [block("pageIntro", { title, description: undefined }), block("entryList")],
  },
  berita: {
    name: "Berita",
    description: "News and press statements.",
    listing: {
      categories: [
        { slug: "berita", name: "Berita" },
        { slug: "kenyataan-media", name: "Kenyataan media" },
      ],
    },
    blocks: (title) => [
      block("pageIntro", { title, description: "Berita dan kenyataan media terkini." }),
      block("entryList"),
    ],
  },
  pengumuman: {
    name: "Pengumuman",
    description: "Closures, service changes, reminders.",
    listing: {},
    blocks: (title) => [
      block("pageIntro", { title, description: "Makluman terkini untuk orang ramai." }),
      block("entryList", { style: "list" }),
    ],
  },
  tender: {
    name: "Tender dan sebut harga",
    description: "Open tenders and quotations, with documents.",
    listing: {
      categories: [
        { slug: "tender", name: "Tender" },
        { slug: "sebut-harga", name: "Sebut harga" },
      ],
    },
    blocks: (title) => [
      block("pageIntro", { title, description: "Tender dan sebut harga yang sedang dibuka." }),
      block("entryList", { style: "list", emptyText: "Tiada tender dibuka buat masa ini." }),
    ],
  },
  acara: {
    name: "Acara",
    description: "Briefings, workshops, open days, with date and venue.",
    listing: { startingBlocks: ["eventDetails"], sort: "eventStart" },
    blocks: (title) => [
      block("pageIntro", { title, description: "Taklimat, bengkel dan hari terbuka kami." }),
      block("entryList", { style: "cards", emptyText: "Belum ada acara lagi." }),
    ],
  },
  takwim: {
    name: "Takwim",
    description:
      "A calendar of events, a month at a time, with each month's events listed under it.",
    listing: { startingBlocks: ["prose"], sort: "eventStart" },
    blocks: (title) => [
      block("pageIntro", { title, description: "Acara dan program yang akan datang." }),
      block("eventCalendar"),
    ],
  },
} satisfies Record<string, Template>;

export type TemplateId = keyof typeof templates;
export const templateIds = Object.keys(templates) as [TemplateId, ...TemplateId[]];

/** A template, typed as Template rather than its narrowed literal. */
export const templateById = (id: TemplateId): Template => templates[id];

/** What a new page can be: an ordinary page, or a collection (listing). */
export const templateKinds = ["page", "listing"] as const;
export type TemplateKind = Exclude<PageKind, "entry">;

export const templateKind = (id: TemplateId): TemplateKind =>
  templateById(id).listing ? "listing" : "page";

/** The templates for a kind of page: ordinary pages, or collections. */
export const templatesFor = (kind: TemplateKind): TemplateId[] =>
  templateIds.filter((id) => templateKind(id) === kind);

/** A new collection's settings: the defaults, with what its template sets (categories, starting blocks). */
export function collectionSettings(id: TemplateId | undefined): ListingSettings {
  return { ...defaultListingSettings(), ...(id && templateById(id).listing) };
}
