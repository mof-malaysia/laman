/**
 * The canvas: the renderer's edit mode in a same-origin iframe, at a chosen
 * width on the Well. The page in it runs no editor code; this component
 * reaches into its document to mark the selected block (with a small
 * floating toolbar), make text fields editable in place, show an "insert
 * here" line between blocks, take blocks dragged from the palette, and swap
 * in fresh HTML from the renderer after changes made elsewhere.
 */
import { type EntryFields, type PageContent, blockDefinition } from "@fiscal-sb/blocks";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { api } from "@/lib/api";

export type CanvasWidth = "desktop" | "tablet" | "mobile";
export type CanvasZoom = "fit" | "100";
export type BlockAction = "up" | "down" | "duplicate" | "delete" | "panel";

export const canvasWidths: Record<CanvasWidth, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

type CanvasProps = {
  pageId: string;
  page: PageContent;
  /** An entry's fixed fields, for its article header. */
  entry?: EntryFields | undefined;
  selected: string | null;
  renderVersion: number;
  width: CanvasWidth;
  zoom: CanvasZoom;
  onSelect: (id: string | null) => void;
  onFieldInput: (blockId: string, field: string, value: string) => void;
  onBlockAction: (action: BlockAction, blockId: string) => void;
  /** The "Add block" line was clicked: a block chosen next goes at `index`. */
  onInsertAt: (index: number) => void;
  /** Keys pressed inside the canvas that belong to the editor. */
  onKey: (
    key: "undo" | "redo" | "save" | "up" | "down" | "escape" | "delete" | "duplicate",
  ) => void;
};

// Uses FTDS's focus colour, so the overlay matches the design system's rings.
// --ui undoes the canvas zoom: outlines and buttons stay their size on screen.
const overlayCss = `
:root { --ui: 1; }
[data-ftds-block] { position: relative; }
[data-ftds-block]:hover { outline: calc(2px * var(--ui)) dashed rgb(var(--fr-primary) / 0.6); outline-offset: calc(-2px * var(--ui)); }
[data-ftds-block][data-selected] { outline: calc(3px * var(--ui)) solid rgb(var(--fr-primary)); outline-offset: calc(-3px * var(--ui)); }
[data-ftds-field] { cursor: text; border-radius: 2px; outline: none; }
[data-ftds-field]:hover { background: rgb(var(--fr-primary) / 0.08); }
[data-ftds-field]:focus { box-shadow: 0 0 0 calc(2px * var(--ui)) rgb(var(--fr-primary)); }
[data-ftds-field]:empty::before { content: attr(data-placeholder); opacity: 0.45; }
#ftds-toolbar, #ftds-insert { position: absolute; z-index: 50; display: none; font: 500 13px/1 system-ui, sans-serif; }
#ftds-toolbar { align-items: center; gap: 2px; padding: 3px; border-radius: 6px 6px 0 0; background: rgb(var(--fr-primary)); transform: scale(var(--ui)); }
#ftds-toolbar .ftds-name { color: #fff; font-weight: 600; padding: 0 10px 0 6px; white-space: nowrap; }
#ftds-toolbar button { all: unset; cursor: pointer; color: #fff; min-width: 28px; height: 28px; padding: 0 6px; font-size: 15px; text-align: center; border-radius: 4px; }
#ftds-toolbar button:hover, #ftds-toolbar button:focus-visible { background: rgb(255 255 255 / 0.2); }
#ftds-insert { left: 0; right: 0; height: calc(2px * var(--ui)); background: rgb(var(--fr-primary)); align-items: center; justify-content: center; }
#ftds-insert button { all: unset; cursor: pointer; color: #fff; background: rgb(var(--fr-primary)); border-radius: 999px; padding: 6px 14px; transform: scale(var(--ui)); }
`;

const toolbarButtons: { action: BlockAction; glyph: string; label: Parameters<typeof t>[0] }[] = [
  { action: "up", glyph: "↑", label: "editor.block.up" },
  { action: "down", glyph: "↓", label: "editor.block.down" },
  { action: "duplicate", glyph: "⧉", label: "editor.block.duplicate" },
  { action: "delete", glyph: "✕", label: "editor.block.delete" },
  { action: "panel", glyph: "⋯", label: "editor.block.panel" },
];

