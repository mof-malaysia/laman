/**
 * How site search files pages (Site.astro writes them, the search page and a
 * listing's search filter by them): `koleksi` is an entry's listing or
 * "Halaman", `kategori` an entry's category, `jenis` is "entri" on entries.
 */
export const SEARCH_ENTRY = "entri";

/** A value as Pagefind filters keep it: commas would split it. */
export const filterValue = (value: string) => value.replaceAll(",", " ").trim();
