/**
 * Your own account: the name history shows, your password, two-factor,
 * where you're signed in and the agents you've connected. Your role and MCP
 * access are set by an Admin, on Users; the super admin sets their own here.
 */
import { type AgentConnection, CONNECTION_DAYS, type Me } from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AuthField, AuthForm } from "@/auth/frame";
import { NewPasswordForm } from "@/auth/sign-in-screens";
import { RecoveryCodes, TwoFactorSetup } from "@/auth/two-factor";
import { SettingsRow, SettingsSection } from "@/components/blocks/settings-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SwitchSetting } from "@/components/switch-setting";
import { TwoFactorTag } from "@/components/two-factor-tag";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { CheckIcon } from "@/components/ui/icons/check";
import { Input, InputAddon } from "@/components/ui/input";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import {
  SummaryList,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { agentsApi, authApi, meQuery, roleLabels, useCan, useMe } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatAgo, formatDateTime } from "@/lib/pages";
import { useAction } from "@/lib/use-action";
import { useRun } from "@/lib/use-run";
import { Screen } from "@/components/screen";

/** Keeps the signed-in person in the cache up to date after a change to them. */
function useSetMe() {
  const queryClient = useQueryClient();
  return (me: Me) => queryClient.setQueryData(meQuery.queryKey, me);
}

export function AccountScreen() {
  const me = useMe();
  return (
    <Screen>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.account")}</PageHeaderTitle>
          <PageHeaderDescription>
            {t("account.intro", { username: me.username, role: t(roleLabels[me.role]) })}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      {/* One person's settings: a readable column, under a header that lines up with every screen's. */}
      <div className="gap-stack-lg flex max-w-3xl flex-col">
        <NameSection />
        <PasswordSection />
        <TwoFactorSection />
        <SessionsSection />
        <AgentsSection />
      </div>
    </Screen>
  );
}

function NameSection() {
  const me = useMe();
  const setMe = useSetMe();
  const [name, setName] = useState(me.displayName);
  const [saved, setSaved] = useState(false);
  const rename = useAction();
  return (
    <SettingsSection
      title={t("account.name")}
      description={t("account.name.description")}
      pending={rename.pending}
      saved={saved}
      error={rename.error}
      labels={{
        save: t("settings.save"),
        saving: t("settings.saving"),
        saved: t("settings.savedApplied"),
      }}
      onSave={() =>
        void rename.run(
          () => authApi.rename(name.trim()),
          (next) => {
            setMe(next);
            setSaved(true);
          },
        )
      }
    >
      <Field name="displayName" className="max-w-md">
        <FieldLabel>{t("auth.join.name")}</FieldLabel>
        <Input
          value={name}
          maxLength={80}
          autoComplete="name"
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
      </Field>
    </SettingsSection>
  );
}

function PasswordSection() {
  const { toast } = useToast();
  const change = useAction();
  // A new form after each change, so the fields start empty.
  const [round, setRound] = useState(0);
  return (
    <SettingsSection title={t("auth.password")} description={t("account.password.description")}>
      <div className="max-w-md">
        <NewPasswordForm
          key={round}
          current
          submit={t("account.password.submit")}
          pending={change.pending}
          error={change.error}
          onSubmit={(password, current) =>
            void change.run(
              () => authApi.password(password, current),
              () => {
                toast({ variant: "success", title: t("account.password.done") });
                setRound((n) => n + 1);
              },
            )
          }
        />
      </div>
    </SettingsSection>
  );
}

function TwoFactorSection() {
  const me = useMe();
  const setMe = useSetMe();
  const [setting, setSetting] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>();
  const regenerate = useAction();

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          {t("account.twoFactor")}
          <TwoFactorTag on={me.twoFactor} />
        </span>
      }
      description={me.twoFactor ? t("account.twoFactor.on") : t("account.twoFactor.off")}
    >
      <div className="max-w-md">
        {codes ? (
          <RecoveryCodes codes={codes} onContinue={() => setCodes(undefined)} />
        ) : me.twoFactor ? (
          <AuthForm
            submit={t("account.recovery.submit")}
            pending={regenerate.pending}
            error={regenerate.error}
            onSubmit={() =>
              void regenerate.run(
                () => authApi.recoveryCodes(code),
                (result) => {
                  setCodes(result.codes);
                  setCode("");
                },
              )
            }
          >
            <AuthField
              name="code"
              label={t("account.recovery.code")}
              hint={t("account.recovery.hint")}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value.replace(/\D/g, ""))}
            />
          </AuthForm>
        ) : setting ? (
          <TwoFactorSetup
            onDone={(next) => {
              setMe(next);
              setSetting(false);
            }}
          />
        ) : (
          <Button variant="primary-outline" onClick={() => setSetting(true)}>
            {t("account.twoFactor.setUp")}
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}

function SessionsSection() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions });
  return (
    <SettingsSection title={t("account.sessions")} description={t("account.sessions.description")}>
      <SummaryList>
        <SummaryListBody>
          {sessions.data?.map((session) => (
            <SummaryListRow key={session.id}>
              <SummaryListTerm>
                {session.browser && session.os
                  ? t("account.sessions.device", { browser: session.browser, os: session.os })
                  : session.browser || session.os || t("account.sessions.unknown")}
                {session.current && (
                  <span className="text-txt-black-500 font-normal">
                    {" "}
                    {t("account.sessions.this")}
                  </span>
                )}
              </SummaryListTerm>
              <SummaryListDetail>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-txt-black-700 tabular-nums">
                    {t("account.sessions.seen", {
                      when: formatDateTime(session.lastSeenAt),
                      ip: session.ip,
                    })}
                  </span>
                  {!session.current && (
                    <Button
                      variant="default-ghost"
                      size="small"
                      onClick={() =>
                        void authApi
                          .endSession(session.id)
                          .then(() => queryClient.invalidateQueries({ queryKey: ["sessions"] }))
                      }
                    >
                      {t("account.sessions.end")}
                    </Button>
                  )}
                </div>
              </SummaryListDetail>
            </SummaryListRow>
          ))}
        </SummaryListBody>
      </SummaryList>
    </SettingsSection>
  );
}

