/**
 * Off-site copies, for the super admin: where each backup is copied off the
 * server (an S3-compatible bucket or an Azure container), whether copies are
 * encrypted first, and whether the builder deletes old ones itself. Secrets
 * are write-only: the server says only whether one is saved. Applies on save.
 */
import {
  type OffsiteProvider,
  type OffsiteSettings,
  type OffsiteSettingsSave,
  type OffsiteTestResult,
  needsEndpoint,
  needsRegion,
} from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { SavedNote, SettingsCard, SettingsForm } from "@/components/settings-card";
import { SwitchSetting } from "@/components/switch-setting";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CrossCircleIcon } from "@/components/ui/icons/cross-circle";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { apiError, siteApi } from "@/lib/api";

const providers: OffsiteProvider[] = ["aws", "r2", "wasabi", "minio", "s3", "azure"];

type Fields = Omit<OffsiteSettingsSave, "secret" | "passphrase">;

const fieldsOf = (settings: OffsiteSettings): Fields => ({
  enabled: settings.enabled,
  provider: settings.provider,
  endpoint: settings.endpoint,
  region: settings.region,
  bucket: settings.bucket,
  prefix: settings.prefix,
  accessKeyId: settings.accessKeyId,
  pathStyle: settings.pathStyle,
  prune: settings.prune,
  encrypt: settings.encrypt,
});

