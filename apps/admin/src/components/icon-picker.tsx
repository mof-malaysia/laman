/**
 * The icon picker, for every icon choice in the admin: a field-like trigger showing the
 * chosen icon and its name, which opens a popover beside it of small icon-only cards, one
 * per icon, each named in its tooltip: None first when the field may be empty, then the
 * icons under their group titles, scrolling when they don't fit. Clicking
 * a card shows it in the trigger and closes the popover. The cards are FTDS radios: the
 * arrow keys move the choice, and Enter or Escape closes.
 */
import { type FunctionComponent, type SVGProps, useId, useRef, useState } from "react";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { ChevronDownIcon } from "@/components/ui/icons/chevron-down";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Radio, RadioButton } from "@/components/ui/radio";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

export type IconOption<T extends string> = {
  value: T;
  label: string;
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
};

/** A titled run of cards in the popover. */
export type IconSection<T extends string> = { label: string; options: IconOption<T>[] };

/** None's value among the radios: a radio needs a string. */
const NONE = "";

export function IconPicker<T extends string>({
  label,
  value,
  sections,
  onChange,
  clearable = true,
  side = "left",
  invalid = false,
}: {
  label: string;
  value: T | undefined;
  /** The icons, under their titles; build them once (see `featureIconSections`). */
  sections: IconSection<T>[];
  onChange: (value: T | undefined) => void;
  /** Offers None, for a field that may be empty. */
  clearable?: boolean;
  /** Where the popover opens; it flips when there's no room. */
  side?: "left" | "right" | "bottom";
  invalid?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const cards = useRef<HTMLDivElement>(null);
  const chosen =
    value === undefined
      ? undefined
      : sections.flatMap((section) => section.options).find((o) => o.value === value);
  const ChosenIcon = chosen?.icon ?? NoIcon;

  const card = (option: { value: string; label: string; icon: IconOption<T>["icon"] }) => {
    const on = option.value === (value ?? NONE);
    const Icon = option.icon;
    return (
      <label
        key={option.value}
        htmlFor={`${id}-${option.value || "none"}`}
        title={option.label}
        className={clx(
          "grid size-9 cursor-pointer place-items-center rounded-md border transition-colors duration-150 motion-reduce:transition-none",
          "has-[:focus-visible]:ring-fr-primary has-[:focus-visible]:ring",
          on
            ? "border-otl-primary-300 bg-bg-primary-50 text-txt-primary"
            : "border-otl-gray-200 bg-bg-white text-txt-black-700 hover:bg-bg-washed hover:text-txt-black-900",
        )}
      >
        <RadioButton
          id={`${id}-${option.value || "none"}`}
          value={option.value}
          aria-label={option.label}
          className="sr-only"
          onKeyDown={(event) => {
            if (event.key === "Enter") setOpen(false);
          }}
        />
        <Icon aria-hidden className="size-4" />
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="font-body text-label-md text-txt-black-900 font-medium">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-labelledby={`${id}-label ${id}-value`}
          data-invalid={invalid || undefined}
          className={clx(
            // The look of FTDS's Select trigger, so it sits among the other fields.
            "group control-sm text-field-sm font-body text-txt-black-900 bg-bg-white border-otl-control hover:border-otl-control-hover flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border text-left outline-none select-none",
            "focus-visible:ring-fr-primary focus-visible:border-otl-primary-300 data-[popup-open]:border-otl-primary-300 transition-colors duration-150 focus-visible:ring motion-reduce:transition-none",
            "data-[invalid]:border-bg-danger-600",
          )}
        >
          <ChosenIcon
            aria-hidden
            className={clx("size-4 shrink-0", chosen ? "text-txt-black-900" : "text-txt-black-500")}
          />
          <span
            id={`${id}-value`}
            className={clx("min-w-0 flex-1 truncate", !chosen && "text-txt-black-500")}
          >
            {chosen?.label ?? t("editor.field.none")}
          </span>
          <ChevronDownIcon
            aria-hidden
            className="text-txt-black-700 size-4 shrink-0 transition-transform duration-200 group-data-[popup-open]:rotate-180 motion-reduce:transition-none"
          />
        </PopoverTrigger>
        <PopoverContent
          side={side}
          align="start"
          sideOffset={8}
          className="w-auto p-0"
          // A click on a card picks it and closes, the chosen one included; the arrow keys
          // only move the choice, so the popover stays open while they do (Enter closes).
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("label")) setOpen(false);
          }}
          // Opens on the chosen card, so the arrow keys start from there.
          initialFocus={() =>
            cards.current?.querySelector<HTMLElement>("[data-checked]") ??
            cards.current?.querySelector<HTMLElement>("[role=radio]") ??
            true
          }
        >
          <Fieldset
            render={
              <Radio
                value={value ?? NONE}
                onValueChange={(next) => onChange(next === NONE ? undefined : (next as T))}
              />
            }
          >
            <FieldsetLegend className="sr-only">{label}</FieldsetLegend>
            {/* Scrolls inside the popover; each group's title stays in view over its icons. */}
            <div
              ref={cards}
              className="flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain px-2 pb-2"
            >
              {clearable && (
                <div className="grid grid-cols-6 gap-1 pt-2">
                  {card({ value: NONE, label: t("editor.field.none"), icon: NoIcon })}
                </div>
              )}
              {sections.map((section) => (
                <fieldset key={section.label} className="m-0 min-w-0 border-0 p-0">
                  <legend className="text-label-compact text-txt-black-500 bg-bg-dialog sticky top-0 z-10 float-left w-full py-1 font-medium">
                    {section.label}
                  </legend>
                  <div className="clear-both grid grid-cols-6 gap-1">
                    {section.options.map(card)}
                  </div>
                </fieldset>
              ))}
            </div>
          </Fieldset>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** No icon: a circle struck through, drawn like the FTDS icons. */
function NoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path
        d="M4.87 4.87l10.26 10.26M17.25 10a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
