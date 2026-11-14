import { describe, expect, it } from "@rstest/core";
import {
  accentFrom,
  accentPasses,
  accentTooClose,
  contrast,
  ftdsPrimary,
  hexToRgb,
  rampFor,
  rampPasses,
  rampFrom,
  rampSteps,
  rgbToHex,
  PageContent,
  themeCss,
  themeOf,
  themeSample,
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
    expect(themeCss({ primary: ftdsPrimary })).toMatch(
      /^--_primary-50:239 246 255;.*--_primary-950:23 37 84;$/,
    );
  });

  it("writes nothing for the accent when there isn't one", () => {
    expect(themeCss({ primary: ftdsPrimary })).not.toContain("accent");
    expect(themeOf({ preset: "ftds" })).not.toHaveProperty("accent");
  });

  it("writes the accent's ramp, its colour as given and the bars", () => {
    const accent = accentFrom("#CB2043");
    expect(accent.seed).toEqual([203, 32, 67]);
    const css = themeCss({ primary: ftdsPrimary, accent });
    expect(css).toContain("--_accent-50:");
    expect(css).toContain("--_accent-brand:203 32 67;--_accent-bar:4px;");
    expect(themeOf({ preset: "teal", accent: "#CB2043" }).accent).toBe("#cb2043");
  });

  it("keeps primary links readable on the accent wash", () => {
    const primary = rampFrom(hexToRgb("#044d79")).ramp;
    expect(accentPasses(primary, accentFrom("#cb2043").ramp)).toBe(true);
    expect(accentPasses(primary, accentFrom("#facc15").ramp)).toBe(true);
    // A wash as dark as the links fails.
    const dark = { ...accentFrom("#cb2043").ramp, "50": primary["500"] };
    expect(accentPasses(primary, dark)).toBe(false);
  });

  it("warns when the accent is too like primary", () => {
    expect(accentTooClose([37, 99, 235], [59, 130, 246])).toBe(true);
    expect(accentTooClose([4, 77, 121], [203, 32, 67])).toBe(false);
    expect(accentTooClose([80, 80, 80], [90, 90, 90])).toBe(true);
  });

  it("builds a sample page the schemas accept, with events from today on", () => {
    const now = Date.parse("2026-11-14T02:00:00Z");
    const { content, upcoming } = themeSample(now);
    expect(PageContent.safeParse(content).success).toBe(true);
    expect(content.blocks.map((b) => b.type)).toContain("upcomingEvents");
    const events = Object.values(upcoming)[0]!;
    expect(events.today).toBe("2026-11-14");
    expect(events.items[0]!.event!.start.slice(0, 10)).toBe("2026-11-14");
    // Late at night in Malaysia, today is still today.
    const late = Object.values(themeSample(Date.parse("2026-11-14T15:30:00Z")).upcoming)[0]!;
    expect(late.items[0]!.event!.start.slice(0, 10)).toBe(late.today);
  });
});
