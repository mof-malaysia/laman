/** The layout the page drawer's tabs share: white cards on the grey canvas. */
import { type ReactNode, useId } from "react";
import { card } from "@/components/card";
import { clx } from "@/lib/ftds/utils";

/** The admin's card, rounded like the Pages index's. */
export const tabCard = clx(card, "rounded-2xl");

/** A white card: an optional title and its content. */
export function Panel({
  title,
  aside,
  children,
}: {
  title?: string;
  /** Beside the title, at the right: a unit or a small action. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={clx(tabCard, "border-otl-gray-200")}
    >
      {title && (
        <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
          <h2 id={id} className="text-label-sm text-txt-black-900 font-semibold">
            {title}
          </h2>
          {aside}
        </div>
      )}
      <div className={`@container flex flex-col gap-4 px-5 pb-5 ${title ? "pt-3" : "pt-5"}`}>
        {children}
      </div>
    </section>
  );
}

/** One part of a form: its title and hint on the left, its fields on the right. */
export function FormRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset
      aria-labelledby={id}
      className="border-otl-gray-200 m-0 grid min-w-0 gap-3 border-0 border-t px-0 py-5 first:border-t-0 first:pt-0 last:pb-0 @xl:grid-cols-[14rem_minmax(0,1fr)] @xl:gap-6"
    >
      <div className="flex flex-col gap-0.5">
        {/* The type of FTDS's SettingsRow, as on the Settings tab. */}
        <h3 id={id} className="text-content text-txt-black-900 font-medium">
          {title}
        </h3>
        {description && <p className="text-content text-txt-black-700">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </fieldset>
  );
}
