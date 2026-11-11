/**
 * The addresses a listing publishes besides its entries: later pages, a page
 * per category, and for an event calendar a page per month and per location.
 * The publisher writes them from these, the renderer links to them, and the
 * page tree refuses entry slugs that would land on one.
 */

/** Where a listing's filtered pages sit: /berita/kategori/siaran-media, /takwim/lokasi/sabah. */
const segment = { category: "kategori", location: "lokasi", page: "halaman" } as const;

/** A month page's segment: /takwim/2026-11. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const root = (base: string) => (base === "/" ? "" : base);

/** The address of page `n` of a listing (or of one of its categories). */
export function listingPagePath(base: string, page: number, category?: string) {
  const at = category ? `${root(base)}/${segment.category}/${category}` : base;
  return page > 1 ? `${root(at)}/${segment.page}/${page}` : at;
}

/** The address of one of a calendar's months, unfiltered or by one category or location; the current month has no month segment. */
export function calendarPath(
  base: string,
  options: {
    month?: string | undefined;
    filter?: { kind: "category" | "location"; slug: string } | undefined;
  } = {},
) {
  const at = options.filter
    ? `${root(base)}/${segment[options.filter.kind]}/${options.filter.slug}`
    : base;
  return options.month ? `${root(at)}/${options.month}` : at;
}

/** Whether an entry slug would land on one of its listing's own pages. */
export const listingReservedSlug = (slug: string) =>
  Object.values(segment).includes(slug as never) || MONTH.test(slug) || slug === "rss.xml";
