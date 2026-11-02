/**
 * The editor's state: the page document, the selected block, and undo and
 * redo stacks of whole documents. Every change goes through `editorReducer`.
 */
import {
  type Block,
  type BlockType,
  type PageContent,
  type PageDocument,
  newBlock,
} from "@fiscal-sb/blocks";

export type EditorState = {
  doc: PageDocument;
  selected: string | null;
  past: PageDocument[];
  future: PageDocument[];
  /**
   * Bumped by every change the canvas doesn't already show, so the canvas
   * re-renders. Typing on the canvas itself doesn't bump it.
   */
  renderVersion: number;
  /** Consecutive edits to the same field share one undo step. */
  lastEditKey: string | null;
};

export type EditorAction =
  | { type: "select"; id: string | null }
  | { type: "setTitle"; title: string }
  | { type: "setProps"; id: string; props: Block["props"]; source: "panel" | "canvas"; key: string }
  /** Typing on the canvas: one text field, already showing there. */
  | { type: "setField"; id: string; field: string; value: string }
  /** Adds a block at `at`, or after the selected block (else last). */
  | { type: "add"; blockType: BlockType; at?: number }
  | { type: "duplicate"; id: string }
  /** Moves the selection to the next (1) or previous (-1) block. */
  | { type: "step"; by: 1 | -1 }
  /** A change to the document outside the blocks: SEO, redirect. */
  | { type: "setDoc"; update: (doc: PageDocument) => PageDocument; key: string; rerender?: boolean }
  | { type: "move"; from: number; to: number }
  | { type: "remove"; id: string }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 100;

export const initialState = (doc: PageDocument): EditorState => ({
  doc,
  selected: null,
  past: [],
  future: [],
  renderVersion: 0,
  lastEditKey: null,
});

// The slice edits BM only; the document already has room for EN.
const updatePage = (
  doc: PageDocument,
  update: (page: PageContent) => PageContent,
): PageDocument => ({
  ...doc,
  ms: update(doc.ms),
});

function commit(
  state: EditorState,
  doc: PageDocument,
  options: { rerender: boolean; key?: string; selected?: string | null },
): EditorState {
  const coalesce = options.key !== undefined && options.key === state.lastEditKey;
  return {
    doc,
    selected: options.selected === undefined ? state.selected : options.selected,
    past: coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    renderVersion: options.rerender ? state.renderVersion + 1 : state.renderVersion,
    lastEditKey: options.key ?? null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.id, lastEditKey: null };

    case "setTitle":
      return commit(
        state,
        updatePage(state.doc, (page) => ({ ...page, title: action.title })),
        { rerender: false, key: "page.title" },
      );

    case "setProps":
      return commit(
        state,
        updatePage(state.doc, (page) => ({
          ...page,
          blocks: page.blocks.map((block) =>
            block.id === action.id ? ({ ...block, props: action.props } as Block) : block,
          ),
        })),
        { rerender: action.source === "panel", key: `${action.id}.${action.key}` },
      );

    case "setField": {
      const block = state.doc.ms.blocks.find((b) => b.id === action.id);
      if (!block) return state;
      return editorReducer(state, {
        type: "setProps",
        id: action.id,
        props: { ...block.props, [action.field]: action.value } as Block["props"],
        source: "canvas",
        key: action.field,
      });
    }

    case "add": {
      const block = newBlock(action.blockType);
      const blocks = state.doc.ms.blocks;
      const after = blocks.findIndex((b) => b.id === state.selected);
      const at = action.at ?? (after === -1 ? blocks.length : after + 1);
      return commit(
        state,
        updatePage(state.doc, (page) => ({ ...page, blocks: page.blocks.toSpliced(at, 0, block) })),
        { rerender: true, selected: block.id },
      );
    }

    case "duplicate": {
      const blocks = state.doc.ms.blocks;
      const index = blocks.findIndex((b) => b.id === action.id);
      const original = blocks[index];
      if (!original) return state;
      const copy = { ...newBlock(original.type), props: structuredClone(original.props) } as Block;
      return commit(
        state,
        updatePage(state.doc, (page) => ({
          ...page,
          blocks: page.blocks.toSpliced(index + 1, 0, copy),
        })),
        { rerender: true, selected: copy.id },
      );
    }

    case "step": {
      const blocks = state.doc.ms.blocks;
      if (!blocks.length) return state;
      const index = blocks.findIndex((b) => b.id === state.selected);
      const next =
        index === -1
          ? action.by === 1
            ? 0
            : blocks.length - 1
          : Math.min(blocks.length - 1, Math.max(0, index + action.by));
      return { ...state, selected: blocks[next]?.id ?? null, lastEditKey: null };
    }

    case "setDoc":
      return commit(state, action.update(state.doc), {
        rerender: action.rerender ?? false,
        key: action.key,
      });

    case "move": {
      const blocks = state.doc.ms.blocks;
      const moved = blocks[action.from];
      if (!moved || action.to < 0 || action.to >= blocks.length || action.from === action.to)
        return state;
      const next = blocks.toSpliced(action.from, 1).toSpliced(action.to, 0, moved);
      return commit(
        state,
        updatePage(state.doc, (page) => ({ ...page, blocks: next })),
        { rerender: true },
      );
    }

    case "remove":
      return commit(
        state,
        updatePage(state.doc, (page) => ({
          ...page,
          blocks: page.blocks.filter((b) => b.id !== action.id),
        })),
        { rerender: true, selected: state.selected === action.id ? null : state.selected },
      );

    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        renderVersion: state.renderVersion + 1,
        lastEditKey: null,
      };
    }

    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future,
        renderVersion: state.renderVersion + 1,
        lastEditKey: null,
      };
    }
  }
}

/** The value at a dotted path inside a block's props ("features.0.title"). */
export function getAt(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}

/**
 * A copy of `value` with `path` set to `next`. `undefined` removes the key
 * (an optional field left empty), so drafts stay valid.
 */
export function setAt(value: unknown, path: string[], next: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return next;
  if (Array.isArray(value)) {
    const copy = [...value];
    copy[Number(key)] = setAt(copy[Number(key)], rest, next);
    return copy;
  }
  const object = { ...(value as Record<string, unknown> | undefined) };
  const child = setAt(object[key], rest, next);
  if (child === undefined) delete object[key];
  else object[key] = child;
  return object;
}
