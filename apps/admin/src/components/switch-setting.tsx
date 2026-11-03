/**
 * A setting that's a switch, in FTDS's SettingsRow: title and description on
 * the left, the switch on the right, hairlines between rows. The switch is
 * named by the title and described by the description.
 */
import { type ReactNode, useId } from "react";
import { SettingsRow } from "@/components/blocks/settings-layout";
import { Switch } from "@/components/ui/switch";

export function SwitchSetting({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <SettingsRow
      // A disabled row isn't a click target.
      as={disabled ? "div" : "label"}
      title={title}
      description={description && <span id={id}>{description}</span>}
      control={
        <Switch
          aria-label={title}
          aria-describedby={description ? id : undefined}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          // Off and disabled, the track is Well on a Well section: an edge keeps it visible.
          className="data-[disabled]:ring-otl-gray-300 data-[disabled]:ring-1 data-[disabled]:ring-inset"
        />
      }
    />
  );
}
