/**
 * The media library's search, filters and open file live in the address, so
 * Back keeps them and a file can be linked to (from Publishing, say).
 */
export const mediaShows = ["needsAlt", "unused", "deleted"] as const;
export type MediaShow = (typeof mediaShows)[number];
export const mediaKinds = ["image", "document"] as const;

export type MediaSearch = {
  q?: string;
  type?: (typeof mediaKinds)[number];
  show?: MediaShow;
  page?: number;
  /** The file open in the drawer. */
  file?: string;
};

const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T) ? (value as T) : undefined;

export function mediaSearch(search: Record<string, unknown>): MediaSearch {
  const q = typeof search.q === "string" && search.q.trim() ? search.q.slice(0, 100) : undefined;
  const type = oneOf(mediaKinds, search.type);
  const show = oneOf(mediaShows, search.show);
  const page = Number(search.page);
  const file = typeof search.file === "string" && search.file ? search.file : undefined;
  return {
    ...(q && { q }),
    ...(type && { type }),
    ...(show && { show }),
    ...(Number.isInteger(page) && page > 1 && { page }),
    ...(file && { file }),
  };
}
