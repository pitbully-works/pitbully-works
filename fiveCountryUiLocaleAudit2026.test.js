import { describe, it, expect } from "vitest";
import {
  PROFILE_COUNTRIES,
  profileMeta,
} from "./utils/countryProfiles.js";
import {
  CURRENCY_BY_CODE,
  CATEGORY_LABELS,
  getCategoryLabel,
} from "./ui/locale.js";
import {
  TRANSLATIONS,
  translateWith,
} from "./translations/index.js";

describe("5-country UI / locale / currency final audit - 2026", () => {
  const expectedMeta = {
    JP: { baseCurrency: "JPY", language: "ja" },
    US: { baseCurrency: "USD", language: "en" },
    GB: { baseCurrency: "GBP", language: "en-GB" },
    CA: { baseCurrency: "CAD", language: "en" },
    AU: { baseCurrency: "AUD", language: "en" },
  };

  it("keeps each country bound to its intended language and planning currency", () => {
    expect(PROFILE_COUNTRIES).toEqual(["JP", "US", "GB", "CA", "AU"]);

    for (const code of PROFILE_COUNTRIES) {
      expect(profileMeta(code)).toEqual(expectedMeta[code]);
    }
  });

  it("keeps the five planning currencies and symbols distinct", () => {
    expect(CURRENCY_BY_CODE.JPY).toEqual({ symbol: "¥", locale: "ja-JP" });
    expect(CURRENCY_BY_CODE.USD).toEqual({ symbol: "$", locale: "en-US" });
    expect(CURRENCY_BY_CODE.GBP).toEqual({ symbol: "£", locale: "en-GB" });
    expect(CURRENCY_BY_CODE.CAD).toEqual({ symbol: "C$", locale: "en-CA" });
    expect(CURRENCY_BY_CODE.AUD).toEqual({ symbol: "A$", locale: "en-AU" });

    const symbols = PROFILE_COUNTRIES.map(
      (code) => CURRENCY_BY_CODE[expectedMeta[code].baseCurrency].symbol
    );
    expect(new Set(symbols).size).toBe(5);
  });

  it("keeps common UI category labels country-specific and complete", () => {
    for (const [key, labels] of Object.entries(CATEGORY_LABELS)) {
      for (const code of PROFILE_COUNTRIES) {
        expect(typeof labels[code]).toBe("string");
        expect(labels[code].trim().length).toBeGreaterThan(0);
        expect(getCategoryLabel(key, code)).toBe(labels[code]);
      }
    }

    expect(getCategoryLabel("investmentTaxAdvantaged", "JP")).toMatch(/NISA/);
    expect(getCategoryLabel("investmentTaxAdvantaged", "GB")).toMatch(/ISA/);
    expect(getCategoryLabel("investmentTaxAdvantaged", "CA")).toMatch(/TFSA/);
    expect(getCategoryLabel("retirementAccount", "US")).toMatch(/IRA/);
    expect(getCategoryLabel("retirementAccount", "AU")).toMatch(/Superannuation/);
  });

  it("keeps Japanese, general English and British English translation paths separated", () => {
    expect(TRANSLATIONS.ja).toBeTruthy();
    expect(TRANSLATIONS.en).toBeTruthy();
    expect(TRANSLATIONS["en-GB"]).toBeTruthy();

    expect(translateWith("ja", "rulesVerifiedLabel")).toContain("制度");
    expect(translateWith("en", "rulesVerifiedLabel")).toMatch(/Rules verified/i);
    expect(translateWith("en-GB", "rulesVerifiedLabel")).toMatch(/Rules verified/i);

    // GB must use its own override path while still inheriting the complete English dictionary.
    expect(translateWith("en-GB", "disclaimerBanner")).toMatch(/FCA-regulated/i);
    expect(translateWith("en-GB", "caYes")).toBe("Yes");

    // Missing keys must remain visible as keys rather than silently becoming Japanese text.
    expect(translateWith("en", "__missing_locale_key__")).toBe("__missing_locale_key__");
    expect(translateWith("en-GB", "__missing_locale_key__")).toBe("__missing_locale_key__");
  });
});
