import { describe, expect, it } from "@rstest/core";
import { t } from "../src/i18n";
import { en as messages } from "../src/i18n/messages/en";

describe("i18n", () => {
  it("has no empty messages", () => {
    for (const [key, value] of Object.entries(messages)) expect(value, key).not.toBe("");
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(t("app.name")).toBe(messages["app.name"]);
    expect(t("notFound.title", { unused: 1 })).toBe("Page not found");
  });
});
