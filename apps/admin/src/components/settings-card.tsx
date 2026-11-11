/**
 * The admin's settings frame, for Settings and Account: a section index on the
 * left (a row that scrolls sideways on narrow screens), white bordered section
 * cards, and a save bar that rises only while a section has unsaved changes.
 * Admin-owned rather than FTDS's SettingsLayout, which stays as the registry ships it.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { StatusDot } from "@/components/page-status";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";
import { scrollToTop } from "@/lib/scroll";

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  /** Read after the label and shown as a dot, such as "Saved, not live yet". */
  mark?: string;
};

/** The index beside the cards, and the cards. */
export function SettingsColumns({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="gap-stack-lg grid items-start md:grid-cols-[13rem_minmax(0,1fr)]">
      {nav}
      <div className="gap-stack-lg flex min-w-0 flex-col">{children}</div>
    </div>
  );
}

export function SettingsNav({
  label,
  items,
  current,
  kind,
  onSelect,
}: {
  label: string;
  items: SettingsNavItem[];
  current: string | undefined;
  /** `page` when each item is its own view; `location` when it's a place on one page. */
  kind: "page" | "location";
  /** The link's own navigation is stopped: move to the section here. */
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label={label} className="min-w-0 md:sticky md:top-4">
      <ul className="m-0 flex list-none gap-0.5 overflow-x-auto p-0 md:flex-col md:overflow-visible">
        {items.map((item) => {
          const active = item.id === current;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={item.href}
                aria-current={active ? kind : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(item.id);
                }}
                className={clx(
                  "text-body-sm focus-ring flex items-center gap-2.5 rounded-md px-2.5 py-1.5 whitespace-nowrap no-underline transition-colors duration-150 ease-out motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0",
                  active
                    ? "bg-bg-primary-50 text-txt-primary font-medium"
                    : "text-txt-black-700 hover:bg-bg-washed hover:text-txt-black-900",
                )}
              >
                <span aria-hidden className="hidden md:contents">
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.mark && (
                  <>
                    <StatusDot tone="warning" className="size-1.5" />
                    <span className="sr-only">, {item.mark}</span>
                  </>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** One group of settings: its title, what it's for, where a change goes, then the fields. */
export function SettingsCard({
  id,
  title,
  description,
  aside,
  children,
}: {
  /** The anchor an index links to. */
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Beside the title: a tag saying when a change applies, or what was just saved. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `${id ?? "settings"}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="border-otl-gray-200 bg-bg-white scroll-mt-4 rounded-lg border p-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={titleId} className="text-title text-txt-black-900 font-semibold">
            {title}
          </h2>
          {description && (
            <p className="text-body-sm text-txt-black-700 max-w-prose">{description}</p>
          )}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </header>
      <div className="gap-stack-md flex flex-col">{children}</div>
    </section>
  );
}

/** A section's form: its fields, and the save bar while it has unsaved changes. */
export function SettingsForm({
  dirty,
  pending,
  error,
  section,
  onSave,
  onDiscard,
  children,
}: {
  dirty: boolean;
  pending: boolean;
  error?: ReactNode;
  /** The section's name, for the bar: "Unsaved changes to Identity". */
  section: string;
  onSave: () => void;
  onDiscard?: () => void;
  children: ReactNode;
}) {
  const shown = dirty || pending || Boolean(error);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="gap-stack-md flex flex-col"
    >
      {children}
      {shown && (
        // Rises into view and stays at the bottom of the screen while the section is in view.
        <div className="animate-in fade-in slide-in-from-bottom-2 sticky bottom-4 z-10 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none">
          <div className="bg-bg-white border-otl-gray-200 shadow-card flex flex-wrap items-center gap-3 rounded-xl border py-2.5 pr-2.5 pl-4">
            <p
              className={clx(
                "text-body-sm m-0 flex min-w-0 flex-1 items-center gap-1.5",
                error ? "text-txt-danger" : "text-txt-black-900",
              )}
            >
              {error && <WarningCircleIcon aria-hidden className="size-4 shrink-0" />}
              {error ?? t("settings.bar.unsaved", { section })}
            </p>
            {onDiscard && (
              <Button
                type="button"
                variant="default-ghost"
                size="small"
                disabled={pending}
                onClick={onDiscard}
              >
                {t("settings.bar.discard")}
              </Button>
            )}
            <Button type="submit" variant="primary-fill" size="small" disabled={pending}>
              {pending ? t("settings.saving") : t("settings.save")}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

/** What was just saved, beside a card's title; announced, and gone once the form changes again. */
export function SavedNote({ children }: { children: ReactNode }) {
  return (
    <output className="text-body-sm text-txt-success flex items-center gap-1.5 whitespace-nowrap">
      <CheckCircleIcon aria-hidden className="size-4 shrink-0" />
      {children}
    </output>
  );
}

/**
 * The section in view on a page of cards: the last one whose top has reached the
 * top of the main area. A jump from the index stays current until the scroll ends.
 */
export function useScrollSpy(ids: string[]) {
  const [current, setCurrent] = useState(ids[0]);
  const pinned = useRef(false);
  const key = ids.join(" ");

  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    const list = key.split(" ");
    const spy = () => {
      if (pinned.current) return;
      const line = main.getBoundingClientRect().top + 32;
      let found = list[0];
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) found = id;
      }
      // At the end of the page the last sections can't reach the top: the last one is current.
      if (main.scrollTop > 0 && main.scrollTop + main.clientHeight >= main.scrollHeight - 2) {
        found = list.at(-1);
      }
      setCurrent(found);
    };
    const release = () => {
      pinned.current = false;
    };
    spy();
    main.addEventListener("scroll", spy, { passive: true });
    main.addEventListener("scrollend", release);
    main.addEventListener("wheel", release, { passive: true });
    main.addEventListener("touchstart", release, { passive: true });
    return () => {
      main.removeEventListener("scroll", spy);
      main.removeEventListener("scrollend", release);
      main.removeEventListener("wheel", release);
      main.removeEventListener("touchstart", release);
    };
  }, [key]);

  const jump = (id: string) => {
    setCurrent(id);
    pinned.current = true;
    scrollToTop(document.getElementById(id), { smooth: true });
  };

  return { current, jump };
}
