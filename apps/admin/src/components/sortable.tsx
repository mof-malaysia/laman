/**
 * Drag to reorder, for the admin's lists (the navigation's, the property panel's): each
 * row has a grip, moved by the
 * pointer or the keyboard (Space or Enter to pick up, the arrows, Space or Enter to
 * put down), and said aloud as it goes. Rows have no ids, so they're keyed by
 * position within their own list; each list is its own context, so lists nest.
 */
import {
  type Announcements,
  type DragEndEvent,
  DndContext,
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
import { type ReactNode, useRef } from "react";
import { GripIcon } from "@/components/grip-icon";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** A row's id in its list: the list's name and the row's position. */
export const sortId = (list: string, index: number) => `${list}:${index}`;

/** The ids of all of a list's rows. */
export const sortIds = (list: string, count: number) =>
  Array.from({ length: count }, (_, i) => sortId(list, i));

// Built once: dnd-kit rebuilds its sensors when these change.
const pointerOptions = { activationConstraint: { distance: 4 } };
const keyboardOptions = { coordinateGetter: sortableKeyboardCoordinates };

const indexOf = (id: string | number) => Number(String(id).split(":").at(-1));

export function SortableList({
  ids,
  names,
  onMove,
  children,
}: {
  ids: string[];
  /** Each row's name, said while it moves. */
  names: string[];
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, pointerOptions),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  // Where the carried row was last said to be, so it's said once per move.
  const spoken = useRef<string | number | null>(null);
  const label = (id: string | number) => names[indexOf(id)] ?? "";
  const where = (id: string | number) => ({ position: indexOf(id) + 1, count: ids.length });
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      spoken.current = active.id;
      return t("drag.start", { label: label(active.id), ...where(active.id) });
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === spoken.current) return undefined;
      spoken.current = over.id;
      return t("drag.over", { label: label(active.id), ...where(over.id) });
    },
    onDragEnd: ({ active, over }) =>
      over
        ? t("drag.end", { label: label(active.id), ...where(over.id) })
        : t("drag.cancel", { label: label(active.id) }),
    onDragCancel: ({ active }) => t("drag.cancel", { label: label(active.id) }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(indexOf(active.id), indexOf(over.id));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("drag.instructions") },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * A row of a `SortableList`: put `setNodeRef` and `style` on the row, and `handle` where
 * its grip goes. `dragging` is for the lifted look.
 */
export function useSortableRow(id: string, label: string) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging,
  } = useSortable({
    id,
    attributes: { roleDescription: t("drag.sortable") },
  });
  return {
    setNodeRef,
    // A translate, not a transform: rows of different heights keep their own size.
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
    },
    dragging: isDragging,
    handle: (
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("drag.handle", { label })}
        className={clx(
          "focus-ring text-txt-black-500 hover:text-txt-black-900 hover:bg-bg-washed flex size-6 shrink-0 touch-none items-center justify-center rounded-sm",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <GripIcon aria-hidden className="size-4" />
      </button>
    ),
  };
}

/** Where the row at position `i` ends up when the one at `from` moves to `to`. */
export const shifted = (i: number, from: number, to: number) => {
  if (i === from) return to;
  if (from < i && i <= to) return i - 1;
  if (to <= i && i < from) return i + 1;
  return i;
};
