/** The address of page `n` of a listing, or of one of its categories: as the publisher writes them. */
export function listingHref(base: string, page: number, category?: string) {
  const root = category ? `${base === "/" ? "" : base}/kategori/${category}` : base;
  return page > 1 ? `${root === "/" ? "" : root}/halaman/${page}` : root;
}
