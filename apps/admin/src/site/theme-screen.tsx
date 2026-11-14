/**
 * Site colours: the primary colour of the published site, from a tested
 * preset or the agency's own colour, and an optional accent for decoration.
 * Its own document, like the announcement: Publish colours saves and sends it
 * live in one step. The shades are made
 * here with the same function the server runs on save, so the preview is what
 * will be stored; the server makes them again and keeps its own.
 */
import {
  accentFrom,
  accentPasses,
  accentTooClose,
  contrast,
  hexPattern,
  type Ramp,
  type RampStep,
  type RampUse,
  rampFor,
  rampSteps,
  rampUses,
  rgbToHex,
  type ThemePreset,
  themePresets,
} from "@fiscal-sb/blocks";
import type { SiteTheme, ThemeChoice, ThemeDoc } from "@fiscal-sb/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useState } from "react";
import { card } from "@/components/card";
import { PaletteIcon } from "@/components/palette-icon";
import { PublishControl } from "@/components/publish-control";
import { useDocConflict } from "@/components/conflict-dialog";
import { DiscardEditsDialog, PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SplitPane } from "@/components/ui/split-pane";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { StarIcon } from "@/components/ui/icons/star";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { SwitchSetting } from "@/components/switch-setting";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { siteApi } from "@/lib/api";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
import { WorkspaceFallback, WorkspaceHeader } from "@/components/workspace";
import { clx } from "@/lib/ftds/utils";
import { useThemeDoc } from "@/lib/publish";
import { Choice } from "./announcement-screen";
import { LivePreview } from "./live-preview";

type Preset = ThemePreset | "custom";

const presetName: Record<Preset, MessageKey> = {
  ftds: "theme.preset.ftds",
  green: "theme.preset.green",
  teal: "theme.preset.teal",
  navy: "theme.preset.navy",
  maroon: "theme.preset.maroon",
  purple: "theme.preset.purple",
  custom: "theme.preset.custom",
};
const presets = Object.keys(themePresets) as ThemePreset[];
/** Each preset's link and button colour, for its swatch. */
const presetSwatch = Object.fromEntries(
  presets.map((p) => [p, rgbToHex(rampFor(p).ramp["600"])]),
) as Record<ThemePreset, string>;

/** The "Your own colour" swatch until a colour is entered. */
const anyColour = "conic-gradient(#c0392b, #e8b100, #0b6b3a, #1f3a6e, #5b2a86, #c0392b)";

const useName: Record<RampUse, MessageKey> = {
  wash: "theme.use.wash",
  focus: "theme.use.focus",
  text: "theme.use.text",
  hover: "theme.use.hover",
};

const rgb = (ramp: Ramp, step: RampStep) => `rgb(${ramp[step].join(" ")})`;
const nameOf = (theme: { preset: Preset; seed?: string | undefined }) =>
  theme.preset === "custom" && theme.seed
    ? t("theme.custom.named", { hex: theme.seed })
    : t(presetName[theme.preset]);

/** What the screen is, drawn the same whether its document is loaded, loading or failed. */
const identity = () => ({
  icon: <PaletteIcon />,
  title: t("theme.title"),
  subtitle: t("theme.subtitle"),
});

/** The editing pane's starting width, for the SplitPane and the skeleton before it. */
const PANE_WIDTH = 460;

export function ThemeScreen() {
  const doc = useThemeDoc();
  if (doc.isError || !doc.data)
    return (
      <WorkspaceFallback
        {...identity()}
        error={doc.isError ? t("theme.loadFailed") : undefined}
        paneWidth={PANE_WIDTH}
      />
    );
  return <Editor doc={doc.data} />;
}

