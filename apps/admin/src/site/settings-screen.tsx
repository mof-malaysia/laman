/**
 * Site settings, one section at a time in FTDS SettingsLayout. Every section
 * saves into the settings draft, which goes live with Publish settings, so
 * the preview and the published site never disagree mid-edit. Publishing
 * shows what will change first, and what was live before can be put back.
 * The Publishing defaults and analytics retention change the admin, not the
 * site, so they apply on save. So do the admin's language, which isn't
 * part of the settings at all (it's each person's own preference), and
 * Security, which only the super admin sees.
 */
import {
  AdminLanguage,
  type PrunePreview,
  type SiteSettings,
  socialPlatforms,
} from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useState } from "react";
import { SettingsLayout, SettingsRow, SettingsSection } from "@/components/blocks/settings-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PublishControl } from "@/components/publish-control";
import { useDocConflict } from "@/components/conflict-dialog";
import { PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { CheckShieldIcon } from "@/components/ui/icons/check-shield";
import { ClockIcon } from "@/components/ui/icons/clock";
import { EyeShowIcon } from "@/components/ui/icons/eye-show";
import { FolderIcon } from "@/components/ui/icons/folder";
import { GlobeIcon } from "@/components/ui/icons/globe";
import { GovtOfficeIcon } from "@/components/ui/icons/govt-office";
import { InfoIcon } from "@/components/ui/icons/info";
import { PhoneIcon } from "@/components/ui/icons/phone";
import { SearchIcon } from "@/components/ui/icons/search";
import { SettingIcon } from "@/components/ui/icons/setting";
import { TrashIcon } from "@/components/ui/icons/trash";
import { UserGroupIcon } from "@/components/ui/icons/user-group";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Radio, RadioButton, RadioHintText, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryList,
  SummaryListBody,
  SummaryListDetail,
  SummaryListRow,
  SummaryListTerm,
} from "@/components/ui/summary-list";
import { TextArea } from "@/components/ui/textarea";
import { currentLanguage, type MessageKey, t } from "@/i18n";
import { siteDocQuery } from "@/lib/publish";
import { apiError, preferencesApi, siteApi } from "@/lib/api";
import { securityApi, useCan, useMe } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { useSummary } from "@/lib/pages";
import { SwitchSetting } from "@/components/switch-setting";
import { MediaField } from "@/editor/media-field";
import { BackupsSection } from "./backups-section";
import { formatBytes } from "@/media/format";
import { Screen } from "@/components/screen";

/** Sections of the settings document: each saves into its draft. */
const documentSections = [
  "identity",
  "contact",
  "social",
  "phase",
  "search",
  "publishing",
  "analytics",
] as const satisfies readonly (keyof SiteSettings)[];
type DocumentSection = (typeof documentSections)[number];

export const settingsSections = [
  ...documentSections,
  "language",
  "security",
  "backups",
  "about",
] as const;
export type SettingsSectionId = (typeof settingsSections)[number];

/** Sections that aren't part of the settings document, so they show without it. */
const panels: Record<
  Exclude<SettingsSectionId, DocumentSection>,
  (props: { onDirtyChange: (dirty: boolean) => void }) => ReactNode
> = {
  language: LanguageSection,
  security: SecuritySection,
  backups: BackupsSection,
  about: About,
};

const sectionLabels: Record<SettingsSectionId, MessageKey> = {
  identity: "settings.identity",
  contact: "settings.contact",
  social: "settings.social",
  phase: "settings.phase",
  search: "settings.search",
  publishing: "settings.publishing",
  analytics: "settings.analytics",
  language: "settings.language",
  security: "settings.security",
  backups: "settings.backups",
  about: "settings.about",
};

/** A small mark per section, so the list scans at a glance (shown on wide screens). */
const sectionIcons: Record<SettingsSectionId, ReactNode> = {
  identity: <GovtOfficeIcon />,
  contact: <PhoneIcon />,
  social: <UserGroupIcon />,
  phase: <InfoIcon />,
  search: <SearchIcon />,
  publishing: <ClockIcon />,
  analytics: <EyeShowIcon />,
  language: <GlobeIcon />,
  security: <CheckShieldIcon />,
  backups: <FolderIcon />,
  about: <SettingIcon />,
};

