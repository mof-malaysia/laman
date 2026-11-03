/** Site colours for agents: the choice they give, and the ramp it makes, as they read it. */
import {
  contrast,
  hexPattern,
  type Ramp,
  rampPasses,
  rampSteps,
  rampUses,
  rgbToHex,
  themePresets,
  type ThemePreset,
} from "@fiscal-sb/blocks";
import { z } from "zod";

/** A preset or the agency's own colour: what preview_theme and set_theme take. */
export const ThemeInput = z.object({
  preset: z.enum(Object.keys(themePresets) as [ThemePreset, ...ThemePreset[]]).optional(),
  colour: z.string().regex(hexPattern, "Give a colour like #0b6b3a").optional(),
});

/** Each step of a ramp as hex. */
export const rampHex = (ramp: Ramp) =>
  Object.fromEntries(rampSteps.map((s) => [s, rgbToHex(ramp[s])]));

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
      againstWhite: Math.round(contrast(ramp[step], white) * 100) / 100,
    })),
  };
}