export function OffsiteCard({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const query = useQuery({ queryKey: ["offsite"], queryFn: siteApi.offsite });
  // Kept here: the form remounts with what was saved, and still says so.
  const [saved, setSaved] = useState(false);
  if (!query.data)
    return (
      <SettingsCard title={t("settings.offsite")}>
        {query.isError ? (
          <Callout variant="danger">
            <CalloutTitle>{t("settings.offsite.loadFailed")}</CalloutTitle>
          </Callout>
        ) : (
          <Skeleton className="h-32 w-full rounded-lg" />
        )}
      </SettingsCard>
    );
  // Remounted on each save, so the form starts from what was saved.
  return (
    <OffsiteForm
      key={JSON.stringify(query.data)}
      settings={query.data}
      saved={saved}
      onSaved={setSaved}
      onDirtyChange={onDirtyChange}
    />
  );
}

function OffsiteForm({
  settings,
  saved,
  onSaved,
  onDirtyChange,
}: {
  settings: OffsiteSettings;
  /** Just saved: says so beside the title until the form changes. */
  saved: boolean;
  onSaved: (saved: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<Fields>(fieldsOf(settings));
  const [secret, setSecret] = useState("");
  // A new passphrase: asked for when encryption goes on without one, or to change it.
  const [changingPassphrase, setChangingPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [keptElsewhere, setKeptElsewhere] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>();
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<OffsiteTestResult | { ok: false; error: string }>();

  const askPassphrase = value.encrypt && (changingPassphrase || !settings.passphraseFingerprint);
  const dirty =
    JSON.stringify(value) !== JSON.stringify(fieldsOf(settings)) ||
    Boolean(secret) ||
    Boolean(askPassphrase && passphrase);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (update: Partial<Fields>) => {
    setValue((current) => ({ ...current, ...update }));
    onSaved(false);
    setTested(undefined);
  };
  const azure = value.provider === "azure";
  const disabled = !settings.canSave;

  const body = (): OffsiteSettingsSave => ({
    ...value,
    secret: secret.trim() || undefined,
    passphrase: askPassphrase && passphrase ? passphrase : undefined,
  });

  /** What the server can't check: the passphrase typed twice, and kept somewhere else. */
  function localIssues() {
    const found = new Map<string, string>();
    if (!askPassphrase) return found;
    if (passphrase.length < 12) found.set("passphrase", t("settings.offsite.passphrase.short"));
    else if (passphrase !== confirm)
      found.set("confirm", t("settings.offsite.passphrase.mismatch"));
    if (!keptElsewhere) found.set("keptElsewhere", t("settings.offsite.passphrase.keepFirst"));
    return found;
  }

  const save = async () => {
    const found = localIssues();
    setIssues(found);
    if (found.size) return setError(t("settings.fixFields"));
    setPending(true);
    setError(undefined);
    try {
      const next = await siteApi.saveOffsite(body());
      onSaved(true);
      queryClient.setQueryData(["offsite"], next);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    } catch (caught) {
      const problem = await apiError(caught);
      setIssues(new Map(problem?.details?.map((d) => [d.path, d.message]) ?? []));
      setError(
        problem?.code === "validation_error"
          ? t("settings.fixFields")
          : (problem?.message ?? t("common.tryAgain")),
      );
    } finally {
      setPending(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTested(undefined);
    try {
      setTested(await siteApi.testOffsite(body()));
    } catch (caught) {
      const problem = await apiError(caught);
      if (problem?.details) setIssues(new Map(problem.details.map((d) => [d.path, d.message])));
      setTested({
        ok: false,
        error:
          problem?.code === "validation_error"
            ? t("settings.fixFields")
            : (problem?.message ?? t("common.tryAgain")),
      });
    } finally {
      setTesting(false);
    }
  };

  const text = (
    key: keyof Fields & string,
    label: MessageKey,
    hint?: ReactNode,
    extra: { placeholder?: string; optional?: boolean; narrow?: boolean } = {},
  ) => (
    <Field key={key} name={key} invalid={Boolean(issues.get(key))} disabled={disabled}>
      <FieldLabel>
        {t(label)}
        {extra.optional && (
          <>
            {" "}
            <span className="text-txt-black-500 font-normal">{t("settings.offsite.optional")}</span>
          </>
        )}
      </FieldLabel>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <Input
        className={extra.narrow ? "sm:max-w-64" : undefined}
        value={value[key] as string}
        placeholder={extra.placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Fields>)}
      />
      <FieldError>{issues.get(key)}</FieldError>
    </Field>
  );

  return (
    <SettingsCard
      title={t("settings.offsite")}
      description={t("settings.offsite.description")}
      aside={
        saved && !dirty ? (
          <SavedNote>{t("settings.savedApplied")}</SavedNote>
        ) : (
          <Tag size="small" variant="primary">
            {t("settings.applies.save")}
          </Tag>
        )
      }
    >
      {!settings.canSave && (
        <Callout variant="warning">
          <CalloutTitle>{t("settings.offsite.noKey")}</CalloutTitle>
          <CalloutContent>{t("settings.offsite.noKeyHint")}</CalloutContent>
        </Callout>
      )}
      <SettingsForm
        dirty={dirty}
        pending={pending}
        error={error}
        section={t("settings.offsite")}
        onSave={() => void save()}
        onDiscard={() => {
          setValue(fieldsOf(settings));
          setSecret("");
          setPassphrase("");
          setConfirm("");
          setChangingPassphrase(false);
          setIssues(new Map());
          setError(undefined);
          setTested(undefined);
        }}
      >
        <SwitchSetting
          title={t("settings.offsite.enabled")}
          description={t("settings.offsite.enabledHint")}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
        {value.enabled && (
          <>
            <Field name="provider" disabled={disabled}>
              <FieldLabel>{t("settings.offsite.provider")}</FieldLabel>
              <Select
                items={providers.map((p) => ({
                  value: p,
                  label: t(`settings.offsite.provider.${p}`),
                }))}
                value={value.provider}
                onValueChange={(provider: string) => set({ provider: provider as OffsiteProvider })}
              />
            </Field>
            {(needsEndpoint(value.provider) || azure) &&
              text(
                "endpoint",
                "settings.offsite.endpoint",
                t(`settings.offsite.endpoint.${value.provider}` as MessageKey),
                { optional: azure, placeholder: endpointExample[value.provider] },
              )}
            {needsRegion(value.provider) &&
              text("region", "settings.offsite.region", t("settings.offsite.regionHint"), {
                placeholder: "ap-southeast-5",
                narrow: true,
              })}
            {/* Two short fields with no hints: side by side, so their boxes line up. */}
            <div className="gap-stack-md grid sm:grid-cols-2">
              {azure
                ? [
                    text("accessKeyId", "settings.offsite.account"),
                    text("bucket", "settings.offsite.container"),
                  ]
                : [
                    text("bucket", "settings.offsite.bucket"),
                    text("accessKeyId", "settings.offsite.keyId"),
                  ]}
            </div>
            <Field name="secret" invalid={Boolean(issues.get("secret"))} disabled={disabled}>
              <FieldLabel>
                {t(azure ? "settings.offsite.sas" : "settings.offsite.secret")}
              </FieldLabel>
              <FieldDescription>
                {settings.secretSaved && value.provider === settings.provider
                  ? t("settings.offsite.secretSaved")
                  : t(azure ? "settings.offsite.sasHint" : "settings.offsite.secretHint")}
              </FieldDescription>
              <Input
                type="password"
                value={secret}
                autoComplete="new-password"
                spellCheck={false}
                placeholder={
                  settings.secretSaved && value.provider === settings.provider
                    ? "••••••••••••"
                    : undefined
                }
                onChange={(e) => {
                  setSecret(e.target.value);
                  setTested(undefined);
                }}
              />
              <FieldError>{issues.get("secret")}</FieldError>
            </Field>
            {text("prefix", "settings.offsite.prefix", t("settings.offsite.prefixHint"), {
              optional: true,
              placeholder: "laman",
            })}
            {value.provider === "s3" && (
              <label className="text-body-sm text-txt-black-900 flex items-start gap-2.5">
                <Checkbox
                  checked={value.pathStyle}
                  disabled={disabled}
                  onCheckedChange={(pathStyle) => set({ pathStyle: Boolean(pathStyle) })}
                />
                <span className="flex flex-col">
                  {t("settings.offsite.pathStyle")}
                  <span className="text-txt-black-700">{t("settings.offsite.pathStyleHint")}</span>
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="default-outline"
                disabled={disabled || testing}
                onClick={() => void test()}
              >
                {t("settings.offsite.test")}
              </Button>
              <TestResult testing={testing} result={tested} />
            </div>

            <div className="border-otl-gray-200 flex flex-col border-t pt-4">
              <SwitchSetting
                title={t("settings.offsite.encrypt")}
                description={t("settings.offsite.encryptHint")}
                checked={value.encrypt}
                disabled={disabled}
                onCheckedChange={(encrypt) => set({ encrypt })}
              />
              {value.encrypt && settings.passphraseFingerprint && !changingPassphrase && (
                <div className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                  <span>
                    {t("settings.offsite.fingerprint")}{" "}
                    <code className="text-txt-black-900">{settings.passphraseFingerprint}</code>
                  </span>
                  <Button
                    type="button"
                    variant="default-ghost"
                    size="small"
                    disabled={disabled}
                    onClick={() => setChangingPassphrase(true)}
                  >
                    {t("settings.offsite.changePassphrase")}
                  </Button>
                </div>
              )}
              {askPassphrase && (
                <div className="gap-stack-md flex flex-col pt-2">
                  <Callout variant="warning">
                    <CalloutTitle>{t("settings.offsite.passphrase.warning")}</CalloutTitle>
                    <CalloutContent>
                      {t(
                        settings.passphraseFingerprint
                          ? "settings.offsite.passphrase.changeHint"
                          : "settings.offsite.passphrase.warningHint",
                      )}
                    </CalloutContent>
                  </Callout>
                  <div className="gap-stack-md grid sm:grid-cols-2">
                    <Field
                      name="passphrase"
                      invalid={Boolean(issues.get("passphrase"))}
                      disabled={disabled}
                    >
                      <FieldLabel>{t("settings.offsite.passphrase")}</FieldLabel>
                      <Input
                        type="password"
                        value={passphrase}
                        autoComplete="new-password"
                        onChange={(e) => setPassphrase(e.target.value)}
                      />
                      <FieldError>{issues.get("passphrase")}</FieldError>
                    </Field>
                    <Field
                      name="confirm"
                      invalid={Boolean(issues.get("confirm"))}
                      disabled={disabled}
                    >
                      <FieldLabel>{t("settings.offsite.passphrase.confirm")}</FieldLabel>
                      <Input
                        type="password"
                        value={confirm}
                        autoComplete="new-password"
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                      <FieldError>{issues.get("confirm")}</FieldError>
                    </Field>
                  </div>
                  <Field name="keptElsewhere" invalid={Boolean(issues.get("keptElsewhere"))}>
                    <label className="text-body-sm text-txt-black-900 flex items-start gap-2.5">
                      <Checkbox
                        checked={keptElsewhere}
                        disabled={disabled}
                        onCheckedChange={(checked) => setKeptElsewhere(Boolean(checked))}
                      />
                      {t("settings.offsite.passphrase.keptElsewhere")}
                    </label>
                    <FieldError>{issues.get("keptElsewhere")}</FieldError>
                  </Field>
                </div>
              )}
              <SwitchSetting
                title={t("settings.offsite.prune")}
                description={t("settings.offsite.pruneHint")}
                checked={value.prune}
                disabled={disabled}
                onCheckedChange={(prune) => set({ prune })}
              />
            </div>
          </>
        )}
      </SettingsForm>
    </SettingsCard>
  );
}

const endpointExample: Partial<Record<OffsiteProvider, string>> = {
  r2: "https://<account-id>.r2.cloudflarestorage.com",
  minio: "https://minio.agensi.gov.my",
  s3: "https://s3.example.com",
  azure: "https://<account>.blob.core.windows.net",
};

/** Test connection's answer, announced as it arrives. */
function TestResult({
  testing,
  result,
}: {
  testing: boolean;
  result: OffsiteTestResult | { ok: false; error: string } | undefined;
}) {
  if (testing)
    return (
      <output className="text-body-sm text-txt-black-700 flex items-center gap-2">
        <Spinner size="small" label={null} />
        {t("settings.offsite.testing")}
      </output>
    );
  if (!result) return <output className="sr-only" />;
  if (!result.ok)
    return (
      <output className="text-body-sm text-txt-danger flex min-w-0 items-start gap-1.5">
        <CrossCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="break-words">
          {t("settings.offsite.testFailed", { error: result.error ?? "" })}
        </span>
      </output>
    );
  return (
    <output className="text-body-sm text-txt-success flex min-w-0 items-start gap-1.5">
      <CheckCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {t(
          "canDelete" in result && result.canDelete
            ? "settings.offsite.testOkCanDelete"
            : "settings.offsite.testOk",
        )}
      </span>
    </output>
  );
}