/** The edge between rows, as FTDS's SettingsRow draws it, for rows that aren't one. */
const rowEdge = "border-otl-gray-200 border-b py-3 first:pt-0 last:border-b-0 last:pb-0";

/**
 * Where an agent connects, as a field like Account's others: selected on
 * focus, with Copy in its edge. Without a clipboard, Copy selects it to copy
 * by hand, as the Users link dialog does.
 */
function AddressField() {
  const address = `${window.location.origin}/mcp`;
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () =>
    navigator.clipboard.writeText(address).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {
        input.current?.focus();
        input.current?.select();
      },
    );

  return (
    <div className={rowEdge}>
      <Field name="mcpAddress" className="max-w-md">
        <FieldLabel>{t("account.agents.address")}</FieldLabel>
        <FieldDescription>{t("account.agents.addressHint")}</FieldDescription>
        <Input
          ref={input}
          readOnly
          value={address}
          className="bg-bg-white"
          onFocus={(event) => event.target.select()}
          append={
            <InputAddon
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the addon's children
              render={<button type="button" onClick={() => void copy()} />}
              className="text-txt-black-900 hover:bg-bg-washed focus-ring cursor-pointer gap-1.5 rounded-r-md font-medium"
            >
              {copied && <CheckIcon className="text-txt-success size-4" aria-hidden />}
              {copied ? t("account.agents.copied") : t("account.agents.copy")}
            </InputAddon>
          }
        />
      </Field>
      {/* Says so to screen readers too, since the button's label change alone may go unread. */}
      <output className="sr-only">{copied ? t("account.agents.copiedStatus") : ""}</output>
    </div>
  );
}

/** Your MCP access, and the agents connected as you (docs/mcp.md). */
function AgentsSection() {
  const me = useMe();
  const setMe = useSetMe();
  const ownSwitch = useCan("security.manage");
  const run = useRun(["agents"]);
  const mine = useQuery({ queryKey: ["agents", "mine"], queryFn: agentsApi.mine });
  const live = mine.data?.filter((c) => c.status === "live") ?? [];
  // Turning off and ending a connection both ask first, as they do on Users and Agents.
  const [turningOff, setTurningOff] = useState(false);
  const [ending, setEnding] = useState<AgentConnection>();

  return (
    <SettingsSection
      // On or off beside the title, as Two-factor sign-in shows it.
      title={
        <span className="flex items-center gap-2">
          {t("account.agents")}
          {me.mcpEnabled ? (
            <Tag size="small" variant="success">
              {t("users.mcp.on")}
            </Tag>
          ) : (
            <Tag size="small">{t("users.mcp.off")}</Tag>
          )}
        </span>
      }
      description={t("account.agents.description", { days: CONNECTION_DAYS })}
    >
      <div>
        {ownSwitch ? (
          <SwitchSetting
            title={t("account.agents.switch")}
            description={t("account.agents.switchHint")}
            checked={me.mcpEnabled}
            onCheckedChange={(enabled) =>
              enabled
                ? void run(async () => setMe(await authApi.setMcpAccess(true)))
                : setTurningOff(true)
            }
          />
        ) : (
          !me.mcpEnabled && (
            <p className={`${rowEdge} text-body-sm text-txt-black-700`}>
              {t("account.agents.notOn")}
            </p>
          )
        )}
        {me.mcpEnabled && <AddressField />}
        {me.mcpEnabled && live.length === 0 && mine.isSuccess && (
          <p className={`${rowEdge} text-body-sm text-txt-black-700`}>{t("account.agents.none")}</p>
        )}
        {live.map((connection) => (
          <SettingsRow
            key={connection.id}
            as="div"
            title={connection.client}
            description={
              <span className="tabular-nums">
                {t("account.agents.seen", {
                  when: formatAgo(connection.lastUsedAt),
                  ends: formatDateTime(connection.expiresAt),
                })}
              </span>
            }
            control={
              <Button variant="default-outline" size="small" onClick={() => setEnding(connection)}>
                {t("account.agents.end")}
                <span className="sr-only"> {connection.client}</span>
              </Button>
            }
          />
        ))}
      </div>
      {turningOff && (
        <ConfirmDialog
          open
          onOpenChange={setTurningOff}
          title={t("account.agents.off.title")}
          description={t("account.agents.off.body")}
          confirm={t("account.agents.off")}
          destructive
          onConfirm={() =>
            void run(
              async () => setMe(await authApi.setMcpAccess(false)),
              t("account.agents.off.done"),
            )
          }
        />
      )}
      {ending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setEnding(undefined)}
          title={t("account.agents.end.title", { agent: ending.client })}
          description={t("account.agents.end.body")}
          confirm={t("account.agents.end")}
          destructive
          onConfirm={() =>
            void run(
              () => agentsApi.end(ending.id),
              t("account.agents.ended", { agent: ending.client }),
            )
          }
        />
      )}
    </SettingsSection>
  );
}
