import { afterEach, describe, expect, it } from "@rstest/core";
import { locale, setLanguage, t } from "../src/i18n";
import { en as messages } from "../src/i18n/messages/en";
import { ms } from "../src/i18n/messages/ms";

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).toSorted();

describe("i18n", () => {
  afterEach(() => setLanguage("en"));

  it("has no empty messages", () => {
    for (const [key, value] of Object.entries(messages)) expect(value, key).not.toBe("");
    for (const [key, value] of Object.entries(ms)) expect(value, key).not.toBe("");
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(t("app.name")).toBe(messages["app.name"]);
    expect(t("notFound.title", { unused: 1 })).toBe("Page not found");
  });

  it("uses the singular form for a count of one", () => {
    expect(t("home.status.waiting", { count: 1 })).toBe("1 change isn't on the site yet");
    expect(t("home.status.waiting", { count: 3 })).toBe("3 changes aren't on the site yet");
    expect(t("status.changes", { count: 1 })).toBe("1 not live");
  });

  it("has every BM message, with the same placeholders as the English", () => {
    for (const [key, value] of Object.entries(messages)) {
      const translated = (ms as Record<string, string | undefined>)[key];
      if (key.endsWith(".one") && translated === undefined) continue;
      expect(translated, key).toBeDefined();
      expect(placeholders(translated ?? ""), key).toEqual(placeholders(value));
    }
  });

  it("speaks BM when set, with BM dates and numbers", async () => {
    await setLanguage("ms");
    expect(t("nav.settings")).toBe("Tetapan");
    // BM has no plural: without a ".one" form, a count of one uses the {count} form.
    expect(t("status.changes", { count: 1 })).toBe("1 belum diterbitkan");
    expect(locale()).toBe("ms-MY");
    expect(document.documentElement.lang).toBe("ms");
  });
});