export function SettingsScreen() {
  const canSecure = useCan("security.manage");
  const shown = settingsSections.filter((id) => id !== "security" || canSecure);
  const { section: asked = "identity" } = useSearch({ strict: false }) as {
    section?: SettingsSectionId;
  };
  const section = shown.includes(asked) ? asked : "identity";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const doc = useQuery(siteDocQuery("settings"));
  const Panel = section in panels ? panels[section as keyof typeof panels] : undefined;
  // The section in view has edits that aren't saved: Publish waits, and leaving asks first.
  const [dirty, setDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Another section is another `?section=`: the guard asks then too.
  const leaveGuard = useLeaveGuard(dirty, t("settings.leave.body"), { search: true });

  const discard = async () => {
    queryClient.setQueryData(["settings"], await siteApi.discardSettings());
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  /** The settings from before the last publish become the draft, to review and publish. */
  const putBack = async () => {
    const previous = doc.data?.previous;
    if (!previous || !doc.data) return;
    try {
      // The publishing defaults aren't part of what goes live, so they stay as they are.
      const saved = await siteApi.saveSettings({
        ...previous,
        publishing: doc.data.draft.publishing,
      });
      queryClient.setQueryData(["settings"], saved);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast({ variant: "success", title: t("settings.previous.done") });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("settings.previous.failed"),
        description: (await apiError(caught))?.message,
      });
    }
  };

  return (
    <Screen>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.settings")}</PageHeaderTitle>
          <PageHeaderDescription>{t("settings.intro")}</PageHeaderDescription>
        </PageHeaderContent>
        {/* Sections outside the settings document have nothing here to publish. */}
        {doc.data && !Panel && (
          <PageHeaderActions>
            {doc.data.changed && !dirty && (
              <Button variant="default-ghost" size="small" onClick={() => setDiscarding(true)}>
                {t("settings.discard")}
              </Button>
            )}
            <PublishControl
              live={doc.data.changed ? "changed" : "live"}
              save={dirty ? "unsaved" : "saved"}
              disabled={dirty}
              label={t("settings.publish")}
              viewPath="/"
              onPublish={() => siteApi.publishDoc("settings")}
              review={{
                title: t("settings.review.title"),
                description: t("settings.review.everyPage"),
                body: <SettingsReview from={doc.data.published} to={doc.data.draft} />,
              }}
            />
          </PageHeaderActions>
        )}
      </PageHeader>
      <SettingsLayout
        items={shown.map((id) => ({
          id,
          label: t(sectionLabels[id]),
          icon: sectionIcons[id],
          href: `/admin/settings?section=${id}`,
        }))}
        current={section}
        onNavigate={(id, event) => {
          event.preventDefault();
          void navigate({ to: "/settings", search: { section: id as SettingsSectionId } });
        }}
      >
        {Panel ? (
          <Panel onDirtyChange={setDirty} />
        ) : doc.isError ? (
          <Callout variant="danger">
            <CalloutTitle>{t("settings.loadFailed")}</CalloutTitle>
          </Callout>
        ) : !doc.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <SectionForm
              key={`${section}-${JSON.stringify(doc.data.draft[section as DocumentSection])}`}
              section={section as DocumentSection}
              draft={doc.data.draft}
              onDirtyChange={setDirty}
            />
            {doc.data.previous && !doc.data.changed && !dirty && (
              <PutBackPrevious
                label={t("settings.previous.load")}
                onPutBack={() => void putBack()}
              />
            )}
          </>
        )}
      </SettingsLayout>
      {leaveGuard}
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t("settings.discard.title")}
        description={t("settings.discard.body")}
        confirm={t("settings.discard")}
        cancel={t("media.discard.keep")}
        destructive
        onConfirm={() => void discard()}
      />
    </Screen>
  );
}

