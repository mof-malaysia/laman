/**
 * Site search in the browser, shared by the search page and a listing's own
 * search: the Pagefind index, loaded once, and the results area (Results.astro)
 * filled ten at a time. Each result is a copy of its template filled with
 * text, so nothing from the index becomes HTML but Pagefind's own excerpt.
 */
/** A pinned result (`carian/pins.json`), shown first for its word. */
export type Pin = { url: string; title: string; excerpt?: string };

type Data = { url: string; excerpt: string; meta: { title?: string; date?: string } };
type Result = { data: () => Promise<Data> };
export type Pagefind = {
  options: (o: Record<string, unknown>) => Promise<void>;
  filters: () => Promise<Record<string, Record<string, number>>>;
  search: (
    q: string,
    o?: { filters?: Record<string, { any: string[] }> },
  ) => Promise<{ results: Result[] } | null>;
};

let loading: Promise<Pagefind> | undefined;
/** The index at `url`, imported once; a failed load is tried again next time. */
export function loadPagefind(url: string): Promise<Pagefind> {
  loading ??= import(/* @vite-ignore */ url).then(async (pagefind: Pagefind) => {
    await pagefind.options({ excerptLength: 30 });
    return pagefind;
  });
  loading.catch(() => (loading = undefined));
  return loading;
}

/** A page's address as the site links it: no trailing slash. */
const pageUrl = (url: string) => url.replace(/\/$/, "") || "/";

/** One result, from the `<template data-search-result>` inside `root`. */
function resultItem(
  root: ParentNode,
  { url, title, excerpt, date }: { url: string; title: string; excerpt?: string; date?: string },
  pinned = false,
) {
  const template = root.querySelector<HTMLTemplateElement>("template[data-search-result]")!;
  const li = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  li.toggleAttribute("data-pinned", pinned);
  if (!pinned) li.querySelector("[data-pin]")!.remove();
  const link = li.querySelector<HTMLAnchorElement>("[data-title]")!;
  link.href = url;
  link.textContent = title || url;
  const when = li.querySelector<HTMLElement>("[data-date]")!;
  // The publisher wrote it as BM readers write dates.
  if (date) when.textContent = date;
  else when.remove();
  const text = li.querySelector<HTMLElement>("[data-excerpt]")!;
  // Pagefind's excerpt is the page's text, escaped, with <mark> around the matches.
  if (excerpt && !pinned) text.innerHTML = excerpt;
  else if (excerpt) text.textContent = excerpt;
  else text.remove();
  return li;
}

const PAGE = 10;

/**
 * The results area inside `root` (Results.astro). `start` begins a search and
 * returns its number; `show` and `fail` answer it, and do nothing once a later
 * search has started, so a slow answer never lands under a newer query.
 */
export function resultList(root: ParentNode) {
  const status = root.querySelector<HTMLElement>("[data-search-status]")!;
  const list = root.querySelector<HTMLElement>("[data-search-results]")!;
  const more = root.querySelector<HTMLElement>("[data-search-more]")!;
  let current = 0;
  let results: Result[] = [];
  let shown = 0;
  let skip: string | undefined;

  async function showMore(id: number) {
    const next = results.slice(shown, shown + PAGE);
    const data = await Promise.all(next.map((r) => r.data()));
    if (id !== current) return;
    for (const d of data) {
      const url = pageUrl(d.url);
      if (url !== skip)
        list.append(
          resultItem(root, {
            url,
            title: d.meta.title ?? "",
            excerpt: d.excerpt,
            date: d.meta.date,
          }),
        );
    }
    shown += next.length;
    more.hidden = shown >= results.length;
  }
  more.querySelector("button")!.addEventListener("click", async () => {
    const first = list.children.length;
    await showMore(current);
    list.children[first]?.querySelector("a")?.focus();
  });

  return {
    /** Empties the list for a new search, with `text` as its status. */
    start(text = "") {
      list.replaceChildren();
      more.hidden = true;
      status.textContent = text;
      return ++current;
    },
    /** The results for `q`, after a pinned one when there is one. */
    async show(id: number, found: Result[], q: string, pin?: Pin) {
      if (id !== current) return;
      results = found;
      shown = 0;
      skip = pin?.url;
      if (pin) list.append(resultItem(root, pin, true));
      await showMore(id);
      if (id !== current) return;
      const total = found.length || (pin ? 1 : 0);
      status.textContent = total
        ? `${total} hasil untuk “${q}”`
        : `Tiada hasil untuk “${q}”. Cuba perkataan lain, atau semak ejaannya.`;
    },
    fail(id: number) {
      if (id === current)
        status.textContent = "Carian tidak dapat dimuatkan sekarang. Cuba sebentar lagi.";
    },
  };
}
