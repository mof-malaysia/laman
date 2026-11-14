// The pure functions content migrations run (docs/upgrades.md § 4).
import { describe, expect, it } from "@rstest/core";
import { keepPageIntroTone, moveToAppearance } from "../src/db/migrations.js";

describe("0002_page_intro_tone", () => {
  const intro = (props: Record<string, unknown>) => ({ id: "a", type: "pageIntro", props });

  it("keeps an intro saved without a tone on Well", () => {
    const doc = { ms: { title: "Hubungi", blocks: [intro({ title: "Hubungi" })] } };
    expect(keepPageIntroTone(doc)).toEqual({
      ms: { title: "Hubungi", blocks: [intro({ title: "Hubungi", tone: "well" })] },
    });
  });

  it("leaves an intro's chosen tone, and every other block, alone", () => {
    const doc = {
      ms: {
        title: "Hubungi",
        blocks: [intro({ title: "Hubungi", tone: "paper" }), { id: "b", type: "prose", props: {} }],
      },
      en: { title: "Contact", blocks: [intro({ title: "Contact", tone: "well" })] },
    };
    expect(keepPageIntroTone(doc)).toEqual(doc);
  });

  it("finds intros in every language of the page", () => {
    const doc = { ms: { blocks: [intro({})] }, en: { blocks: [intro({})] } };
    expect(keepPageIntroTone(doc)).toEqual({
      ms: { blocks: [intro({ tone: "well" })] },
      en: { blocks: [intro({ tone: "well" })] },
    });
  });
});

describe("0003_settings_appearance", () => {
  it("moves Identity's switches into Appearance, keeping what was off", () => {
    const doc = {
      identity: { siteName: "Laman", agencyName: "", navbarName: false, footerLogo: true },
      phase: { phase: "beta", feedbackUrl: "/maklum-balas" },
    };
    expect(moveToAppearance(doc)).toEqual({
      identity: { siteName: "Laman", agencyName: "" },
      phase: { phase: "beta", feedbackUrl: "/maklum-balas" },
      appearance: { masthead: true, navbarName: false, footerLogo: true },
    });
  });

  it("turns on switches settings saved before them never had", () => {
    expect(moveToAppearance({ identity: { siteName: "Laman" } })).toEqual({
      identity: { siteName: "Laman" },
      appearance: { masthead: true, navbarName: true, footerLogo: true },
    });
  });

  it("leaves settings that already have Appearance alone", () => {
    const doc = {
      identity: { siteName: "Laman" },
      appearance: { masthead: false, navbarName: true, footerLogo: true },
    };
    expect(moveToAppearance(doc)).toEqual(doc);
  });
});