function SectionForm<S extends DocumentSection>({
  section,
  draft,
  onDirtyChange,
}: {
  section: S;
  draft: SiteSettings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<SiteSettings[S]>(draft[section]);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ReactNode>();
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  // Keeping fewer revisions removes older drafts: what it would remove, while the officer decides.
  const [pruning, setPruning] = useState<PrunePreview | null>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(draft[section]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (update: Partial<SiteSettings[S]>) => {
    setSaved(false);
    // Lists (social links) are replaced whole; objects merge.
    setValue(
      (current) => (Array.isArray(current) ? update : { ...current, ...update }) as SiteSettings[S],
    );
  };
  const issue = (path: string) => issues.get(`draft.${section}.${path}`);
  // Saves the whole document, this section from the form and the rest as stored: keeping
  // mine after a conflict saves over theirs only in this section.
  const conflict = useDocConflict<SiteSettings>("settings", {
    onLoad: (latest) => setValue(latest[section]),
    retry: () => write(),
  });

  const write = async () => {
    setPending(true);
    setError(undefined);
    setIssues(new Map());
    try {
      const doc = await siteApi.saveSettings({ ...draft, [section]: value });
      queryClient.setQueryData(["settings"], doc);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      setSaved(true);
    } catch (caught) {
      if (await conflict.handle(caught)) return;
      const body = await apiError(caught);
      setIssues(new Map(body?.details?.map((d) => [d.path, d.message]) ?? []));
      setError(
        body?.code === "validation_error"
          ? t("settings.fixFields")
          : (body?.message ?? t("common.tryAgain")),
      );
    } finally {
      setPending(false);
    }
  };

  const save = async () => {
    const keep = (value as Partial<SiteSettings["publishing"]>).revisionsToKeep;
    if (
      section === "publishing" &&
      typeof keep === "number" &&
      keep >= 5 &&
      keep < draft.publishing.revisionsToKeep
    ) {
      const preview = await siteApi.prunePreview(keep).catch(() => null);
      if (preview && preview.drafts > 0) return setPruning(preview);
    }
    await write();
  };

  return (
    <>
      <SettingsSection
        title={t(sectionLabels[section])}
        description={t(`${sectionLabels[section]}.description` as MessageKey)}
        pending={pending}
        saved={saved}
        error={error}
        onSave={() => void save()}
        labels={{
          save: t("settings.save"),
          saving: t("settings.saving"),
          saved: t(section === "publishing" ? "settings.savedApplied" : "settings.saved"),
        }}
      >
        {/* Fields keep a readable width; the card can be wider than a form needs. */}
        <div className="gap-stack-md flex max-w-2xl flex-col">
          {renderFields(section, value, set, issue)}
        </div>
      </SettingsSection>
      {conflict.dialog}
      <ConfirmDialog
        open={pruning !== null}
        onOpenChange={(open) => !open && setPruning(null)}
        title={t("settings.prune.title")}
        description={t("settings.prune.body", {
          drafts: pruning?.drafts ?? 0,
          pages: pruning?.pages ?? 0,
        })}
        confirm={t("settings.prune.confirm")}
        destructive
        onConfirm={() => void write()}
      />
    </>
  );
}

function renderFields<S extends DocumentSection>(
  section: S,
  value: SiteSettings[S],
  set: (update: Partial<SiteSettings[S]>) => void,
  issue: (path: string) => string | undefined,
) {
  const text = (
    key: string,
    label: MessageKey,
    options: { hint?: MessageKey; type?: string; multiline?: boolean; max?: number } = {},
  ) => {
    const current = (value as Record<string, unknown>)[key];
    return (
      <Field key={key} name={key} invalid={Boolean(issue(key))}>
        <FieldLabel>{t(label)}</FieldLabel>
        {options.hint && <FieldDescription>{t(options.hint)}</FieldDescription>}
        {options.multiline ? (
          <TextArea
            rows={3}
            value={(current as string | undefined) ?? ""}
            maxLength={options.max}
            onChange={(e) => set({ [key]: e.target.value } as Partial<SiteSettings[S]>)}
          />
        ) : (
          <Input
            type={options.type ?? "text"}
            // A cleared number stays empty instead of turning into 0.
            value={
              typeof current === "number" && Number.isNaN(current) ? "" : String(current ?? "")
            }
            maxLength={options.max}
            onChange={(e) =>
              set({
                [key]: options.type === "number" ? e.target.valueAsNumber : e.target.value,
              } as Partial<SiteSettings[S]>)
            }
          />
        )}
        <FieldError>{issue(key)}</FieldError>
      </Field>
    );
  };

  switch (section) {
    case "identity": {
      const v = value as SiteSettings["identity"];
      const setI = set as (u: Partial<SiteSettings["identity"]>) => void;
      return (
        <>
          {text("siteName", "settings.identity.siteName", { max: 80 })}
          {text("agencyName", "settings.identity.agencyName", {
            hint: "settings.identity.agencyHint",
            max: 120,
          })}
          {(["logo", "favicon", "socialImage"] as const).map((key) => (
            <MediaField
              key={key}
              title={t(`settings.identity.${key}`)}
              hint={t(`settings.identity.${key}Hint`)}
              surface="well"
              value={v[key]}
              required={false}
              error={undefined}
              onChange={(next) => setI({ [key]: next ? { mediaId: next.mediaId } : undefined })}
            />
          ))}
          <CheckRow
            title={t("settings.identity.navbarName")}
            description={t(
              v.logo ? "settings.identity.navbarNameHint" : "settings.identity.navbarNameNoLogo",
            )}
            checked={v.navbarName || !v.logo}
            disabled={!v.logo}
            onChange={(checked) => setI({ navbarName: checked })}
          />
          <CheckRow
            title={t("settings.identity.footerLogo")}
            description={t("settings.identity.footerLogoHint")}
            checked={v.footerLogo}
            onChange={(checked) => setI({ footerLogo: checked })}
          />
        </>
      );
    }
    case "contact":
      return (
        <>
          {text("address", "settings.contact.address", { multiline: true, max: 300 })}
          {text("phone", "settings.contact.phone", { type: "tel", max: 40 })}
          {text("email", "settings.contact.email", { type: "email", max: 200 })}
          {text("hours", "settings.contact.hours", {
            hint: "settings.contact.hoursHint",
            multiline: true,
            max: 200,
          })}
        </>
      );
    case "social": {
      const list = value as SiteSettings["social"];
      const setList = (next: SiteSettings["social"]) =>
        (set as unknown as (v: SiteSettings["social"]) => void)(next);
      const used = new Set(list.map((s) => s.platform));
      const free = socialPlatforms.filter((p) => !used.has(p));
      return (
        <div className="flex flex-col gap-3">
          {list.length === 0 && (
            <p className="text-body-sm text-txt-black-700">{t("settings.social.none")}</p>
          )}
          {list.map((item, index) => (
            <div key={item.platform} className="flex items-end gap-2">
              <Field
                name={`social-${item.platform}`}
                invalid={Boolean(issue(`${index}.url`))}
                className="flex-1"
              >
                <FieldLabel>{t(`settings.social.${item.platform}`)}</FieldLabel>
                <Input
                  type="url"
                  value={item.url}
                  placeholder="https://"
                  onChange={(e) =>
                    setList(list.map((s, i) => (i === index ? { ...s, url: e.target.value } : s)))
                  }
                />
                <FieldError>{issue(`${index}.url`)}</FieldError>
              </Field>
              <Button
                variant="danger-ghost"
                iconOnly
                aria-label={t("settings.social.remove", {
                  platform: t(`settings.social.${item.platform}`),
                })}
                onClick={() => setList(list.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
          {free.length > 0 && (
            <Field name="social-add">
              <FieldLabel>{t("settings.social.add")}</FieldLabel>
              <Select
                items={free.map((p) => ({ value: p, label: t(`settings.social.${p}`) }))}
                value=""
                placeholder={t("settings.social.choose")}
                onValueChange={(platform: string) =>
                  platform &&
                  setList([
                    ...list,
                    { platform: platform as SiteSettings["social"][number]["platform"], url: "" },
                  ])
                }
              />
            </Field>
          )}
        </div>
      );
    }
    case "phase": {
      const v = value as SiteSettings["phase"];
      const setP = set as (u: Partial<SiteSettings["phase"]>) => void;
      return (
        <>
          <RadioChoices
            name="phase"
            legend={t("settings.phase.label")}
            options={["off", "alpha", "beta"] as const}
            value={v.phase}
            onChange={(phase) => setP({ phase })}
            label={(p) => t(`settings.phase.${p}`)}
            hint={(p) => t(`settings.phase.${p}Hint`)}
          />
          {v.phase !== "off" &&
            text("feedbackUrl", "settings.phase.feedback", {
              hint: "settings.phase.feedbackHint",
              max: 500,
            })}
        </>
      );
    }
    case "search": {
      const v = value as SiteSettings["search"];
      const setS = set as (u: Partial<SiteSettings["search"]>) => void;
      return <SearchFields value={v} set={setS} />;
    }
    case "publishing":
      return (
        <>
          {text("scheduleTime", "settings.publishing.time", {
            hint: "settings.publishing.timeHint",
            type: "time",
          })}
          {text("revisionsToKeep", "settings.publishing.revisions", {
            hint: "settings.publishing.revisionsHint",
            type: "number",
          })}
        </>
      );
    case "analytics": {
      const v = value as SiteSettings["analytics"];
      const setA = set as (u: Partial<SiteSettings["analytics"]>) => void;
      return (
        <>
          <CheckRow
            title={t("settings.analytics.on")}
            description={t("settings.analytics.onHint")}
            checked={v.on}
            onChange={(checked) => setA({ on: checked })}
          />
          {text("retentionDays", "settings.analytics.retention", {
            hint: "settings.analytics.retentionHint",
            type: "number",
          })}
        </>
      );
    }
  }
  return null;
}

/** A checkbox row named by its title, with its description read after it. */
function CheckRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <SettingsRow
      title={title}
      description={<span id={id}>{description}</span>}
      control={
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-label={title}
          aria-describedby={id}
        />
      }
    />
  );
}

function SearchFields({
  value,
  set,
}: {
  value: SiteSettings["search"];
  set: (update: Partial<SiteSettings["search"]>) => void;
}) {
  const summary = useSummary();
  const url = summary.data?.site.url;
  // Without the site's address no sitemap can be written: say so instead of showing a tick.
  const noAddress = summary.data !== undefined && !url;
  return (
    <>
      {url && (
        <SummaryList>
          <SummaryListBody>
            <SummaryListRow>
              <SummaryListTerm>{t("settings.search.address")}</SummaryListTerm>
              <SummaryListDetail>{url}</SummaryListDetail>
            </SummaryListRow>
          </SummaryListBody>
        </SummaryList>
      )}
      {noAddress && (
        <Callout variant="warning">
          <CalloutTitle>{t("settings.search.noAddressTitle")}</CalloutTitle>
          <CalloutContent>
            {t("settings.search.noAddressBody")} <code>SITE_URL</code>
          </CalloutContent>
        </Callout>
      )}
      <CheckRow
        title={t("settings.search.hide")}
        description={t("settings.search.hideHint")}
        checked={value.hideSite}
        onChange={(checked) => set({ hideSite: checked })}
      />
      <CheckRow
        title={t("settings.search.sitemap")}
        description={
          noAddress ? t("settings.search.sitemapNoAddress") : t("settings.search.sitemapHint")
        }
        checked={value.sitemap && !noAddress}
        disabled={noAddress}
        onChange={(checked) => set({ sitemap: checked })}
      />
    </>
  );
}

/** What publishing the settings will change, field by field. */
function SettingsReview({ from, to }: { from: SiteSettings; to: SiteSettings }) {
  const lines = settingsChanges(from, to);
  const hiding = !from.search.hideSite && to.search.hideSite;
  return (
    <div className="flex flex-col gap-3">
      {hiding && (
        <Callout variant="warning">
          <CalloutTitle>{t("settings.review.hiding")}</CalloutTitle>
        </Callout>
      )}
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {(lines.length ? lines : [t("settings.review.none")]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-txt-black-700">{t("settings.review.undo")}</p>
    </div>
  );
}

const shown = (value: string | undefined) => {
  const text = value?.trim() ?? "";
  if (!text) return t("settings.review.empty");
  return text.length > 60 ? `“${text.slice(0, 57)}…”` : `“${text}”`;
};

const onOff = (on: boolean) => t(on ? "settings.review.on" : "settings.review.off");

/** "Site name: “Lama” → “Baharu”", one line per field that differs. */
function settingsChanges(from: SiteSettings, to: SiteSettings): string[] {
  const lines: string[] = [];
  const change = (label: MessageKey, a: string, b: string) => {
    if (a !== b) lines.push(t("settings.review.change", { label: t(label), from: a, to: b }));
  };
  const text = (label: MessageKey, get: (s: SiteSettings) => string | undefined) =>
    change(label, shown(get(from)), shown(get(to)));

  text("settings.identity.siteName", (s) => s.identity.siteName);
  text("settings.identity.agencyName", (s) => s.identity.agencyName);
  for (const key of ["logo", "favicon", "socialImage"] as const) {
    const a = from.identity[key]?.mediaId;
    const b = to.identity[key]?.mediaId;
    if (a === b) continue;
    const message = !b
      ? "settings.review.imageRemoved"
      : a
        ? "settings.review.imageChanged"
        : "settings.review.imageAdded";
    lines.push(t(message, { label: t(`settings.identity.${key}`) }));
  }
  change(
    "settings.identity.navbarName",
    onOff(from.identity.navbarName),
    onOff(to.identity.navbarName),
  );
  change(
    "settings.identity.footerLogo",
    onOff(from.identity.footerLogo),
    onOff(to.identity.footerLogo),
  );
  for (const key of ["address", "phone", "email", "hours"] as const)
    text(`settings.contact.${key}`, (s) => s.contact[key]);
  for (const platform of socialPlatforms)
    text(`settings.social.${platform}`, (s) => s.social.find((x) => x.platform === platform)?.url);
  change(
    "settings.phase.label",
    t(`settings.phase.${from.phase.phase}`),
    t(`settings.phase.${to.phase.phase}`),
  );
  text("settings.phase.feedback", (s) => s.phase.feedbackUrl);
  change("settings.search.hide", onOff(from.search.hideSite), onOff(to.search.hideSite));
  change("settings.search.sitemap", onOff(from.search.sitemap), onOff(to.search.sitemap));
  change("settings.analytics.on", onOff(from.analytics.on), onOff(to.analytics.on));
  return lines;
}

/** One choice from a few, each with a hint: a legend and a radio per option. */
function RadioChoices<V extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  label,
  labelLang,
  hint,
}: {
  name: string;
  legend: string;
  options: readonly V[];
  value: V;
  onChange: (value: V) => void;
  label: (option: V) => string;
  /** The label's language, when it isn't the admin's. */
  labelLang?: (option: V) => string;
  hint: (option: V) => string;
}) {
  return (
    <Field name={name}>
      <Fieldset render={<Radio value={value} onValueChange={(next) => onChange(next as V)} />}>
        <FieldsetLegend className="text-label-md font-medium">{legend}</FieldsetLegend>
        {options.map((option) => (
          <FieldItem key={option}>
            <RadioItem className="items-start">
              <RadioButton
                value={option}
                id={`${name}-${option}`}
                aria-describedby={`${name}-${option}-hint`}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <RadioLabel htmlFor={`${name}-${option}`} lang={labelLang?.(option)}>
                  {label(option)}
                </RadioLabel>
                <RadioHintText id={`${name}-${option}-hint`}>{hint(option)}</RadioHintText>
              </span>
            </RadioItem>
          </FieldItem>
        ))}
      </Fieldset>
    </Field>
  );
}

/**
 * The admin's language. It saves to the admin preferences, not the settings
 * draft, and reloads the admin in the new language.
 */
function LanguageSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [value, setValue] = useState(currentLanguage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>();
  const dirty = value !== currentLanguage();
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      await preferencesApi.save({ language: value });
      // Clears the guard first, so the reload doesn't ask about unsaved edits.
      onDirtyChange(false);
      window.location.reload();
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
      setPending(false);
    }
  };

  return (
    <SettingsSection
      title={t("settings.language")}
      description={t("settings.language.description")}
      pending={pending}
      error={error}
      onSave={() => void save()}
      labels={{
        save: t("settings.save"),
        saving: t("settings.saving"),
        saved: t("settings.savedApplied"),
      }}
    >
      <div className="gap-stack-md flex max-w-2xl flex-col">
        {/* Each language in its own name, so it can be found in either. */}
        <RadioChoices
          name="language"
          legend={t("settings.language.label")}
          options={AdminLanguage.options}
          value={value}
          onChange={setValue}
          label={(language) => t(`settings.language.${language}`)}
          labelLang={(language) => language}
          hint={(language) => t(`settings.language.${language}Hint`)}
        />
      </div>
    </SettingsSection>
  );
}

/** Builder security, for the super admin: whether everyone must use two-factor. Applies on change. */
function SecuritySection() {
  const me = useMe();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const security = useQuery({ queryKey: ["security"], queryFn: securityApi.get });
  const [confirming, setConfirming] = useState(false);
  const on = security.data?.requireTwoFactor ?? false;

  const save = async (requireTwoFactor: boolean) => {
    try {
      queryClient.setQueryData(["security"], await securityApi.save({ requireTwoFactor }));
      toast({
        variant: "success",
        title: requireTwoFactor ? t("settings.security.onDone") : t("settings.security.offDone"),
      });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("settings.security.failed"),
        description: (await apiError(caught))?.message,
      });
    }
  };

  return (
    <SettingsSection
      title={t("settings.security")}
      description={t("settings.security.description")}
    >
      <div className="gap-stack-md flex flex-col">
        <SwitchSetting
          title={t("settings.security.require")}
          description={t("settings.security.requireHint")}
          checked={on}
          disabled={!security.data || (!on && !me.twoFactor)}
          onCheckedChange={(checked) => (checked ? setConfirming(true) : void save(false))}
        />
        {!me.twoFactor && !on && (
          <Callout variant="info">
            <CalloutTitle>{t("settings.security.yoursFirst")}</CalloutTitle>
            <CalloutContent>
              <Link to="/account" className="text-txt-primary underline">
                {t("settings.security.toAccount")}
              </Link>
            </CalloutContent>
          </Callout>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("settings.security.confirm.title")}
        description={t("settings.security.confirm.body")}
        confirm={t("settings.security.confirm.yes")}
        onConfirm={() => void save(true)}
      />
    </SettingsSection>
  );
}

/** This installation: its version and where it keeps the site. Backups have their own section. */
function About() {
  const site = useSummary().data?.site;
  // The server's paths are for whoever runs it.
  const canManage = useCan("site.manage");
  const rows: [MessageKey, ReactNode][] = site
    ? [
        ["settings.about.version", site.version],
        ...(canManage
          ? ([
              [
                "settings.about.dataDir",
                <code key="dir" className="break-all">
                  {site.dataDir}
                </code>,
              ],
            ] as [MessageKey, ReactNode][])
          : []),
        ["settings.about.database", formatBytes(site.databaseBytes)],
      ]
    : [];
  return (
    <SettingsSection title={t("settings.about")} description={t("settings.about.description")}>
      <SummaryList>
        <SummaryListBody>
          {rows.map(([label, value]) => (
            <SummaryListRow key={label}>
              <SummaryListTerm>{t(label)}</SummaryListTerm>
              <SummaryListDetail>{value}</SummaryListDetail>
            </SummaryListRow>
          ))}
        </SummaryListBody>
      </SummaryList>
    </SettingsSection>
  );
}
