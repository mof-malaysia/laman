/**
 * The left column: the page's structure, its blocks top to bottom, with a count.
 * Select a row; drag its grip or use its menu to reorder, duplicate or delete. The list takes one Tab stop and the arrow keys move through it. Add
 * block, at the foot of the column, opens the picker.
 */
import {
  type Block,
  type BlockGroup,
  type BlockType,
  blockDefinition,
  blocks as registry,
} from "@fiscal-sb/blocks";
import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type KeyboardEvent, type SVGProps, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon } from "@/components/ui/icons/arrow-down";
import { ArrowUpIcon } from "@/components/ui/icons/arrow-up";
import { DuplicateIcon } from "@/components/ui/icons/duplicate";
import { EllipsisVerticalIcon } from "@/components/ui/icons/ellipsis-vertical";
import { PlusIcon } from "@/components/ui/icons/plus";
import { Kbd } from "@/components/ui/kbd";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Tag } from "@/components/ui/tag";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { t } from "@/i18n";
import { blockDescription, blockLabel } from "@/i18n/registry";
import { clx } from "@/lib/ftds/utils";
import { BlockIcon, excerptOf, groupLabels } from "./block-meta";

type LeftColumnProps = {
  blocks: Block[];
  required?: (block: Block) => boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Opens the Add block picker, for a block at the end of the page (also the A key). */
  onAddBlock: () => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

export function LeftColumn(props: LeftColumnProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3.5">
        <h2 className="text-label-sm text-txt-black-900 font-semibold">{t("editor.left")}</h2>
        <span className="text-label-sm text-txt-black-500 tabular-nums">
          {t("editor.left.count", { count: props.blocks.length })}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Layers {...props} />
      </div>
      {/* Always in the same place, however long the page: the foot of the column. */}
      <div className="shrink-0 p-2">
        <Button
          // Blue Wash, not the fill: Publish is the editor's one blue button.
          variant="primary-outline"
          size="small"
          className="w-full justify-center"
          onClick={props.onAddBlock}
          aria-keyshortcuts="A"
        >
          <PlusIcon /> {t("editor.insert.here")}
          <Kbd combo="a" aria-hidden className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

/** How a screen reader names a block: its kind and, when it has one, its first words. */
function blockName(block: Block, excerpt = excerptOf(block)) {
  const label = blockLabel(block.type);
  if (!excerpt) return label;
  return `${label}: ${excerpt.length > 40 ? `${excerpt.slice(0, 40).trimEnd()}…` : excerpt}`;
}

function Layers({
  blocks,
  selected,
  required,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: LeftColumnProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const list = useRef<HTMLOListElement>(null);
  // Where the carried block was last said to be, so it's said once per move.
  const spoken = useRef<string | number | null>(null);
  const ids = blocks.map((b) => b.id);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  // Said aloud while a block is moved, in words: its name and where it is, never an id.
  const where = (id: string | number | undefined) => ({
    position: ids.indexOf(String(id)) + 1,
    count: ids.length,
  });
  const nameOf = (id: string | number) => {
    const block = blocks.find((b) => b.id === String(id));
    return block ? blockName(block) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      spoken.current = active.id;
      return t("editor.layers.drag.start", { block: nameOf(active.id), ...where(active.id) });
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === spoken.current) return undefined;
      spoken.current = over.id;
      return t("editor.layers.drag.over", { block: nameOf(active.id), ...where(over.id) });
    },
    onDragEnd: ({ active, over }) =>
      over
        ? t("editor.layers.drag.end", { block: nameOf(active.id), ...where(over.id) })
        : t("editor.layers.drag.cancel", { block: nameOf(active.id) }),
    onDragCancel: ({ active }) => t("editor.layers.drag.cancel", { block: nameOf(active.id) }),
  };

  // One Tab stop for the list: the selected row, or the first. The arrows move
  // through the rows, selecting as they go, so focus and selection never part.
  // (While a block is carried, dnd-kit takes its keys and prevents them, which keeps
  // the editor's own arrow and Escape shortcuts off the selection.)
  const current = selected && ids.includes(selected) ? selected : ids[0];
  const onRowKey = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const next = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: ids.length - 1,
    }[event.key];
    if (next === undefined) return;
    // Handled here, so the editor's own arrow shortcuts leave it alone.
    event.preventDefault();
    const id = ids[Math.max(0, Math.min(ids.length - 1, next))];
    if (!id) return;
    onSelect(id);
    list.current?.querySelector<HTMLElement>(`[data-layer-row="${id}"]`)?.focus();
  };

  if (blocks.length === 0)
    return (
      <p className="text-body-sm text-txt-black-700 px-2 py-1.5">{t("editor.layers.empty")}</p>
    );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("editor.layers.drag.instructions") },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={list} className="flex flex-col gap-0.5">
          {blocks.map((block, index) => (
            <LayerItem
              key={block.id}
              block={block}
              selected={block.id === selected}
              tabbable={block.id === current}
              onKeyDown={(event) => onRowKey(event, index)}
              required={required?.(block) ?? false}
              first={index === 0}
              last={index === blocks.length - 1}
              onSelect={() => onSelect(block.id)}
              onUp={() => onMove(index, index - 1)}
              onDown={() => onMove(index, index + 1)}
              onDuplicate={() => onDuplicate(block.id)}
              onRemove={() => onRemove(block.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

type LayerItemProps = {
  block: Block;
  selected: boolean;
  /** The list's one Tab stop. */
  tabbable: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  required: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onUp: () => void;
  onDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function LayerItem(props: LayerItemProps) {
  const { block, selected, required } = props;
  const {
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging,
  } = useSortable({
    id: block.id,
    attributes: { roleDescription: t("editor.layers.sortable") },
  });
  const tabIndex = props.tabbable ? 0 : -1;
  const definition = blockDefinition(block.type);
  const label = blockLabel(definition.type);
  const excerpt = excerptOf(block);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clx(
        "group/row relative flex items-center rounded-md",
        selected ? "bg-bg-primary-50" : "hover:bg-bg-washed",
        isDragging && "bg-bg-white shadow-card z-10",
      )}
    >
      {/* The row selects; dragging is the grip's job, so Enter and Space mean "open this block". */}
      <button
        type="button"
        data-layer-row={block.id}
        tabIndex={tabIndex}
        aria-label={blockName(block, excerpt)}
        onClick={props.onSelect}
        onKeyDown={props.onKeyDown}
        aria-current={selected || undefined}
        aria-describedby={required ? `${block.id}-required` : undefined}
        className="focus-ring flex min-w-0 grow items-center gap-2 rounded-md py-1.5 pr-2 pl-9 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={clx("text-label-sm truncate font-medium", selected && "text-txt-primary")}
            >
              {label}
            </span>
            {required && (
              // Why Duplicate and Delete are off: on hover here, and read out with the row
              // through its description below.
              <>
                <span className="sr-only">, </span>
                <Tooltip>
                  <TooltipTrigger render={<Tag size="small" />}>
                    {t("editor.layers.required")}
                  </TooltipTrigger>
                  <TooltipContent>{t("editor.layers.requiredWhy")}</TooltipContent>
                </Tooltip>
              </>
            )}
          </span>
          <span className="sr-only">: </span>
          <span className="text-label-compact text-txt-black-700 truncate">{excerpt || " "}</span>
        </span>
      </button>
      {required && (
        <span id={`${block.id}-required`} className="sr-only">
          {t("editor.layers.requiredWhy")}
        </span>
      )}
      {/* The block's icon turns into its grip under the pointer or the keyboard, so the
          handle is where the hand already is and the text keeps the row's width. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        tabIndex={tabIndex}
        onClick={props.onSelect}
        aria-label={t("editor.layers.reorder", { block: blockName(block, excerpt) })}
        className="group/grip focus-ring absolute top-1/2 left-1 flex size-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-sm active:cursor-grabbing"
      >
        <BlockIcon
          name={definition.icon}
          aria-hidden
          className={clx(
            "size-4 group-hover/row:hidden group-focus-visible/grip:hidden",
            selected ? "text-txt-primary" : "text-txt-black-500",
            isDragging && "hidden",
          )}
        />
        <GripIcon
          aria-hidden
          className={clx(
            "text-txt-black-700 hidden size-4 group-hover/row:block group-focus-visible/grip:block",
            isDragging && "block",
          )}
        />
      </button>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="default-ghost"
              size="small"
              iconOnly
              tabIndex={tabIndex}
              // Always there on the selected row, so its actions can be found without hovering.
              // It takes room only while it shows, so the other rows' text runs the full width.
              className={clx(
                "mr-0.5 shrink-0 group-focus-within/row:flex group-hover/row:flex data-[popup-open]:flex",
                selected ? "flex" : "hidden",
              )}
              aria-label={t("editor.layers.actions", { block: label })}
            />
          }
        >
          <EllipsisVerticalIcon />
        </MenuTrigger>
        <MenuContent>
          <MenuItem disabled={props.first} onClick={props.onUp}>
            <MenuItemIcon>
              <ArrowUpIcon />
            </MenuItemIcon>
            {t("editor.block.up")}
          </MenuItem>
          <MenuItem disabled={props.last} onClick={props.onDown}>
            <MenuItemIcon>
              <ArrowDownIcon />
            </MenuItemIcon>
            {t("editor.block.down")}
          </MenuItem>
          <MenuItem disabled={required} onClick={props.onDuplicate}>
            <MenuItemIcon>
              <DuplicateIcon />
            </MenuItemIcon>
            {t("editor.block.duplicate")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="danger" disabled={required} onClick={props.onRemove}>
            <MenuItemIcon>
              <TrashIcon />
            </MenuItemIcon>
            {t("editor.block.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

/** Six dots: the handle a row is dragged by. */
function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      {[7, 13].flatMap((x) =>
        [5, 10, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />),
      )}
    </svg>
  );
}

const groupOrder: BlockGroup[] = ["opening", "content", "action", "contact", "listing"];

/** The blocks this page can hold whose name or description mentions `query`, in palette order. */
export function blockChoices(allowed: readonly BlockType[], query = "") {
  const words = query.trim().toLowerCase();
  return groupOrder.flatMap((group) =>
    registry.filter(
      (b) =>
        b.group === group &&
        allowed.includes(b.type) &&
        (!words ||
          // Either language finds it: officers may know the English name.
          `${b.label} ${b.description} ${blockLabel(b.type)} ${blockDescription(b.type)}`
            .toLowerCase()
            .includes(words)),
    ),
  );
}

/**
 * The block palette, grouped by kind, in the Add block picker.
 */
export function BlockChoices({
  allowed,
  query,
  onPick,
}: {
  allowed: readonly BlockType[];
  query?: string;
  onPick: (type: BlockType) => void;
}) {
  const offered = blockChoices(allowed, query);
  if (!offered.length)
    return <p className="text-body-sm text-txt-black-700 px-1">{t("editor.picker.none")}</p>;
  return (
    <div className="flex flex-col gap-5">
      {groupOrder.map((group) => {
        const items = offered.filter((b) => b.group === group);
        if (!items.length) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="text-label-compact text-txt-black-700 px-0.5 font-semibold">
              {t(groupLabels[group])}
            </h3>
            {/* Tiles, two abreast: a block is chosen by what it is, so its icon leads and
                the description stays to two lines. */}
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
              {items.map((definition) => (
                <li key={definition.type} className="flex">
                  <button
                    type="button"
                    onClick={() => onPick(definition.type)}
                    title={blockDescription(definition.type)}
                    className="group border-otl-gray-200 bg-bg-white hover:border-otl-primary-300 hover:bg-bg-primary-50 focus-ring flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 motion-reduce:transition-none"
                  >
                    <span
                      aria-hidden
                      className="bg-bg-primary-50 text-txt-primary group-hover:bg-bg-white flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 motion-reduce:transition-none"
                    >
                      <BlockIcon name={definition.icon} className="size-4.5" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-label-md text-txt-black-900 font-medium">
                        {blockLabel(definition.type)}
                      </span>
                      <span className="text-label-compact text-txt-black-700 line-clamp-2">
                        {blockDescription(definition.type)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
