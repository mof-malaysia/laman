/**
 * Which column a block sits in: FTDS's `wide` (1280px) or `article` (808px).
 * A block set to "Follow page" takes the page's: an entry's is the article
 * column its header uses; any other page's is its intro's width.
 */
import type { RenderInput } from "@laman/blocks";

export type Column = "wide" | "article";

/** Each render's page column, worked out on its first block that follows the page. */
const pageColumns = new WeakMap<RenderInput, Column>();

function pageColumn(input: RenderInput): Column {
  let column = pageColumns.get(input);
  if (!column) {
    const intro = input.page.blocks.find((b) => b.type === "pageIntro");
    column =
      input.entry || (intro?.type === "pageIntro" && intro.props.width === "article")
        ? "article"
        : "wide";
    pageColumns.set(input, column);
  }
  return column;
}

/** A block's width setting as a column. */
export const columnOf = (width: "page" | Column | undefined, input: RenderInput): Column =>
  width === "article" || width === "wide" ? width : pageColumn(input);
