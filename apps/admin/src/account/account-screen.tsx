/**
 * Your own account: the name history shows, your password, two-factor and
 * where you're signed in. Your role is set by an Admin, on Users.
 */
import type { Me } from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AuthField, AuthForm } from "@/auth/frame";
import { NewPasswordForm } from "@/auth/sign-in-screens";
import { RecoveryCodes, TwoFactorSetup } from "@/auth/two-factor";
import { SettingsSection } from "@/components/blocks/settings-layout";
import { TwoFactorTag } from "@/components/two-factor-tag";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { t } from "@/i18n";
import { authApi, meQuery, roleLabels, useMe } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatDateTime } from "@/lib/pages";
import { useAction } from "@/lib/use-action";

/** Keeps the signed-in person in the cache up to date after a change to them. */
function useSetMe() {
  const queryClient = useQueryClient();
  return (me: Me) => queryClient.setQueryData(meQuery.queryKey, me);
}

export function AccountScreen() {
  const me = useMe();
  return (
    <div className="p-surface gap-stack-lg mx-auto flex max-w-3xl flex-col">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.account")}</PageHeaderTitle>
          <PageHeaderDescription>
            {t("account.intro", { username: me.username, role: t(roleLabels[me.role]) })}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <NameSection />
      <PasswordSection />
      <TwoFactorSection />
      <SessionsSection />
    </div>
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
