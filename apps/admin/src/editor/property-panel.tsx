/**
 * The right panel: the selected block's fields, generated from its schema in
 * the block registry (`blockFields`), or the page's own settings when no block
 * is selected. Problems are the schema's own messages, shown on the field.
 */
import { IconPicker } from "@/components/icon-picker";
import { featureIconSections } from "@/lib/feature-icons";
import {
  type Block,
  type FieldSpec,
  type PageKind,
  type SiteFeature,
  type RichText,
  Block as BlockSchema,
  blockDefinition,
  fieldShown,
} from "@laman/blocks";
import { type ReactNode, useId } from "react";
import { SortableList, sortId, sortIds, useSortableRow } from "@/components/sortable";
import { clx } from "@/lib/ftds/utils";
import { Button } from "@/components/ui/button";
import { PagePicker } from "@/components/page-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset } from "@/components/ui/fieldset";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { EllipsisVerticalIcon } from "@/components/ui/icons/ellipsis-vertical";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuItemIcon, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { type MessageKey, t } from "@/i18n";
import { blockLabel, localBlockFields } from "@/i18n/registry";
import { usePages } from "@/lib/pages";
import { itemTitle } from "./block-meta";
import { EmbedsAllowed } from "./embeds-allowed";
import { MediaField } from "./media-field";
import { RichTextField } from "./rich-text-field";
import { moveItem } from "@/site/navigation-model";
import { getAt, setAt } from "./state";

type Issues = Map<string, string>;

/** The schema's problems with a block, keyed by path inside its props. */
function issuesOf(block: Block): Issues {
  const result = BlockSchema.safeParse(block);
  if (result.success) return new Map();
  return new Map(
    result.error.issues
      .filter((issue) => issue.path[0] === "props")
      .map((issue) => [issue.path.slice(1).join("."), issue.message]),
  );
}

/** A new, empty list item: required text fields start empty, the rest unset. */
const emptyItem = (fields: FieldSpec[]) =>
  Object.fromEntries(
    fields.filter((f) => f.required && f.widget === "text").map((f) => [f.name, ""]),
  );

type PropertyPanelProps = {
  block: Block;
  onChange: (props: Block["props"], key: string) => void;
  onRemove: () => void;
  /** Shown above the fields: a way to what the block uses that's set up elsewhere. */
  intro?: ReactNode;
  /** The page's kind: some fields are offered only on some kinds. */
  kind: PageKind;
  /** Site features that are off, each with a note saying where to turn it on: fields that need one are locked. */
  off?: Off;
};

export function PropertyPanel({ block, onChange, onRemove, intro, kind, off }: PropertyPanelProps) {
  const definition = blockDefinition(block.type);
  const issues = issuesOf(block);
  const set = (path: string[], value: unknown) =>
    onChange(setAt(block.props, path, value) as Block["props"], path.join("."));

  const fields = localBlockFields(block.type);

  return (
    <div className="flex flex-col">
      {intro}
      {fieldGroups(fields.filter((f) => fieldShown(f, block.props, fields, kind))).map(
        ([group, list]) => (
          <details
            key={group}
            open
            className="group/section border-otl-gray-200 border-t first:border-t-0"
          >
            <summary className="focus-ring-inset hover:bg-bg-washed flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <h3 className="text-label-md text-txt-black-900 font-semibold">{t(group)}</h3>
              <ChevronDownIcon
                aria-hidden
                className="text-txt-black-500 size-4 transition-transform group-open/section:rotate-180"
              />
            </summary>
            <div className="px-4 pb-5">
              <Fields
                fields={list}
                siblings={fields}
                value={block.props}
                path={[]}
                issues={issues}
                set={set}
                off={off}
              />
            </div>
          </details>
        ),
      )}
      {/* Away from the title, so it isn't hit by accident. */}
      <div className="border-otl-gray-200 border-t p-4">
        <Button variant="danger-outline" size="small" onClick={onRemove}>
          <TrashIcon /> {t("editor.block.remove", { block: blockLabel(definition.type) })}
        </Button>
      </div>
    </div>
  );
}

/** Content first, then links styled as buttons, then how the block looks. */
const groupOf = (field: FieldSpec): MessageKey =>
  field.widget === "select"
    ? "editor.fields.appearance"
    : field.widget === "link"
      ? "editor.fields.actions"
      : "editor.fields.content";

function fieldGroups(fields: FieldSpec[]): [MessageKey, FieldSpec[]][] {
  const order: MessageKey[] = [
    "editor.fields.content",
    "editor.fields.actions",
    "editor.fields.appearance",
  ];
  return order.flatMap((group): [MessageKey, FieldSpec[]][] => {
    const list = fields.filter((f) => groupOf(f) === group);
    return list.length ? [[group, list]] : [];
  });
}

