/**
 * The page tree in memory: the home page at the root, every other page under
 * a parent, siblings in `position` order. A page's path is the slugs from the
 * home page down, so it follows renames and moves without being stored.
 */
import {
  type PageKind,
  SEARCH_INDEX_DIR,
  SEARCH_PATH,
  listingReservedSlug,
  pathOf,
} from "@laman/blocks";
import { sql } from "kysely";
import type { Db } from "../db/index.js";
import { type Loads, once } from "./loads.js";
import type { PagesTable } from "../db/schema.js";

export type TreeNode = Pick<PagesTable, "id" | "parent_id" | "slug" | "position"> & {
  kind: PageKind;
};

/** Slugs the published site uses for itself under the home page: site search's page and index. */
const reservedSlugs = new Set([SEARCH_PATH.slice(1), SEARCH_INDEX_DIR]);

export class Tree {
  readonly #nodes = new Map<string, TreeNode>();
  readonly #children = new Map<string | null, TreeNode[]>();

  constructor(rows: TreeNode[]) {
    for (const row of rows) this.#nodes.set(row.id, { ...row });
    this.#index();
  }

  #index() {
    this.#children.clear();
    for (const node of this.#nodes.values()) {
      const list = this.#children.get(node.parent_id) ?? [];
      list.push(node);
      this.#children.set(node.parent_id, list);
    }
    for (const list of this.#children.values())
      list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  get home(): TreeNode | undefined {
    return this.#children.get(null)?.[0];
  }

  /**
   * Whether `slug` under `parentId` is an address the published site keeps
   * for itself: search under the home page, a listing's own pages under a
   * listing (kategori, halaman, lokasi, 2026-11).
   */
  reserved(parentId: string | null, slug: string) {
    if (parentId === null) return false;
    if (parentId === this.home?.id && reservedSlugs.has(slug)) return true;
    return this.#nodes.get(parentId)?.kind === "listing" && listingReservedSlug(slug);
  }

  get(id: string): TreeNode | undefined {
    return this.#nodes.get(id);
  }

  children(id: string | null): TreeNode[] {
    return this.#children.get(id) ?? [];
  }

  /** Every page under `id`, depth first, in sibling order. */
  descendants(id: string): TreeNode[] {
    return this.children(id).flatMap((child) => [child, ...this.descendants(child.id)]);
  }

  /** Every page, depth first from the home page. */
  all(): TreeNode[] {
    return this.children(null).flatMap((root) => [root, ...this.descendants(root.id)]);
  }

  /** The pages above `id`, from the home page down; empty for the home page. */
  ancestors(id: string): TreeNode[] {
    const list: TreeNode[] = [];
    for (let node = this.get(id); node?.parent_id;) {
      node = this.get(node.parent_id);
      if (node) list.unshift(node);
    }
    return list;
  }

  /** `id` is `ancestor` or somewhere under it. */
  isWithin(id: string, ancestor: string): boolean {
    for (
      let node = this.get(id);
      node;
      node = node.parent_id ? this.get(node.parent_id) : undefined
    )
      if (node.id === ancestor) return true;
    return false;
  }

  path(id: string): string {
    const slugs: string[] = [];
    for (let node = this.get(id); node?.parent_id; node = this.get(node.parent_id))
      slugs.unshift(node.slug);
    return pathOf(slugs);
  }

  /** Re-parents and renames a node in memory, for working out the paths a move would change. */
  place(id: string, parentId: string, slug: string) {
    const node = this.#nodes.get(id);
    if (!node) return;
    node.parent_id = parentId;
    node.slug = slug;
    this.#index();
  }
}

/** The tree of live (not deleted) pages. */
export async function loadTree(db: Db): Promise<Tree> {
  const rows = await db
    .selectFrom("pages")
    .select(["id", "parent_id", "slug", "position", "kind"])
    .where("deleted_at", "is", null)
    .execute();
  return new Tree(rows);
}

/** The tree, read once per publish when `loads` is given. */
export const treeOf = (db: Db, loads?: Loads) => once(loads, "tree", () => loadTree(db));

/** Every live page's title (its draft's), by id; read once per publish when `loads` is given. */
export const pageTitles = (db: Db, loads?: Loads) =>
  once(loads, "titles", async () => {
    const rows = await db
      .selectFrom("pages")
      .select(["id", sql<string>`json_extract(draft, '$.ms.title')`.as("title")])
      .where("deleted_at", "is", null)
      .execute();
    return new Map(rows.map((r) => [r.id, r.title]));
  });

/**
 * The trail from the home page down to a page, by its pages' titles; the
 * last item is the page itself, unlinked. Undefined on the home page.
 * Entries aren't in the tree, so they name their listing as `parentId`.
 */
export async function breadcrumbOf(
  db: Db,
  page: { id: string; parentId?: string },
  title: string,
  loads?: Loads,
): Promise<{ label: string; href?: string }[] | undefined> {
  const [tree, titles] = await Promise.all([treeOf(db, loads), pageTitles(db, loads)]);
  const parent = tree.get(page.parentId ?? tree.get(page.id)?.parent_id ?? "");
  if (!parent) return undefined;
  return [
    ...[...tree.ancestors(parent.id), parent].map((node) => ({
      label: titles.get(node.id) || (node.parent_id ? node.slug : "Utama"),
      href: tree.path(node.id),
    })),
    { label: title },
  ];
}
