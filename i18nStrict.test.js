import { describe, it, expect } from "vitest";
import { TRANSLATIONS, translateWith } from "./translations/index.js";

describe("strict i18n regression", () => {
  it("ja/en have exactly the same keys", () => {
    expect(Object.keys(TRANSLATIONS.ja).sort()).toEqual(Object.keys(TRANSLATIONS.en).sort());
  });

  it("en-GB inherits every English key", () => {
    for (const key of Object.keys(TRANSLATIONS.en)) {
      expect(TRANSLATIONS["en-GB"][key]).toBeDefined();
    }
  });

  it("English locales never fall back to Japanese when a key is missing", () => {
    const jaOnlyKey = "__strict_i18n_ja_only__";
    TRANSLATIONS.ja[jaOnlyKey] = "日本語だけ";
    try {
      expect(translateWith("en", jaOnlyKey)).toBe(jaOnlyKey);
      expect(translateWith("en-GB", jaOnlyKey)).toBe(jaOnlyKey);
      expect(translateWith("en-CA", jaOnlyKey)).toBe(jaOnlyKey);
      expect(translateWith("en-AU", jaOnlyKey)).toBe(jaOnlyKey);
    } finally {
      delete TRANSLATIONS.ja[jaOnlyKey];
    }
  });

  it("Japanese locale still uses Japanese", () => {
    const key = Object.keys(TRANSLATIONS.ja)[0];
    expect(translateWith("ja", key)).toBe(TRANSLATIONS.ja[key]);
  });
});
