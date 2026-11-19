/**
 * Settings → Media storage, for the super admin: where the media library's
 * files are kept. The bundled store by default (on this server, so it warns
 * when nothing copies the media off it), or the agency's own S3-compatible
 * provider. A setup is saved only after its test passes, and can't change
 * while the library has live files: Laman never copies files between stores.
 */
import {
  type MediaStorage,
  type MediaStorageSave,
  type MediaStorageTestResult,
  needsEndpoint,
  needsRegion,
} from "@laman/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RadioCards } from "@/components/radio-cards";
import { SavedNote, SettingsCard, SettingsForm } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CrossCircleIcon } from "@/components/ui/icons/cross-circle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  SummaryList,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { type MessageKey, t } from "@/i18n";
import { apiError, siteApi } from "@/lib/api";
import {
  defaultRegion,
  endpointExample,
  endpointHint,
  providers,
  regionExample,
} from "./offsite-card";
import { ProviderLogo } from "./provider-logos";

type Fields = Omit<MediaStorageSave, "secret">;

const blank: Fields = {
  provider: "aws",
  endpoint: "",
  region: "",
  pathStyle: false,
  privateBucket: "",
  publishedBucket: "",
  publicUrl: "",
  accessKeyId: "",
};

const fieldsOf = (storage: MediaStorage): Fields => {
  if (!storage.own) return blank;
  const { secretSaved: _saved, ...fields } = storage.own;
  return fields;
};