/** Where a point falls between top-level blocks: the index a block inserted there would take. */
function gapAt(d: Document, y: number) {
  const blocks = [...d.querySelectorAll<HTMLElement>("main > [data-ftds-block]")];
  for (const [index, block] of blocks.entries()) {
    const rect = block.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { index, edge: rect.top };
  }
  const last = blocks.at(-1)?.getBoundingClientRect();
  return { index: blocks.length, edge: last ? last.bottom : 0 };
}

export function Canvas(props: CanvasProps) {
  const { pageId, selected, renderVersion, width, zoom } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const well = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [height, setHeight] = useState(0);
  /** 1 / the canvas zoom, for sizes inside the iframe that should look the same at any zoom. */
  const ui = useRef(1);
  // Listeners live in the iframe; they read the latest props through this ref.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  useLayoutEffect(() => {
    const element = well.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setAvailable(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const doc = () => frame.current?.contentDocument ?? null;

  /** The toolbar sits on the selected block's top-left corner, named for its block. */
  const placeToolbar = () => {
    const d = doc();
    const bar = d?.getElementById("ftds-toolbar");
    if (!d || !bar) return;
    const id = latest.current.selected;
    const el = id ? d.querySelector<HTMLElement>(`[data-ftds-block="${CSS.escape(id)}"]`) : null;
    const block = latest.current.page.blocks.find((b) => b.id === id);
    if (!el || !block) {
      bar.style.display = "none";
      return;
    }
    const name = bar.querySelector(".ftds-name");
    if (name) name.textContent = blockDefinition(block.type).label;
    bar.style.display = "flex";
    const top = el.getBoundingClientRect().top + (d.defaultView?.scrollY ?? 0);
    // Above the block, scaled from its bottom edge; inside it when there's no room.
    const above = top - bar.offsetHeight * ui.current >= 0;
    bar.style.transformOrigin = above ? "bottom left" : "top left";
    bar.style.top = `${above ? top - bar.offsetHeight : top}px`;
    bar.style.left = `${el.getBoundingClientRect().left}px`;
  };

  const markSelection = () => {
    const d = doc();
    if (!d) return;
    for (const el of d.querySelectorAll("[data-selected]")) el.removeAttribute("data-selected");
    const id = latest.current.selected;
    const el = id ? d.querySelector(`[data-ftds-block="${CSS.escape(id)}"]`) : null;
    el?.setAttribute("data-selected", "");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    placeToolbar();
  };

  const prepareFields = () => {
    for (const field of doc()?.querySelectorAll<HTMLElement>("[data-ftds-field]") ?? []) {
      field.contentEditable = "plaintext-only";
      field.spellcheck = true;
    }
  };

  /** Shows the insert line at a gap; hides it with `null`. */
  const showInsert = (gap: { index: number; edge: number } | null) => {
    const d = doc();
    const line = d?.getElementById("ftds-insert");
    if (!d || !line) return;
    if (!gap) {
      line.style.display = "none";
      return;
    }
    line.style.display = "flex";
    line.style.top = `${gap.edge + (d.defaultView?.scrollY ?? 0) - 1}px`;
    line.dataset.index = String(gap.index);
  };

  const attach = () => {
    const d = doc();
    if (!d) return;
    const style = d.createElement("style");
    style.textContent = overlayCss;
    d.head.append(style);

    d.documentElement.style.setProperty("--ui", String(ui.current));
    const bar = d.createElement("div");
    bar.id = "ftds-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", t("editor.block.toolbar"));
    const tag = d.createElement("span");
    tag.className = "ftds-name";
    bar.append(tag);
    for (const item of toolbarButtons) {
      const button = d.createElement("button");
      button.type = "button";
      button.textContent = item.glyph;
      button.title = t(item.label);
      button.setAttribute("aria-label", t(item.label));
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = latest.current.selected;
        if (id) latest.current.onBlockAction(item.action, id);
      });
      bar.append(button);
    }
    const insert = d.createElement("div");
    insert.id = "ftds-insert";
    const add = d.createElement("button");
    add.type = "button";
    add.textContent = `+ ${t("editor.insert.here")}`;
    add.addEventListener("click", (event) => {
      event.stopPropagation();
      latest.current.onInsertAt(Number(insert.dataset.index ?? 0));
    });
    insert.append(add);
    d.body.append(bar, insert);

    prepareFields();
    markSelection();

    d.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        if (target.closest("#ftds-toolbar, #ftds-insert")) return;
        // Links and buttons don't navigate on the canvas; a click selects.
        if (target.closest("a")) event.preventDefault();
        const block = target.closest<HTMLElement>("[data-ftds-block]");
        latest.current.onSelect(block?.dataset.ftdsBlock ?? null);
      },
      true,
    );
    d.addEventListener("input", (event) => {
      const field = (event.target as Element).closest<HTMLElement>("[data-ftds-field]");
      const block = field?.closest<HTMLElement>("[data-ftds-block]");
      if (!field || !block?.dataset.ftdsBlock || !field.dataset.ftdsField) return;
      latest.current.onFieldInput(
        block.dataset.ftdsBlock,
        field.dataset.ftdsField,
        field.textContent ?? "",
      );
      placeToolbar();
    });
    d.addEventListener("keydown", (event) => {
      const inField = (event.target as Element).closest?.("[data-ftds-field]");
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const send = (name: Parameters<CanvasProps["onKey"]>[0]) => {
        event.preventDefault();
        latest.current.onKey(name);
      };
      if (inField && (event.key === "Enter" || event.key === "Escape")) {
        event.preventDefault();
        (inField as HTMLElement).blur();
      } else if (mod && key === "z") send(event.shiftKey ? "redo" : "undo");
      else if (mod && key === "s") send("save");
      else if (inField) return;
      else if (mod && key === "d") send("duplicate");
      else if (event.key === "ArrowDown") send("down");
      else if (event.key === "ArrowUp") send("up");
      else if (event.key === "Escape") send("escape");
      else if (event.key === "Backspace" || event.key === "Delete") send("delete");
    });
    // "Insert here" between blocks: near a block's top or bottom edge.
    d.addEventListener("mousemove", (event) => {
      if ((event.target as Element).closest("#ftds-insert, #ftds-toolbar")) return;
      const block = (event.target as Element).closest<HTMLElement>("main > [data-ftds-block]");
      if (!block) return showInsert(null);
      const rect = block.getBoundingClientRect();
      // A band at each edge, the same size on screen at any zoom.
      const band = 16 * ui.current;
      const nearTop = event.clientY - rect.top < band;
      const nearBottom = rect.bottom - event.clientY < band;
      showInsert(nearTop || nearBottom ? gapAt(d, nearTop ? rect.top : rect.bottom + 1) : null);
    });
    d.addEventListener("mouseleave", () => showInsert(null));
    d.defaultView?.addEventListener("resize", placeToolbar);
  };

  useEffect(markSelection, [selected]);

  // After a change the canvas doesn't already show, render the page again and
  // swap its <main>. The document (and its scroll position) stays.
  useEffect(() => {
    if (renderVersion === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const html = await api
          .post(`render/pages/${pageId}`, {
            json: { mode: "edit", page: latest.current.page, entry: latest.current.entry },
            signal: controller.signal,
          })
          .text();
        const next = new DOMParser().parseFromString(html, "text/html").querySelector("main");
        const main = doc()?.querySelector("main");
        if (!next || !main) return;
        main.innerHTML = next.innerHTML;
        prepareFields();
        markSelection();
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only renderVersion asks for a new render
  }, [renderVersion, pageId]);

  const pixels = canvasWidths[width];
  const scale = zoom === "fit" && available > 0 ? Math.min(1, (available - 24) / pixels) : 1;
  useLayoutEffect(() => {
    ui.current = 1 / scale;
    // A frame that hasn't loaded yet has a document with no root element.
    doc()?.documentElement?.style.setProperty("--ui", String(ui.current));
  });
  useEffect(() => {
    const timer = setTimeout(placeToolbar, 50);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- re-place after the frame resizes
  }, [pixels, scale]);

  return (
    <div ref={well} className="bg-bg-washed h-full overflow-auto p-3">
      <div
        className="mx-auto overflow-hidden rounded-md"
        style={{ width: pixels * scale, height: Math.max(0, height - 24) }}
      >
        {/* The canvas must be same-origin with scripts (the editor reaches in, FTDS
            components run), which a sandbox can't restrict; it only shows our renderer. */}
        {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
        <iframe
          ref={frame}
          title={t("editor.canvas")}
          src={`/render/pages/${pageId}?mode=edit`}
          onLoad={attach}
          className="bg-bg-white origin-top-left"
          style={{
            width: pixels,
            height: Math.max(0, height - 24) / scale,
            transform: scale === 1 ? undefined : `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}
