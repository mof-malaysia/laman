import type { MediaInfo } from "@fiscal-sb/blocks";

/** A picture's narrower WebP copies, for `srcset`; undefined when it has none. */
export const srcsetOf = (info: MediaInfo) =>
  info.variants.map((v) => `${v.url} ${v.width}w`).join(", ") || undefined;

/** The smallest copy at least `width` pixels wide, for small pictures such as portraits. */
export const atLeast = (info: MediaInfo, width: number) =>
  info.variants.find((v) => v.width >= width)?.url ?? info.url;
