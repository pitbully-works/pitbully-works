import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";
import { PROFILE_COUNTRIES, profileMeta } from "./utils/countryProfiles.js";
import { CURRENCY_BY_CODE } from "./ui/locale.js";
import { TRANSLATIONS } from "./translations/index.js";

const RULES = {
  JP: JP_COUNTRY_RULES,
  US: US_COUNTRY_RULES,
  GB: GB_COUNTRY_RULES,
  CA: CA_COUNTRY_RULES,
  AU: AU_COUNTRY_RULES,
};

const REQUIRED_SECTIONS = ["investment", "retirement", "healthcare", "tax"];

describe("5-country final release gate - 2026", () => {
  it("ships exactly the five supported country rule sets with the common contract", () => {
    expect(PROFILE_COUNTRIES).toEqual(["JP", "US", "GB", "CA", "AU"]);
    expect(Object.keys(RULES)).toEqual(PROFILE_COUNTRIES);

    for (const code of PROFILE_COUNTRIES) {
      const rules = RULES[code];

      expect(rules).toBeTruthy();
      expect(rules.meta).toBeTruthy();
      expect(rules.meta.verifiedAsOf).toMatch(/^2026-\d{2}-\d{2}$/);

      const coverageKeys = rules.meta.coverage.map((row) => row.key);
      for (const section of REQUIRED_SECTIONS) {
        expect(rules[section]).toBeTruthy();
        expect(coverageKeys).toContain(section);
      }
    }
  });

  it("keeps country, currency and language wiring internally consistent", () => {
    const expectedCurrency = {
      JP: "JPY",
      US: "USD",
      GB: "GBP",
      CA: "CAD",
      AU: "AUD",
    };

    for (const code of PROFILE_COUNTRIES) {
      const meta = profileMeta(code);

      expect(meta.baseCurrency).toBe(expectedCurrency[code]);
      expect(CURRENCY_BY_CODE[meta.baseCurrency]).toBeTruthy();
      expect(TRANSLATIONS[meta.language]).toBeTruthy();
    }
  });

  it("keeps all five country rule objects independent rather than aliased", () => {
    const objects = PROFILE_COUNTRIES.map((code) => RULES[code]);
    expect(new Set(objects).size).toBe(5);

    for (let i = 0; i < objects.length; i += 1) {
      for (let j = i + 1; j < objects.length; j += 1) {
        expect(objects[i]).not.toBe(objects[j]);
        expect(objects[i].investment).not.toBe(objects[j].investment);
        expect(objects[i].retirement).not.toBe(objects[j].retirement);
        expect(objects[i].healthcare).not.toBe(objects[j].healthcare);
        expect(objects[i].tax).not.toBe(objects[j].tax);
      }
    }
  });
});