export function MediaStorageSection({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const query = useQuery({ queryKey: ["mediaStorage"], queryFn: siteApi.mediaStorage });
  const [saved, setSaved] = useState(false);
  if (!query.data)
    return (
      <SettingsCard title={t("settings.storage")}>
        {query.isError ? (
          <Callout variant="danger">
            <CalloutTitle>{t("settings.storage.loadFailed")}</CalloutTitle>
          </Callout>
        ) : (
          <Skeleton className="h-32 w-full rounded-lg" />
        )}
      </SettingsCard>
    );
  return (
    <StorageCard
      key={JSON.stringify(query.data)}
      storage={query.data}
      saved={saved}
      onSaved={setSaved}
      onDirtyChange={onDirtyChange}
    />
  );
}

function StorageCard({
  storage,
  saved,
  onSaved,
  onDirtyChange,
}: {
  storage: MediaStorage;
  saved: boolean;
  onSaved: (saved: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locked = storage.files.live > 0;
  // The form shows once asked for: setting up, or changing the saved setup.
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const own = storage.store === "own" && storage.own;

  const remove = async () => {
    setRemoveError(undefined);
    try {
      queryClient.setQueryData(["mediaStorage"], await siteApi.removeMediaStorage());
      onSaved(true);
    } catch (caught) {
      setRemoveError((await apiError(caught))?.message ?? t("common.tryAgain"));
    }
  };

  return (
    <SettingsCard
      title={t("settings.storage")}
      description={t("settings.storage.description")}
      aside={saved && !editing ? <SavedNote>{t("settings.savedApplied")}</SavedNote> : undefined}
    >
      <SummaryList>
        <SummaryListBody>
          <SummaryListRow>
            <SummaryListTerm>{t("settings.storage.inUse")}</SummaryListTerm>
            <SummaryListDetail>
              {own
                ? t("settings.storage.own", {
                    provider: t(`settings.offsite.provider.${own.provider}`),
                  })
                : t("settings.storage.bundled")}
            </SummaryListDetail>
          </SummaryListRow>
          {own && (
            <>
              <SummaryListRow>
                <SummaryListTerm>{t("settings.storage.privateBucket")}</SummaryListTerm>
                <SummaryListDetail className="break-all">{own.privateBucket}</SummaryListDetail>
              </SummaryListRow>
              <SummaryListRow>
                <SummaryListTerm>{t("settings.storage.publishedBucket")}</SummaryListTerm>
                <SummaryListDetail className="break-all">{own.publishedBucket}</SummaryListDetail>
              </SummaryListRow>
              <SummaryListRow>
                <SummaryListTerm>{t("settings.storage.publicUrl")}</SummaryListTerm>
                <SummaryListDetail className="break-all">{own.publicUrl}</SummaryListDetail>
              </SummaryListRow>
            </>
          )}
          <SummaryListRow>
            <SummaryListTerm>{t("settings.storage.files")}</SummaryListTerm>
            <SummaryListDetail>
              {t("settings.storage.filesCount", {
                live: storage.files.live,
                deleted: storage.files.deleted,
              })}
            </SummaryListDetail>
          </SummaryListRow>
        </SummaryListBody>
      </SummaryList>

      {own ? (
        <p className="text-body-sm text-txt-black-700 max-w-prose">
          {t("settings.storage.ownHint")}
        </p>
      ) : storage.offsite ? (
        <p className="text-body-sm text-txt-black-700 max-w-prose">
          {t("settings.storage.bundledCopied")}
        </p>
      ) : (
        <Callout variant="warning">
          <CalloutTitle>{t("settings.storage.noCopy")}</CalloutTitle>
          <CalloutContent>
            {t("settings.storage.noCopyHint")}{" "}
            <Button
              variant="default-ghost"
              size="small"
              onClick={() => void navigate({ to: "/settings", search: { section: "backups" } })}
            >
              {t("settings.storage.openBackups")}
            </Button>
          </CalloutContent>
        </Callout>
      )}

      {locked && (
        <Callout variant="info">
          <CalloutTitle>{t("settings.storage.locked", { count: storage.files.live })}</CalloutTitle>
          <CalloutContent>
            {t(own ? "settings.storage.lockedOwnHint" : "settings.storage.lockedHint")}
          </CalloutContent>
        </Callout>
      )}

      {!storage.canSave && (
        <Callout variant="warning">
          <CalloutTitle>{t("settings.offsite.noKey")}</CalloutTitle>
          <CalloutContent>{t("settings.storage.noKeyHint")}</CalloutContent>
        </Callout>
      )}

      {editing ? (
        <StorageForm
          storage={storage}
          locked={locked}
          onDirtyChange={onDirtyChange}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            queryClient.setQueryData(["mediaStorage"], next);
            onSaved(true);
          }}
        />
      ) : (
        storage.canSave &&
        (own || !locked) && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="default-outline"
              onClick={() => {
                onSaved(false);
                setEditing(true);
              }}
            >
              {t(
                !own
                  ? "settings.storage.useOwn"
                  : locked
                    ? "settings.storage.changeKeys"
                    : "settings.storage.change",
              )}
            </Button>
            {own && !locked && (
              <Button variant="default-ghost" onClick={() => setRemoving(true)}>
                {t("settings.storage.remove")}
              </Button>
            )}
            {removeError && <output className="text-body-sm text-txt-danger">{removeError}</output>}
          </div>
        )
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("settings.storage.remove.title")}
        description={t("settings.storage.remove.body")}
        confirm={t("settings.storage.remove")}
        destructive={storage.files.deleted > 0}
        onConfirm={() => void remove()}
      >
        {storage.files.deleted > 0 && <PurgeWarning count={storage.files.deleted} />}
      </ConfirmDialog>
    </SettingsCard>
  );
}

/** Files in Recently deleted are removed for good when the storage changes. */
function PurgeWarning({ count }: { count: number }) {
  return (
    <Callout variant="warning">
      <CalloutTitle>{t("settings.storage.purge", { count })}</CalloutTitle>
      <CalloutContent>{t("settings.storage.purgeHint")}</CalloutContent>
    </Callout>
  );
}

function StorageForm({
  storage,
  locked,
  onDirtyChange,
  onCancel,
  onSaved,
}: {
  storage: MediaStorage;
  /** The library has live files: only the keys and the published files' address may change. */
  locked: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: (storage: MediaStorage) => void;
}) {
  const [value, setValue] = useState<Fields>(fieldsOf(storage));
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>();
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<MediaStorageTestResult>();
  const [confirming, setConfirming] = useState(false);
  const secretSaved = Boolean(storage.own?.secretSaved) && value.provider === storage.own?.provider;

  // The form counts as unsaved from the moment it's open.
  useEffect(() => {
    onDirtyChange(true);
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const set = (update: Partial<Fields>) => {
    setValue((current) => ({ ...current, ...update }));
    setTested(undefined);
  };
  const endpointHintKey = endpointHint[value.provider];
  const region = regionExample[value.provider] ?? defaultRegion;
  const body = (): MediaStorageSave => ({ ...value, secret: secret.trim() || undefined });

  const problemOf = async (caught: unknown) => {
    const problem = await apiError(caught);
    if (problem?.details) setIssues(new Map(problem.details.map((d) => [d.path, d.message])));
    return problem?.code === "validation_error"
      ? t("settings.fixFields")
      : (problem?.message ?? t("common.tryAgain"));
  };

  const test = async () => {
    setTesting(true);
    setTested(undefined);
    setIssues(new Map());
    try {
      setTested(await siteApi.testMediaStorage(body()));
    } catch (caught) {
      setTested({ ok: false, bucket: null, error: await problemOf(caught) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      onSaved(await siteApi.saveMediaStorage(body()));
      onDirtyChange(false);
      onCancel();
    } catch (caught) {
      setError(await problemOf(caught));
    } finally {
      setPending(false);
    }
  };

  const text = (
    key: keyof Fields & string,
    label: MessageKey,
    hint?: ReactNode,
    extra: { placeholder?: string; narrow?: boolean; fixed?: boolean } = {},
  ) => (
    <Field
      key={key}
      name={key}
      invalid={Boolean(issues.get(key))}
      disabled={pending || (locked && extra.fixed)}
    >
      <FieldLabel>{t(label)}</FieldLabel>
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
    <SettingsForm
      dirty
      pending={pending}
      error={error}
      section={t("settings.storage")}
      onSave={() => {
        if (!tested?.ok) return setError(t("settings.storage.testFirst"));
        if (!locked && storage.files.deleted > 0) return setConfirming(true);
        void save();
      }}
      onDiscard={onCancel}
    >
      <RadioCards
        legend={t("settings.offsite.provider")}
        value={value.provider}
        onChange={(provider) => set({ provider })}
        disabled={pending || locked}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        cardClassName="text-body-sm items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium"
        idleClassName="border-otl-gray-200 bg-bg-white text-txt-black-900 hover:border-otl-gray-300"
        options={providers.map((provider) => {
          const label = t(`settings.offsite.provider.${provider}`);
          return {
            value: provider,
            label,
            content: (
              <>
                <span className="grid size-6 shrink-0 place-items-center">
                  <ProviderLogo provider={provider} className="max-h-6 max-w-6" />
                </span>
                {label}
              </>
            ),
          };
        })}
      />
      {needsEndpoint(value.provider) &&
        text("endpoint", "settings.offsite.endpoint", endpointHintKey && t(endpointHintKey), {
          placeholder: endpointExample[value.provider],
          fixed: true,
        })}
      {needsRegion(value.provider) &&
        text("region", "settings.offsite.region", t(region.hint), {
          placeholder: region.example,
          narrow: true,
          fixed: true,
        })}
      <div className="gap-stack-md grid sm:grid-cols-2">
        {text(
          "privateBucket",
          "settings.storage.privateBucket",
          t("settings.storage.privateHint"),
          {
            placeholder: "agensi-media",
            fixed: true,
          },
        )}
        {text(
          "publishedBucket",
          "settings.storage.publishedBucket",
          t("settings.storage.publishedHint"),
          { placeholder: "agensi-media-published", fixed: true },
        )}
      </div>
      {text("publicUrl", "settings.storage.publicUrl", t("settings.storage.publicUrlHint"), {
        placeholder: "https://media.agensi.gov.my",
      })}
      {text("accessKeyId", "settings.offsite.keyId")}
      {value.provider === "gcs" && (
        <p className="text-body-sm text-txt-black-700 -mt-2">{t("settings.offsite.gcsKeys")}</p>
      )}
      <Field name="secret" invalid={Boolean(issues.get("secret"))} disabled={pending}>
        <FieldLabel>{t("settings.offsite.secret")}</FieldLabel>
        <FieldDescription>
          {t(secretSaved ? "settings.offsite.secretSaved" : "settings.storage.secretHint")}
        </FieldDescription>
        <Input
          type="password"
          value={secret}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={secretSaved ? "••••••••••••" : undefined}
          onChange={(e) => {
            setSecret(e.target.value);
            setTested(undefined);
          }}
        />
        <FieldError>{issues.get("secret")}</FieldError>
      </Field>
      {value.provider === "s3" && (
        <label className="text-body-sm text-txt-black-900 flex items-start gap-2.5">
          <Checkbox
            checked={value.pathStyle}
            disabled={pending || locked}
            onCheckedChange={(pathStyle) => set({ pathStyle: Boolean(pathStyle) })}
          />
          <span className="flex flex-col">
            {t("settings.offsite.pathStyle")}
            <span className="text-txt-black-700">{t("settings.offsite.pathStyleHint")}</span>
          </span>
        </label>
      )}
      <p className="text-body-sm text-txt-black-700 max-w-prose">{t("settings.storage.keyNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="default-outline"
          disabled={testing || pending}
          onClick={() => void test()}
        >
          {t("settings.offsite.test")}
        </Button>
        <TestResult testing={testing} result={tested} />
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("settings.storage.confirm.title")}
        description={t("settings.storage.confirm.body")}
        confirm={t("settings.storage.confirm")}
        destructive
        onConfirm={() => void save()}
      >
        <PurgeWarning count={storage.files.deleted} />
      </ConfirmDialog>
    </SettingsForm>
  );
}

/** Test connection's answer, announced as it arrives. */
function TestResult({
  testing,
  result,
}: {
  testing: boolean;
  result: MediaStorageTestResult | undefined;
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
          {t(
            result.bucket === "published"
              ? "settings.storage.testFailedPublished"
              : result.bucket === "private"
                ? "settings.storage.testFailedPrivate"
                : "settings.offsite.testFailed",
            { error: result.error ?? "" },
          )}
        </span>
      </output>
    );
  return (
    <output className="text-body-sm text-txt-success flex min-w-0 items-start gap-1.5">
      <CheckCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t("settings.storage.testOk")}</span>
    </output>
  );
}
