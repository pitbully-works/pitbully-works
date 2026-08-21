import { describe, expect, it } from "vitest";
import { COUNTRY_RULES, UNIMPLEMENTED_COUNTRY_RULES, getCountryRules } from "./countryRules/index.js";
import { PROFILE_COUNTRIES, normalizeProfileCountry, profileMeta, targetCountryFromKakeibo } from "./utils/countryProfiles.js";
import { CATEGORY_LABELS, getCategoryLabel } from "./ui/locale.js";

const EXPECTED_META = {
  JP: { baseCurrency: "JPY", language: "ja" },
  US: { baseCurrency: "USD", language: "en" },
  GB: { baseCurrency: "GBP", language: "en-GB" },
  CA: { baseCurrency: "CAD", language: "en" },
  AU: { baseCurrency: "AUD", language: "en" },
};

describe("five-country final contamination guards", () => {
  it("profile countries and rule countries stay exactly aligned", () => {
    expect(Object.keys(COUNTRY_RULES)).toEqual(PROFILE_COUNTRIES);
  });

  it.each(PROFILE_COUNTRIES)("%s keeps its own currency/language metadata", (country) => {
    expect(profileMeta(country)).toEqual(EXPECTED_META[country]);
  });

  it.each(PROFILE_COUNTRIES)("%s resolves its own rules even with lowercase input", (country) => {
    expect(getCountryRules(country)).toBe(COUNTRY_RULES[country]);
    expect(getCountryRules(country.toLowerCase())).toBe(COUNTRY_RULES[country]);
  });


  it.each(PROFILE_COUNTRIES)("%s profile normalization accepts lowercase without changing country", (country) => {
    expect(normalizeProfileCountry(country.toLowerCase())).toBe(country);
  });

  it("explicit unknown Kakeibo country is rejected instead of becoming JP", () => {
    expect(targetCountryFromKakeibo({ countryCode: "XX" })).toBeNull();
    expect(targetCountryFromKakeibo({ countryCode: "us" })).toBe("US");
    expect(targetCountryFromKakeibo({})).toBe("JP"); // legacy payload compatibility
  });

  it("unknown country never falls back to Japanese statutory rules", () => {
    expect(getCountryRules("XX")).toBe(UNIMPLEMENTED_COUNTRY_RULES);
    expect(getCountryRules("")).toBe(UNIMPLEMENTED_COUNTRY_RULES);
    expect(getCountryRules(null)).toBe(UNIMPLEMENTED_COUNTRY_RULES);
    expect(getCountryRules("XX")).not.toBe(COUNTRY_RULES.JP);
  });

  it.each(PROFILE_COUNTRIES)("%s has an explicit label for every shared category", (country) => {
    for (const [key, labels] of Object.entries(CATEGORY_LABELS)) {
      expect(labels[country], `${country}:${key}`).toBeTruthy();
      expect(getCategoryLabel(key, country)).toBe(labels[country]);
    }
  });

  it("unknown country does not silently receive Japanese category labels", () => {
    expect(getCategoryLabel("investmentTaxAdvantaged", "XX")).toBe("investmentTaxAdvantaged");
    expect(getCategoryLabel("retirementAccount", "XX")).toBe("retirementAccount");
  });
});
