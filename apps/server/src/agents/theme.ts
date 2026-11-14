/** Site colours for agents: the choice they give, and the ramps it makes, as they read them. */
import {
  type Accent,
  accentPasses,
  accentTooClose,
  contrast,
  hexPattern,
  type Ramp,
  rampPasses,
  rampSteps,
  rampUses,
  rgbToHex,
  themePresets,
  type ThemePreset,
} from "@laman/blocks";
import type { SiteTheme, ThemeChoice } from "@laman/contracts";
import { z } from "zod";
import { ToolError } from "./tool.js";

/**
 * The main colour (a preset or the agency's own colour) and the accent: what
 * preview_theme and set_theme take. Either part can be left out to keep it.
 */
export const ThemeInput = z.object({
  preset: z
    .enum(Object.keys(themePresets) as [ThemePreset, ...ThemePreset[]])
    .optional()
    .describe("A tested preset for the main colour (list_theme_presets)."),
  colour: z
    .string()
    .regex(hexPattern, "Give a colour like #0b6b3a")
    .optional()
    .describe("The agency's own main colour, like #0b6b3a. Not with preset."),
  accent: z
    .string()
    .regex(hexPattern, "Give a colour like #cb2043")
    .nullable()
    .optional()
    .describe(
      "A second brand colour, like #cb2043, for decoration only: the bars above the header and footer, icon circles, figures and event dates. Links and buttons keep the main colour. null takes the accent away.",
    ),
});
export type ThemeInput = z.infer<typeof ThemeInput>;

/**
 * The choice to save: the stored theme with the input's changes. The stored
 * theme carries its ramps and the accent's; the save takes only the colours
 * and makes the ramps again.
 */
export function choiceFrom(
  current: Pick<SiteTheme, "preset" | "seed" | "accent">,
  input: ThemeInput,
): ThemeChoice {
  const { preset, colour, accent } = input;
  if (preset && colour)
    throw new ToolError("invalid_input", "Give a preset or a colour, not both.");
  if (!preset && !colour && accent === undefined)
    throw new ToolError("invalid_input", "Give a preset, a colour or an accent.");
  const main = colour
    ? { preset: "custom" as const, seed: colour.toLowerCase() }
    : preset
      ? { preset }
      : { preset: current.preset, ...(current.seed && { seed: current.seed }) };
  const kept = accent === undefined ? current.accent : (accent?.toLowerCase() ?? undefined);
  return { ...main, ...(kept && { accent: kept }) };
}

/** Each step of a ramp as hex. */
export const rampHex = (ramp: Ramp) =>
  Object.fromEntries(rampSteps.map((s) => [s, rgbToHex(ramp[s])]));

const round = (n: number) => Math.round(n * 100) / 100;

/** A primary ramp as hex, with the contrast of each step people read against what it sits on. */
export function describeRamp(ramp: Ramp, seedStep: string | null) {
  const white: [number, number, number] = [255, 255, 255];
  return {
    ramp: rampHex(ramp),
    passes: rampPasses(ramp),
    /** The step the colour itself landed on; null when it had to be darkened to pass. */
    seedStep,
    contrast: rampUses.map(({ step, use }) => ({
      step,
      use,
      againstWhite: round(contrast(ramp[step], white)),
    })),
  };
}

/** An accent as hex beside its main colour: whether it may be published, and whether it stands apart. */
export function describeAccent(primary: Ramp, accent: Accent) {
  return {
    colour: rgbToHex(accent.seed),
    ramp: rampHex(accent.ramp),
    /** False when main-colour links can't be read on the accent's wash: the save is refused. */
    passes: accentPasses(primary, accent.ramp),
    /** Main-colour links on the accent hero wash. */
    linksOnWash: round(contrast(primary["600"], accent.ramp["50"])),
    /** Icons and dates (700) on the accent wash. */
    iconsOnWash: round(contrast(accent.ramp["700"], accent.ramp["50"])),
    /** A warning, not a refusal: the accent is so like the main colour visitors may not see two. */
    tooCloseToMain: accentTooClose(primary["600"], accent.seed),
  };
}
