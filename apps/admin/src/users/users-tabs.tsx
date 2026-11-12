/**
 * The Users area's header: its title, its pages (Accounts, Agents, API
 * tokens and the Audit log) and Help for Admins. The pages are routes, not panels, so the
 * tabs are links drawn as FTDS tabs: the router marks the current one
 * (aria-current), and the browser's back button works.
 */
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { tabs_indicator_cva, tabs_list_cva, tabs_trigger_cva } from "@/components/ui/tabs.variants";
import { type MessageKey, t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** The Users area's pages, in tab order. The shell's breadcrumb names the ones below `/users` from this. */
export const usersPages = [
  { to: "/users", label: "users.tab.accounts" },
  { to: "/users/agents", label: "users.agents" },
  { to: "/users/tokens", label: "users.tokens" },
  { to: "/users/audit", label: "users.audit" },
] as const satisfies readonly { to: string; label: MessageKey }[];

/** What Admins most often need to do, in the order they tend to need it. */
const questions = [
  ["users.help.add.q", "users.help.add.a"],
  ["users.help.password.q", "users.help.password.a"],
  ["users.help.phone.q", "users.help.phone.a"],
  ["users.help.leaver.q", "users.help.leaver.a"],
  ["users.help.role.q", "users.help.role.a"],
  ["users.help.roleChange.q", "users.help.roleChange.a"],
  ["users.help.expired.q", "users.help.expired.a"],
  ["users.help.inactive.q", "users.help.inactive.a"],
  ["users.help.suspicious.q", "users.help.suspicious.a"],
  ["users.help.agents.q", "users.help.agents.a"],
  ["users.help.tokens.q", "users.help.tokens.a"],
  ["users.superAdmin.question", "users.superAdmin.note"],
] as const satisfies readonly [MessageKey, MessageKey][];

/** The same title and tabs on every Users page; each page brings its own description and actions. */
export function UsersHeader({
  description,
  actions,
}: {
  description: ReactNode;
  actions?: ReactNode;
}) {
  const [helping, setHelping] = useState(false);
  return (
    <div className="gap-stack-md flex flex-col">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.users")}</PageHeaderTitle>
          <PageHeaderDescription>{description}</PageHeaderDescription>
        </PageHeaderContent>
        {actions && <PageHeaderActions>{actions}</PageHeaderActions>}
      </PageHeader>
      {/* The Hairline runs under the tabs and the Help button alike. */}
      <div className={clx(tabs_list_cva({ width: "full" }), "items-center")}>
        <nav aria-label={t("nav.users")} className="flex items-stretch gap-1">
          {usersPages.map((page) => (
            <Link
              key={page.to}
              to={page.to}
              // The Agents filter is in the search; the tab is still the current one.
              activeOptions={{ exact: true, includeSearch: false }}
              className={tabs_trigger_cva({
                size: "medium",
                className: "aria-[current=page]:text-txt-black-900 no-underline",
              })}
            >
              {({ isActive }) => (
                <>
                  {t(page.label)}
                  {/* Static, so it cancels the moving indicator's position variables. */}
                  {isActive && (
                    <span
                      aria-hidden
                      className={clx(tabs_indicator_cva(), "w-full translate-x-0")}
                    />
                  )}
                </>
              )}
            </Link>
          ))}
        </nav>
        <Button
          variant="default-ghost"
          size="small"
          className="mb-1 ml-auto shrink-0"
          aria-haspopup="dialog"
          onClick={() => setHelping(true)}
        >
          <QuestionCircleIcon aria-hidden className="size-4" />
          {t("users.help")}
        </Button>
      </div>
      <UsersHelp open={helping} onOpenChange={setHelping} />
    </div>
  );
}

function UsersHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer side="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{t("users.help.title")}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <ul className="divide-otl-gray-200 m-0 flex list-none flex-col divide-y p-0">
            {questions.map(([question, answer]) => (
              <li key={question} className="py-3 first:pt-0">
                <Details>
                  <DetailsTrigger>{t(question)}</DetailsTrigger>
                  <DetailsContent>
                    <p className="text-body-sm text-txt-black-700 m-0">{t(answer)}</p>
                  </DetailsContent>
                </Details>
              </li>
            ))}
          </ul>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
