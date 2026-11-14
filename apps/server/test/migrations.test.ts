// The pure functions content migrations run (docs/upgrades.md § 4).
import { describe, expect, it } from "@rstest/core";
import { keepPageIntroTone } from "../src/db/migrations.js";

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
