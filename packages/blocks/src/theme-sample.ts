/**
 * The colour sample: a page that's never stored, made of the site's own
 * blocks, so the Colours screen can show every place the main colour and the
 * accent appear, whatever the site's home page happens to use. The renderer
 * draws it like any page, so what it shows is what publishes.
 */
import type { EntryItem, PageContent, RenderInput } from "./content.js";
import { addDays, atSiteTime, dayOf } from "./events.js";
import type { Block } from "./registry.js";
import { presetBlock } from "./templates.js";

/** The made-up listing the sample's upcoming events come from. */
const SAMPLE_LISTING = "00000000-0000-4000-8000-000000000001";

/** Example events, by the site's days: one today (its tag is primary), then later ones (their dates are accent). */
function sampleEvents(today: string): EntryItem[] {
  const event = (days: number, title: string, venue: string): EntryItem => ({
    title,
    href: "/",
    date: atSiteTime(addDays(today, -1)),
    event: { start: atSiteTime(addDays(today, days), "10:00"), venue },
  });
  return [
    event(0, "Taklimat pembekal baharu", "Dewan Utama, Putrajaya"),
    event(3, "Bengkel permohonan dalam talian", "Bilik Latihan 2"),
    event(10, "Hari terbuka", "Ibu pejabat"),
  ];
}

const blocks = (): Block[] => [
  presetBlock("hero", {
    tone: "accent",
    eyebrow: "Perkhidmatan dalam talian",
    title: "Contoh laman dengan warna anda",
    description:
      "Setiap bahagian di bawah ialah blok sebenar laman ini, dilukis dengan warna utama dan warna aksen yang dipilih.",
    primaryAction: { label: "Mohon sekarang", href: "/" },
    secondaryAction: { label: "Ketahui lanjut", href: "/" },
  }),
  presetBlock("featureGrid", { title: "Perkhidmatan utama" }),
  presetBlock("impactStats", { title: "Pencapaian kami" }),
  presetBlock("steps", { title: "Cara memohon", action: { label: "Mula memohon", href: "/" } }),
  presetBlock("upcomingEvents", {
    title: "Acara akan datang",
    listing: SAMPLE_LISTING,
    seeAll: "Lihat semua acara",
  }),
  presetBlock("ctaCards", { title: "Pilih cara yang sesuai" }),
  presetBlock("callout", {
    title: "Makluman",
    body: "Kaunter ditutup pada cuti umum. Perkhidmatan dalam talian dibuka seperti biasa.",
  }),
  presetBlock("ctaBand", { title: "Perlukan bantuan?", tone: "primary" }),
];

/** The sample page's content, and the render data its blocks read. */
export function themeSample(now = Date.now()): {
  content: PageContent;
  upcoming: NonNullable<RenderInput["upcoming"]>;
} {
  const today = dayOf(now);
  return {
    content: { title: "Contoh warna", blocks: blocks() },
    upcoming: { [SAMPLE_LISTING]: { path: "/", today, items: sampleEvents(today) } },
  };
}
