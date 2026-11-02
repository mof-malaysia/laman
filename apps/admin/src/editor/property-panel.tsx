/**
 * The right panel: the selected block's fields, generated from its schema in
 * the block registry (`blockFields`), or the page's own settings when no block
 * is selected. Problems are the schema's own messages, shown on the field.
 */
import {
  type Block,
  type FieldSpec,
  type RichText,
  Block as BlockSchema,
  blockDefinition,
  blockFields,
} from "@fiscal-sb/blocks";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { PagePicker } from "@/components/page-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset } from "@/components/ui/fieldset";
import { ArrowDownIcon } from "@/components/ui/icons/arrow-down";
import { ArrowUpIcon } from "@/components/ui/icons/arrow-up";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { EllipsisVerticalIcon } from "@/components/ui/icons/ellipsis-vertical";
import { TrashIcon } from "@/components/ui/icons/trash";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { type MessageKey, t } from "@/i18n";
import { usePages } from "@/lib/pages";
import { MediaField } from "./media-field";
import { RichTextField } from "./rich-text-field";
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

/** A list item's own title, for its collapsed row. */
const itemTitle = (item: unknown) => {
  const value = (item as Record<string, unknown> | undefined) ?? {};
  const title = value.title ?? value.label ?? value.question;
  return typeof title === "string" ? title : "";
};

/** A new, empty list item: required text fields start empty, the rest unset. */
const emptyItem = (fields: FieldSpec[]) =>
  Object.fromEntries(
    fields.filter((f) => f.required && f.widget === "text").map((f) => [f.name, ""]),
  );

type PropertyPanelProps = {
  block: Block;
  onChange: (props: Block["props"], key: string) => void;
  onRemove: () => void;
};

export function PropertyPanel({ block, onChange, onRemove }: PropertyPanelProps) {
  const definition = blockDefinition(block.type);
  const issues = issuesOf(block);
  const set = (path: string[], value: unknown) =>
    onChange(setAt(block.props, path, value) as Block["props"], path.join("."));

  const fields = blockFields(block.type);
  const inline = fields.some((f) => f.inline);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-title font-semibold">{definition.label}</h2>
        <p className="text-body-sm text-txt-black-700">{definition.description}</p>
        {/* Said once here, not under every field it applies to. */}
        {inline && (
          <p className="bg-bg-primary-50 text-body-sm text-txt-black-900 mt-2 rounded-md px-3 py-2">
            {t("editor.field.inlineOnce")}
          </p>
        )}
      </div>
      {fieldGroups(fields).map(([group, list]) => (
        <details key={group} open className="group/section border-otl-gray-200 border-t">
          <summary className="focus-ring-inset hover:bg-bg-washed flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <h3 className="text-label-md text-txt-black-900 font-semibold">{t(group)}</h3>
            <ChevronDownIcon
              aria-hidden
              className="text-txt-black-500 size-4 transition-transform group-open/section:rotate-180"
            />
          </summary>
          <div className="px-4 pb-5">
            <Fields fields={list} value={block.props} path={[]} issues={issues} set={set} />
          </div>
        </details>
      ))}
      {/* Away from the title, so it isn't hit by accident. */}
      <div className="border-otl-gray-200 border-t p-4">
        <Button variant="danger-outline" size="small" onClick={onRemove}>
          <TrashIcon /> {t("editor.block.remove", { block: definition.label })}
        </Button>
      </div>
    </div>
  );
}

/** Content first, then links styled as buttons, then how the block looks. */
const groupOf = (field: FieldSpec): MessageKey =>
  field.widget === "select" && field.name === "width"
    ? "editor.fields.appearance"
    : field.widget === "select"
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
  value: unknown;
  path: string[];
  issues: Issues;
  set: (path: string[], value: unknown) => void;
};

function Fields({ fields, value, path, issues, set }: FieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldEditor
          key={field.name}
          field={field}
          value={value}
          path={[...path, field.name]}
          issues={issues}
          set={set}
        />
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
};

function FieldEditor({ field, value: parent, path, issues, set }: FieldEditorProps) {
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

    case "select":
      return (
        <Field name={path.join(".")} invalid={Boolean(error)}>
          <FieldLabel>{field.title}</FieldLabel>
          <Select
            items={field.options ?? []}
            value={(value as string | undefined) ?? ""}
            placeholder={t("editor.field.none")}
            clearable={!field.required}
            onValueChange={(next: string) => set(path, next === "" ? undefined : next)}
          />
          <FieldError>{error}</FieldError>
        </Field>
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
        <Field name={path.join(".")}>
          <FieldItem>
            <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => set(path, checked)} />
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
      const move = (from: number, to: number) => {
        const moved = items[from];
        set(path, items.toSpliced(from, 1).toSpliced(to, 0, moved));
      };
      return (
        <Fieldset className="gap-3">
          <legend className="text-label-md float-left mb-1 w-full font-semibold">
            {field.title}
          </legend>
          {error && <p className="text-body-sm text-txt-danger">{error}</p>}
          <ol className="flex flex-col gap-3">
            {items.map((item, index) => (
              // Items have no ids of their own; their position is their identity here.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index} className="bg-bg-washed rounded-md">
                <details open={items.length <= 2 || undefined} className="group/item flex flex-col">
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-2 rounded-md p-2">
                    <span className="text-label-sm text-txt-black-700 line-clamp-2 min-w-0 font-medium">
                      {t("editor.list.item", { n: index + 1 })}
                      {itemTitle(item) && (
                        <span className="text-txt-black-900"> · {itemTitle(item)}</span>
                      )}
                    </span>
                    {/* The buttons act; they don't open or close the item. */}
                    {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <div className="shrink-0" onClick={(event) => event.preventDefault()}>
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
                          <MenuItem disabled={index === 0} onClick={() => move(index, index - 1)}>
                            <MenuItemIcon>
                              <ArrowUpIcon />
                            </MenuItemIcon>
                            {t("editor.block.up")}
                          </MenuItem>
                          <MenuItem
                            disabled={index === items.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <MenuItemIcon>
                              <ArrowDownIcon />
                            </MenuItemIcon>
                            {t("editor.block.down")}
                          </MenuItem>
                          <MenuSeparator />
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
              </li>
            ))}
          </ol>
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
