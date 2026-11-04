import { afterEach, describe, expect, it } from "@rstest/core";
import { blockFields, blocks, templates } from "@fiscal-sb/blocks";
import { rt, setLanguage } from "../src/i18n";
import { registryMs } from "../src/i18n/messages/registry-ms";
import { blockLabel, fieldLabelAt, localBlockFields, specStrings } from "../src/i18n/registry";

/** Every string the admin shows from the block registry and the page templates. */
function registryStrings(): Set<string> {
  const out = new Set<string>();
  for (const block of blocks) {
    out.add(block.label);
    out.add(block.description);
    for (const text of specStrings(blockFields(block.type))) out.add(text);
  }
  for (const template of Object.values(templates)) {
    out.add(template.name);
    out.add(template.description);
  }
  return out;
}

describe("registry text in BM", () => {
  afterEach(() => setLanguage("en"));

  it("has BM for every block, field, option and template string", () => {
    const missing = [...registryStrings()].filter((text) => !(text in registryMs));
    expect(missing, "add these to src/i18n/messages/registry-ms.ts").toEqual([]);
  });

  it("has no BM for strings the registry no longer has", () => {
    const strings = registryStrings();
    const stale = Object.keys(registryMs).filter((text) => !strings.has(text));
    expect(stale, "remove these from src/i18n/messages/registry-ms.ts").toEqual([]);
  });

  it("has no empty translations", () => {
    for (const [text, translated] of Object.entries(registryMs))
      expect(translated, text).not.toBe("");
  });

  it("speaks the admin's language", async () => {
    expect(rt("Line under the actions")).toBe("Line under the actions");
    await setLanguage("ms");
    expect(rt("Line under the actions")).toBe("Ayat di bawah butang");
    expect(blockLabel("pageIntro")).toBe("Pengenalan halaman");
    expect(rt("Not a registry string")).toBe("Not a registry string");
  });

  it("translates field specs, their options and nested fields", async () => {
    await setLanguage("ms");
    const hero = localBlockFields("hero");
    expect(hero.find((f) => f.name === "footnote")?.title).toBe("Ayat di bawah butang");
    expect(hero.find((f) => f.name === "layout")?.options?.map((o) => o.label)).toContain(
      "Teks sahaja",
    );
    expect(fieldLabelAt("hero", "primaryAction.label")).toBe("Label");
    expect(fieldLabelAt("faq", "items.2.question")).toBe("Soalan");
  });
});
