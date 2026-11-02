import { describe, expect, it } from "@rstest/core";
import {
  contrast,
  ftdsPrimary,
  hexToRgb,
  rampCss,
  rampFor,
  rampPasses,
  rampFrom,
  rampSteps,
  rgbToHex,
  themePresets,
} from "../src/index.js";

const lightness = (rgb: [number, number, number]) => contrast(rgb, [0, 0, 0]);

describe("site colours", () => {
  it("FTDS Blue passes its own checks", () => {
    expect(rampPasses(ftdsPrimary)).toBe(true);
    // Links one step lighter are too faint on white.
    expect(rampPasses({ ...ftdsPrimary, "600": ftdsPrimary["500"] })).toBe(false);
  });

  it("measures contrast as WCAG does", () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrast([37, 99, 235], [255, 255, 255])).toBeCloseTo(5.17, 1);
  });

  it.each(Object.keys(themePresets))("preset %s passes", (preset) => {
    const { ramp } = rampFor(preset as keyof typeof themePresets);
    expect(rampPasses(ramp)).toBe(true);
  });

  it.each([
    ["yellow", "#facc15"],
    ["light green", "#86efac"],
    ["near black", "#111418"],
    ["grey", "#808080"],
    ["mid blue", "#3b82f6"],
    ["orange", "#f97316"],
    ["near white", "#fafafa"],
    ["red", "#ff0000"],
  ])("a %s seed makes a passing ramp, light to dark", (_name, hex) => {
    const { ramp } = rampFrom(hexToRgb(hex));
    expect(rampPasses(ramp)).toBe(true);
    for (let i = 1; i < rampSteps.length; i++)
      expect(lightness(ramp[rampSteps[i]!])).toBeLessThanOrEqual(
        lightness(ramp[rampSteps[i - 1]!]),
      );
  });

  it("keeps a seed that already passes exactly", () => {
    const { ramp, seedStep } = rampFrom(hexToRgb("#0b6b3a"));
    expect(seedStep).not.toBeNull();
    expect(rgbToHex(ramp[seedStep!])).toBe("#0b6b3a");
  });

  it("uses a light seed for washes and darkens what people read", () => {
    const { ramp, seedStep } = rampFrom(hexToRgb("#facc15"));
    expect(seedStep && rampSteps.indexOf(seedStep)).toBeLessThan(rampSteps.indexOf("500"));
    expect(contrast(ramp["600"], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });

  it("writes the primitives FTDS reads", () => {
    expect(rampCss(ftdsPrimary)).toMatch(/^--_primary-50:239 246 255;.*--_primary-950:23 37 84;$/);
  });
});