type FieldsProps = {
  fields: FieldSpec[];
  /** Every field beside these, whose values and defaults `when` reads; `fields` by default. */
  siblings?: FieldSpec[];
  value: unknown;
  path: string[];
  issues: Issues;
  set: (path: string[], value: unknown) => void;
  off?: Off | undefined;
};

type Off = Partial<Record<SiteFeature, ReactNode>>;

/** The fields that show for `value`: hidden ones keep what they hold, so switching back loses nothing. */
function Fields({ fields, siblings = fields, value, path, issues, set, off }: FieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {fields
        .filter((field) => fieldShown(field, value, siblings))
        .map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <FieldEditor
              field={field}
              value={value}
              path={[...path, field.name]}
              issues={issues}
              set={set}
              disabled={Boolean(field.needs && off?.[field.needs])}
            />
            {(field.needs && off?.[field.needs]) ??
              (field.help && <p className="text-body-sm text-txt-black-700">{field.help}</p>)}
          </div>
        ))}
    </div>
  );
}

type FieldEditorProps = {
  field: FieldSpec;
  value: unknown;
  path: string[];
  issues: Issues;
  set: (path: string[], value: unknown) => void;
  /** Shown but not editable: a toggle whose site feature is off (see `off`). */
  disabled?: boolean;
};

