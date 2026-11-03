/**
 * Site colours: the primary colour of the published site, from a tested
 * preset or the agency's own colour. Its own document, like the announcement:
 * Publish colours saves and sends it live in one step. The shades are made
 * here with the same function the server runs on save, so the preview is what
 * will be stored; the server makes them again and keeps its own.
 */
import {
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
import { useId, useMemo, useState } from "react";
import { card } from "@/components/card";
import { PaletteIcon } from "@/components/palette-icon";
import { PublishControl } from "@/components/publish-control";
import { useDocConflict } from "@/components/conflict-dialog";
import { DiscardEditsDialog, PutBackPrevious, useLeaveGuard } from "@/components/unsaved-edits";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/ui/split-pane";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { siteApi } from "@/lib/api";
import { useMediaQuery } from "@/lib/ftds/hooks/use-media-query";
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

export function ThemeScreen() {
  const doc = useThemeDoc();
  if (doc.isError)
    return (
      <div className="p-surface">
        <Callout variant="danger">
          <CalloutTitle>{t("theme.loadFailed")}</CalloutTitle>
        </Callout>
      </div>
    );
  if (!doc.data)
    return (
      <div className="flex h-full flex-col" aria-busy>
        <div className="px-surface border-otl-gray-200 flex items-start gap-3 border-b pt-5 pb-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="bg-bg-washed flex flex-1 flex-col gap-4 p-4 md:max-w-[520px]">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
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

  const valid = preset !== "custom" || hexPattern.test(hex);
  const choice: ThemeChoice =
    preset === "custom" ? { preset, seed: hex.toLowerCase() } : { preset };
  const dirty =
    preset !== doc.draft.preset || (preset === "custom" && hex.toLowerCase() !== doc.draft.seed);
  const shown: ThemeChoice = preset === "custom" ? { preset, seed: lastHex } : { preset };
  const generated = useMemo(() => rampFor(shown.preset, shown.seed), [shown.preset, shown.seed]);

  const load = (next: { preset: Preset; seed?: string | undefined; primary: Ramp }) => {
    setPreset(next.preset);
    const code = next.seed ?? rgbToHex(next.primary["600"]);
    setHex(code);
    setLastHex(code);
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
    <header className="bg-bg-white px-surface border-otl-gray-200 flex flex-wrap items-start gap-x-6 gap-y-3 border-b pt-5 pb-4">
      <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-3">
        <span
          aria-hidden
          className="bg-bg-primary-100 text-txt-primary grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5"
        >
          <PaletteIcon />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-title text-txt-black-900 truncate font-semibold">
            {t("theme.title")}
          </h1>
          <p className="text-body-sm text-txt-black-500">{t("theme.subtitle")}</p>
          <p className="text-body-sm text-txt-black-700 flex flex-wrap items-center gap-2 pt-1">
            <span
              aria-hidden
              className="border-otl-gray-200 size-4 shrink-0 rounded-full border"
              style={{ background: rgb(doc.published.primary, "600") }}
            />
            {t("theme.state.live", { name: nameOf(doc.published) })}
          </p>
        </div>
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
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
                <p className="text-txt-black-700">{t("theme.review.undo")}</p>
              </div>
            ),
            blocked: !valid,
          }}
        />
      </div>
    </header>
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
      />
      <Shades
        ramp={generated.ramp}
        seedStep={preset === "custom" ? generated.seedStep : undefined}
      />
      <p className="text-body-sm text-txt-black-700 px-1">{t("theme.fixed")}</p>
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
          defaultWidth={460}
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
}: {
  preset: Preset;
  hex: string;
  error?: string | undefined;
  onPreset: (preset: Preset) => void;
  onHex: (hex: string) => void;
}) {
  const customSwatch = preset === "custom" && hexPattern.test(hex) ? hex : anyColour;
  return (
    <div className={clx(card, "border-otl-gray-200 flex shrink-0 flex-col gap-4 p-4")}>
      <div className="flex flex-col gap-1">
        <h2 className="text-label-lg text-txt-black-900 font-semibold">{t("theme.choose")}</h2>
        <p className="text-body-sm text-txt-black-700">{t("theme.chooseHint")}</p>
      </div>
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
          <FieldDescription>{t("theme.hexHint")}</FieldDescription>
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
          <FieldError>{error}</FieldError>
        </Field>
      )}
    </div>
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
  const ratio = contrast(ramp["600"], [255, 255, 255]);
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
      <div className="border-otl-gray-200 flex flex-col gap-1 border-t pt-3">
        {seedStep !== undefined && seedStep !== "600" && (
          <p className="text-body-sm text-txt-black-900">{t(seedNote(seedStep))}</p>
        )}
        <p className="text-body-sm text-txt-black-700">
          {t("theme.contrast", { ratio: ratio.toFixed(1) })}
        </p>
      </div>
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