function Editor({ doc }: { doc: ThemeDoc }) {
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 768px)");
  const [preset, setPreset] = useState<Preset>(doc.draft.preset);
  // The colour as typed; it only counts once it's a whole #rrggbb.
  const [hex, setHex] = useState(doc.draft.seed ?? rgbToHex(doc.draft.primary["600"]));
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // The shades follow the last whole code, so a half-typed one doesn't flash the preview.
  const [lastHex, setLastHex] = useState(hex);
  const [accentOn, setAccentOn] = useState(Boolean(doc.draft.accent));
  const [accentHex, setAccentHex] = useState(doc.draft.accent ?? "");
  const [lastAccent, setLastAccent] = useState(doc.draft.accent ?? "");

  const accentValid = !accentOn || hexPattern.test(accentHex);
  const valid = (preset !== "custom" || hexPattern.test(hex)) && accentValid;
  const accent = accentOn && hexPattern.test(accentHex) ? accentHex.toLowerCase() : undefined;
  const choice: ThemeChoice = {
    ...(preset === "custom" ? { preset, seed: hex.toLowerCase() } : { preset }),
    ...(accent && { accent }),
  };
  const dirty =
    preset !== doc.draft.preset ||
    (preset === "custom" && hex.toLowerCase() !== doc.draft.seed) ||
    (accentOn ? accentHex.toLowerCase() : undefined) !== doc.draft.accent;
  const shownAccent = accentOn && lastAccent ? lastAccent : undefined;
  const shown: ThemeChoice = {
    ...(preset === "custom" ? { preset, seed: lastHex } : { preset }),
    ...(shownAccent && { accent: shownAccent }),
  };
  const generated = useMemo(() => rampFor(shown.preset, shown.seed), [shown.preset, shown.seed]);

  const load = (next: SiteTheme) => {
    setPreset(next.preset);
    const code = next.seed ?? rgbToHex(next.primary["600"]);
    setHex(code);
    setLastHex(code);
    setAccentOn(Boolean(next.accent));
    setAccentHex(next.accent ?? "");
    setLastAccent(next.accent ?? "");
  };
  const leaveGuard = useLeaveGuard(dirty, t("theme.leave.body"));
  const conflict = useDocConflict<SiteTheme>("theme", {
    onLoad: load,
    retry: () => save(),
  });

  const save = async () => {
    setSaving(true);
    try {
      const next = await siteApi.saveTheme(choice);
      queryClient.setQueryData(["theme"], next);
      load(next.draft);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    } catch (caught) {
      // Stops a publish that saves first, and asks which to keep.
      await conflict.handle(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  };
  const discard = async () => {
    const next = await siteApi.discardTheme();
    queryClient.setQueryData(["theme"], next);
    load(next.draft);
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const header = (
    <WorkspaceHeader
      {...identity()}
      status={
        <>
          <span
            aria-hidden
            className="border-otl-gray-200 size-4 shrink-0 rounded-full border"
            style={{ background: rgb(doc.published.primary, "600") }}
          />
          {doc.published.accent && (
            <span
              aria-hidden
              className="border-otl-gray-200 -ml-2.5 size-4 shrink-0 rounded-full border"
              style={{ background: doc.published.accent }}
            />
          )}
          {t("theme.state.live", { name: nameOf(doc.published) })}
        </>
      }
      actions={
        <>
          {dirty ? (
            <Button variant="default-ghost" size="small" onClick={() => setDiscarding(true)}>
              {t("navigation.discardEdits")}
            </Button>
          ) : (
            doc.changed && (
              <Button variant="default-ghost" size="small" onClick={() => void discard()}>
                {t("settings.discard")}
              </Button>
            )
          )}
          <PublishControl
            live={doc.changed ? "changed" : "live"}
            save={conflict.saveState(saving, dirty)}
            label={t("theme.publish")}
            beforePublish={dirty ? save : undefined}
            onPublish={() => siteApi.publishDoc("theme")}
            review={{
              title: t("theme.review.title"),
              description: t("theme.review.description"),
              body: (
                <div className="flex flex-col gap-3">
                  {!valid && (
                    <p className="text-txt-danger" role="alert">
                      {t("theme.hexInvalid")}
                    </p>
                  )}
                  <p>{t("theme.review.body", { name: nameOf(choice) })}</p>
                  {choice.accent && <p>{t("theme.review.accent", { hex: choice.accent })}</p>}
                  <p className="text-txt-black-700">{t("theme.review.undo")}</p>
                </div>
              ),
              blocked: !valid,
            }}
          />
        </>
      }
    />
  );

  const form = (
    <div className="bg-bg-washed flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <Choose
        preset={preset}
        hex={hex}
        // A whole code that isn't a colour; a short one is still being typed.
        error={!valid && hex.length >= 7 ? t("theme.hexInvalid") : undefined}
        onPreset={setPreset}
        onHex={(next) => {
          setHex(next);
          if (hexPattern.test(next)) setLastHex(next.toLowerCase());
        }}
      >
        <AccentChoice
          on={accentOn}
          hex={accentHex}
          shown={shownAccent}
          primary={generated.ramp}
          error={!accentValid && accentHex.length >= 7 ? t("theme.hexInvalid") : undefined}
          onToggle={(on) => {
            setAccentOn(on);
            // A first accent starts from something to change, not an empty box.
            if (on && !accentHex) {
              setAccentHex(defaultAccent);
              setLastAccent(defaultAccent);
            }
          }}
          onHex={(next) => {
            setAccentHex(next);
            if (hexPattern.test(next)) setLastAccent(next.toLowerCase());
          }}
        />
      </Choose>
      <Shades
        ramp={generated.ramp}
        seedStep={preset === "custom" ? generated.seedStep : undefined}
      />
      {doc.previous && !dirty && !doc.changed && (
        <PutBackPrevious
          label={t("theme.previous.load")}
          onPutBack={() => doc.previous && load(doc.previous)}
        />
      )}
    </div>
  );

  const preview = <Preview choice={shown} />;

  return (
    <div className="flex h-full flex-col">
      {header}
      {wide ? (
        <SplitPane
          className="min-h-0 flex-1"
          storageKey="admin.theme.split"
          defaultWidth={PANE_WIDTH}
          maxWidth={640}
          startLabel={t("theme.editor")}
          endLabel={t("navigation.preview")}
          start={<div className="flex h-full flex-col">{form}</div>}
          end={preview}
        />
      ) : (
        <div className="bg-bg-washed flex min-h-0 flex-1 flex-col overflow-y-auto">
          {form}
          <div className="h-[480px] shrink-0">{preview}</div>
        </div>
      )}
      <DiscardEditsDialog
        open={discarding}
        onOpenChange={setDiscarding}
        body={t("theme.discardEdits.body")}
        onDiscard={() => load(doc.draft)}
      />
      {leaveGuard}
      {conflict.dialog}
    </div>
  );
}

function Choose({
  preset,
  hex,
  error,
  onPreset,
  onHex,
  children,
}: {
  preset: Preset;
  hex: string;
  error?: string | undefined;
  onPreset: (preset: Preset) => void;
  onHex: (hex: string) => void;
  /** The accent, below the main colour in the same card. */
  children?: ReactNode;
}) {
  const customSwatch = preset === "custom" && hexPattern.test(hex) ? hex : anyColour;
  return (
    <div className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-4 p-4")}>
      <h2 className="text-label-lg text-txt-black-900 font-semibold">{t("theme.colours")}</h2>
      <h3 className="text-label-md text-txt-black-900 -mb-2 font-semibold">{t("theme.choose")}</h3>
      <Choice
        name="preset"
        legend={t("theme.choose")}
        hideLegend
        value={preset}
        onChange={onPreset}
        options={[...presets, "custom" as const].map((p) => ({
          value: p,
          label: (
            <>
              <span
                aria-hidden
                className="border-otl-gray-200 size-5 shrink-0 rounded-full border"
                style={{ background: p === "custom" ? customSwatch : presetSwatch[p] }}
              />
              {t(presetName[p])}
            </>
          ),
        }))}
      />
      {preset === "custom" && (
        <Field name="seed" invalid={Boolean(error)} className="border-otl-gray-200 border-t pt-4">
          <FieldLabel>{t("theme.hex")}</FieldLabel>
          <ColourInput hex={hex} onHex={onHex} />
          <FieldError>{error}</FieldError>
        </Field>
      )}
      {children}
    </div>
  );
}

/** A colour code and the browser's picker, kept in step. */
function ColourInput({ hex, onHex }: { hex: string; onHex: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={hex}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        className="max-w-40 font-mono"
        onChange={(e) => {
          const v = e.target.value.trim();
          onHex(v && !v.startsWith("#") ? `#${v}` : v);
        }}
      />
      <input
        type="color"
        aria-label={t("theme.picker")}
        value={hexPattern.test(hex) ? hex.toLowerCase() : "#000000"}
        onChange={(e) => onHex(e.target.value)}
        className="border-otl-gray-300 focus-visible:ring-fr-primary h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}

/** Where a first accent starts, for the officer to change. */
const defaultAccent = "#cb2043";

/**
 * The accent, in the colour card under the main colour: off, or a colour for
 * the brand bars, icon badges, figures and date tiles. Shows a card drawn in
 * it, and warns when it's too like primary to tell apart or primary links
 * can't be read on its wash.
 */
function AccentChoice({
  on,
  hex,
  shown,
  primary,
  error,
  onToggle,
  onHex,
}: {
  on: boolean;
  hex: string;
  shown: string | undefined;
  primary: Ramp;
  error?: string | undefined;
  onToggle: (on: boolean) => void;
  onHex: (hex: string) => void;
}) {
  const id = useId();
  const { accent, close, unreadable } = useMemo(() => {
    const made = shown ? accentFrom(shown) : undefined;
    return {
      accent: made,
      close: made && accentTooClose(primary["600"], made.seed),
      unreadable: made && !accentPasses(primary, made.ramp),
    };
  }, [shown, primary]);
  return (
    <section aria-labelledby={id} className="border-otl-gray-200 flex flex-col gap-4 border-t pt-4">
      <h3 id={id} className="text-label-md text-txt-black-900 -mb-2 font-semibold">
        {t("theme.accent.title")}
      </h3>
      <SwitchSetting
        title={t("theme.accent.toggle")}
        description={t("theme.accent.hint")}
        checked={on}
        onCheckedChange={onToggle}
      />
      {on && (
        <>
          <Field name="accent" invalid={Boolean(error)}>
            <FieldLabel>{t("theme.hex")}</FieldLabel>
            <ColourInput hex={hex} onHex={onHex} />
            <FieldError>{error}</FieldError>
          </Field>
          {accent && (
            // A card as the site draws one: the bar, an icon badge in the accent, a primary link.
            <div
              aria-hidden
              className="border-otl-gray-200 bg-bg-white overflow-hidden rounded-lg border"
            >
              <div className="h-1" style={{ background: rgbToHex(accent.seed) }} />
              <div className="flex items-center gap-3 p-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: rgb(accent.ramp, "50"),
                    color: rgb(accent.ramp, "700"),
                  }}
                >
                  <StarIcon className="size-5" />
                </span>
                <span
                  className="text-body-sm font-medium underline"
                  style={{ color: rgb(primary, "600") }}
                >
                  {t("theme.accent.sampleLink")}
                </span>
              </div>
            </div>
          )}
          {(close || unreadable) && (
            <p className="text-body-sm text-txt-warning flex items-start gap-2" aria-live="polite">
              <WarningCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {unreadable ? t("theme.accent.unreadable") : t("theme.accent.close")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Where the officer's colour went, when it isn't the link and button colour. */
function seedNote(seedStep: Exclude<RampStep, "600"> | null): MessageKey {
  if (seedStep === null) return "theme.note.darkened";
  if (seedStep === "500") return "theme.note.focus";
  return "theme.note.light";
}

function Shades({ ramp, seedStep }: { ramp: Ramp; seedStep: RampStep | null | undefined }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-4 p-4")}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-label-lg text-txt-black-900 font-semibold">
          {t("theme.shades.title")}
        </h2>
        <p className="text-body-sm text-txt-black-700">{t("theme.shades.hint")}</p>
      </div>
      <ol
        className="m-0 grid list-none grid-cols-11 gap-1 p-0"
        aria-label={t("theme.shades.title")}
      >
        {rampSteps.map((step) => (
          <li key={step} className="flex min-w-0 flex-col items-center gap-1">
            <span
              className={clx(
                "border-otl-gray-200 h-10 w-full rounded-sm border",
                seedStep === step && "ring-txt-black-900 ring-2 ring-offset-1",
              )}
              style={{ background: rgb(ramp, step) }}
              title={rgbToHex(ramp[step])}
            />
            <span className="text-label-compact text-txt-black-500 tabular-nums">{step}</span>
          </li>
        ))}
      </ol>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rampUses.map(({ step, use }) => (
          <li key={step} className="text-body-sm text-txt-black-900 flex items-center gap-2">
            <span
              aria-hidden
              className="border-otl-gray-200 size-4 shrink-0 rounded-sm border"
              style={{ background: rgb(ramp, step) }}
            />
            <span className="text-txt-black-500 w-8 tabular-nums">{step}</span>
            {t(useName[use])}
            {seedStep === step && (
              <Tag size="small" variant="default">
                {t("theme.yours")}
              </Tag>
            )}
          </li>
        ))}
      </ul>
      <ContrastCheck ramp={ramp} seedStep={seedStep} />
    </section>
  );
}

/** WCAG AA's least contrast for body text against its background. */
const AA_TEXT = 4.5;

/**
 * The WCAG check on the link and button colour: a sample of it on white, its
 * contrast against AA's minimum, and where the officer's colour went if it
 * couldn't be used for text as it was.
 */
function ContrastCheck({ ramp, seedStep }: { ramp: Ramp; seedStep: RampStep | null | undefined }) {
  const id = useId();
  const ratio = contrast(ramp["600"], [255, 255, 255]);
  const passes = ratio >= AA_TEXT;
  return (
    <section
      aria-labelledby={id}
      className="border-otl-gray-200 flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-label-md text-txt-black-900 font-semibold">
          {t("theme.check.title")}
        </h3>
        <Tag size="small">{t("theme.check.standard")}</Tag>
      </div>
      <div className="flex items-center gap-3">
        {/* What a visitor reads: link-coloured text on the page's white. */}
        <span
          aria-hidden
          className="border-otl-gray-200 bg-bg-white text-title flex size-12 shrink-0 items-center justify-center rounded-md border font-semibold"
          style={{ color: rgb(ramp, "600") }}
        >
          Aa
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body-md text-txt-black-900 flex flex-wrap items-center gap-2 font-semibold tabular-nums">
            {t("theme.check.ratio", { ratio: ratio.toFixed(1) })}
            <Tag size="small" variant={passes ? "success" : "danger"}>
              {passes ? (
                <CheckCircleIcon aria-hidden className="size-3.5" />
              ) : (
                <WarningCircleIcon aria-hidden className="size-3.5" />
              )}
              {passes ? t("theme.check.pass") : t("theme.check.fail")}
            </Tag>
          </p>
          <p className="text-body-sm text-txt-black-700">
            {t("theme.check.explain", { min: AA_TEXT })}
          </p>
        </div>
      </div>
      {seedStep !== undefined && seedStep !== "600" && (
        <p className="text-body-sm text-txt-black-700 border-otl-gray-200 border-t pt-3">
          {t(seedNote(seedStep))}
        </p>
      )}
    </section>
  );
}

/** The home page with the unsaved colours, swapped in as the officer chooses. */
function Preview({ choice }: { choice: ThemeChoice }) {
  return (
    <LivePreview
      render={(pageId, signal) => siteApi.renderWithSite(pageId, { theme: choice }, signal)}
      renderKey={JSON.stringify(choice)}
      regions={["#site-theme"]}
      caption={t("theme.preview.caption")}
    />
  );
}
