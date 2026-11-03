/** People as the Users pages show and pick them: avatar, name, the person filter. */
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** Up to two letters for the avatar: first and last word of the name. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words.at(-1)![0] : "";
  return (first + last).toUpperCase();
}

/** Decorative: the name always sits beside it in words. */
export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar size="small" aria-hidden className={className}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** A table's person cell: avatar, name, and what's under the name (a username, a role). */
export function PersonCell({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={clx("flex min-w-0 items-center gap-3", className)}>
      <PersonAvatar name={name} />
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="text-txt-black-900 max-w-full truncate font-medium">{name}</span>
        {children}
      </div>
    </div>
  );
}

/** "Anyone" in a filter, written into nothing in the address. */
export const ANY = "any";

/** The person filter the Agents screen and the Audit log share. */
export function PersonFilter({
  name,
  people,
  value,
  onChange,
  hideLabel = false,
}: {
  name: string;
  people: { id: string; displayName: string }[];
  value: string | undefined;
  onChange: (userId: string) => void;
  /** Beside a heading, where the label would crowd it; screen readers still hear it. */
  hideLabel?: boolean;
}) {
  return (
    <Field name={name} className="w-56">
      <FieldLabel className={clx(hideLabel && "sr-only")}>{t("audit.filter.person")}</FieldLabel>
      <Select
        items={[
          { value: ANY, label: t("audit.filter.anyone") },
          ...people.map((p) => ({ value: p.id, label: p.displayName })),
        ]}
        value={value ?? ANY}
        onValueChange={onChange}
      />
    </Field>
  );
}