function FieldEditor({ field, value: parent, path, issues, set, disabled }: FieldEditorProps) {
  const id = useId();
  const value = getAt(parent, [field.name]);
  const error = issues.get(path.join("."));
  // An optional field left empty is removed, not saved as "".
  const setText = (text: string) => set(path, text === "" && !field.required ? undefined : text);

  switch (field.widget) {
    case "text":
    case "textarea":
      return (
        <Field name={path.join(".")} invalid={Boolean(error)}>
          <FieldLabel>{field.title}</FieldLabel>
          {field.widget === "text" ? (
            <Input
              value={(value as string | undefined) ?? ""}
              onChange={(e) => setText(e.target.value)}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
            />
          ) : (
            <TextArea
              value={(value as string | undefined) ?? ""}
              onChange={(e) => setText(e.target.value)}
              maxLength={field.maxLength}
            />
          )}
          <FieldError>{error}</FieldError>
        </Field>
      );

    case "embed":
      return (
        <div className="flex flex-col gap-1.5">
          <Field name={path.join(".")} invalid={Boolean(error)}>
            <FieldLabel>{field.title}</FieldLabel>
            <Input
              value={(value as string | undefined) ?? ""}
              onChange={(e) => setText(e.target.value)}
              maxLength={field.maxLength}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <EmbedsAllowed />
        </div>
      );

    case "select":
      return (
        <Field name={path.join(".")} invalid={Boolean(error)}>
          <FieldLabel>{field.title}</FieldLabel>
          <Select
            items={field.options ?? []}
            value={(value as string | undefined) ?? ""}
            placeholder={t("editor.field.none")}
            clearable={!field.required && field.defaultValue === undefined}
            onValueChange={(next: string) => set(path, next === "" ? undefined : next)}
          />
          <FieldError>{error}</FieldError>
        </Field>
      );

    case "icon":
      return (
        <div className="flex flex-col gap-1.5">
          <IconPicker
            label={field.title}
            value={value as string | undefined}
            // The one icon field is the feature icons'; the type checker holds them to the registry.
            sections={featureIconSections()}
            clearable={!field.required && field.defaultValue === undefined}
            invalid={Boolean(error)}
            onChange={(next) => set(path, next)}
          />
          {error && <p className="text-body-sm text-txt-danger">{error}</p>}
        </div>
      );

    case "richtext":
      return (
        <div className="flex flex-col gap-2">
          <label htmlFor={id} className="text-label-md font-medium">
            {field.title}
          </label>
          <RichTextField id={id} value={value as RichText} onChange={(next) => set(path, next)} />
          {error && <p className="text-body-sm text-txt-danger">{error}</p>}
        </div>
      );

    case "toggle":
      return (
        <Field name={path.join(".")} disabled={disabled}>
          <FieldItem>
            <Checkbox
              checked={Boolean(value)}
              disabled={disabled}
              onCheckedChange={(checked) => set(path, checked)}
            />
            <FieldLabel>{field.title}</FieldLabel>
          </FieldItem>
        </Field>
      );

    case "page":
      return (
        <PageField
          field={field}
          value={value as string | undefined}
          error={error}
          onChange={(picked) => set(path, picked)}
        />
      );

    case "media":
      return (
        <MediaField
          title={field.title}
          value={value as { mediaId: string; alt?: string } | undefined}
          required={field.required}
          kind={field.mediaKind ?? "image"}
          error={error ?? issues.get([...path, "mediaId"].join("."))}
          onChange={(next) => set(path, next)}
        />
      );

    case "link":
    case "group": {
      const fields = field.fields ?? [];
      // A link with nothing filled in is no link at all.
      const setPart = (partPath: string[], next: unknown) => {
        const updated = setAt(value ?? {}, partPath.slice(path.length), next) as Record<
          string,
          unknown
        >;
        const empty = Object.values(updated).every((v) => v === undefined || v === "");
        set(path, empty && !field.required ? undefined : { label: "", href: "", ...updated });
      };
      return (
        <Fieldset className="bg-bg-washed gap-4 rounded-md p-3">
          <legend className="text-label-md float-left mb-1 w-full font-semibold">
            {field.title}
          </legend>
          <Fields
            fields={fields}
            value={value}
            path={path}
            issues={issues}
            set={field.widget === "link" ? setPart : set}
          />
        </Fieldset>
      );
    }

    case "list": {
      const items = (value as unknown[] | undefined) ?? [];
      const fields = field.fields ?? [];
      const max = field.maxItems ?? Infinity;
      const min = field.minItems ?? 0;
      const move = (from: number, to: number) => set(path, moveItem(items, from, to));
      const listId = path.join(".");
      const titles = items.map(itemTitle);
      // Each item as the panel names it, said aloud while it moves.
      const names = titles.map(
        (title, index) => t("editor.list.item", { n: index + 1 }) + (title ? ` · ${title}` : ""),
      );
      return (
        <Fieldset className="gap-3">
          <legend className="text-label-md float-left mb-1 w-full font-semibold">
            {field.title}
          </legend>
          {error && <p className="text-body-sm text-txt-danger">{error}</p>}
          {/* Reordered by dragging an item's grip, with the pointer or the keyboard. */}
          <SortableList ids={sortIds(listId, items.length)} names={names} onMove={move}>
            <ol className="flex flex-col gap-3">
              {items.map((item, index) => (
                // Items have no ids of their own; their position is their identity here.
                // oxlint-disable-next-line react/no-array-index-key
                <SortableItem key={index} id={sortId(listId, index)} name={names[index] ?? ""}>
                  {(handle) => (
                    <details
                      open={items.length <= 2 || undefined}
                      className="group/item flex flex-col"
                    >
                      <summary
                        className="focus-ring flex cursor-pointer list-none items-center gap-1 rounded-md p-2 pl-1"
                        // The grip and the actions button act; they don't open or close the item.
                        onClick={(event) => {
                          if ((event.target as Element).closest("button")) event.preventDefault();
                        }}
                      >
                        <span className="flex shrink-0">{handle}</span>
                        <span className="text-label-sm text-txt-black-700 line-clamp-2 min-w-0 flex-1 font-medium">
                          {t("editor.list.item", { n: index + 1 })}
                          {titles[index] && (
                            <span className="text-txt-black-900"> · {titles[index]}</span>
                          )}
                        </span>
                        <div className="shrink-0">
                          <Menu>
                            <MenuTrigger
                              render={
                                <Button
                                  variant="default-ghost"
                                  size="small"
                                  iconOnly
                                  aria-label={t("editor.list.actions", { n: index + 1 })}
                                />
                              }
                            >
                              <EllipsisVerticalIcon />
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem
                                variant="danger"
                                disabled={items.length <= min}
                                onClick={() => set(path, items.toSpliced(index, 1))}
                              >
                                <MenuItemIcon>
                                  <TrashIcon />
                                </MenuItemIcon>
                                {t("editor.list.remove", { n: index + 1 })}
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </div>
                      </summary>
                      <div className="px-3 pb-3">
                        <Fields
                          fields={fields}
                          value={item}
                          path={[...path, String(index)]}
                          issues={issues}
                          set={set}
                        />
                      </div>
                    </details>
                  )}
                </SortableItem>
              ))}
            </ol>
          </SortableList>
          <div>
            <Button
              variant="default-outline"
              size="small"
              disabled={items.length >= max}
              onClick={() => set(path, [...items, emptyItem(fields)])}
            >
              {t("editor.list.add")}
            </Button>
          </div>
        </Fieldset>
      );
    }
  }
}

/** A page from the tree: listing pages only, for a latest-entries block. */
function PageField({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldSpec;
  value: string | undefined;
  error: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const pages = usePages();
  const offered = (pages.data ?? []).filter(
    (p) => field.pageKind !== "listing" || p.kind === "listing",
  );
  return (
    <Field name={field.name} invalid={Boolean(error)}>
      <FieldLabel>{field.title}</FieldLabel>
      {field.pageKind === "listing" && offered.length === 0 && (
        <FieldDescription>{t("editor.field.noListings")}</FieldDescription>
      )}
      <PagePicker
        pages={offered}
        value={value ?? null}
        onValueChange={(id) => onChange(id ?? undefined)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** A list item that drags by its grip; `children` places the grip. */
function SortableItem({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { setNodeRef, style, dragging, handle } = useSortableRow(id, name);
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={clx("bg-bg-washed rounded-md", dragging && "shadow-card relative z-10")}
    >
      {children(handle)}
    </li>
  );
}
