import { type ReactNode, useId } from "react";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Radio, RadioButton } from "@/components/ui/radio";
import { clx } from "@/lib/ftds/utils";

/**
 * Choices as cards, on the FTDS radio group, so the arrow keys move between them. Each
 * card is its radio's label; `content` draws it, told whether it's the one picked.
 */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  className,
  cardClassName,
  idleClassName,
  checkedMark,
  describedBy,
  disabled = false,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; content: ReactNode }[];
  onChange: (value: T) => void;
  /** The cards' grid. */
  className: string;
  /** Each card's shape. */
  cardClassName: string;
  /** A card that isn't picked. */
  idleClassName: string;
  /** Drawn on the picked card too, such as a tick. */
  checkedMark?: ReactNode;
  describedBy?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Fieldset
      render={
        <Radio
          value={value}
          onValueChange={(next) => onChange(next as T)}
          aria-describedby={describedBy}
          disabled={disabled}
          className="flex flex-col gap-2"
        />
      }
    >
      <FieldsetLegend className="font-body text-label-sm mb-2 font-medium">{legend}</FieldsetLegend>
      <div className={className}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              htmlFor={`${id}-${option.value}`}
              title={option.label}
              className={clx(
                "relative flex border transition-[color,background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "has-[:focus-visible]:ring-fr-primary has-[:focus-visible]:ring",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                cardClassName,
                checked
                  ? "border-otl-primary-300 bg-bg-primary-50 text-txt-primary"
                  : idleClassName,
              )}
            >
              <RadioButton
                id={`${id}-${option.value}`}
                value={option.value}
                aria-label={option.label}
                className="sr-only"
              />
              {option.content}
              {checked && checkedMark}
            </label>
          );
        })}
      </div>
    </Fieldset>
  );
}
