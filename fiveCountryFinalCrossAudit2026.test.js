import { describe, it, expect } from "vitest";
import {
  COUNTRY_RULES,
  UNIMPLEMENTED_COUNTRY_RULES,
  getCountryRules,
} from "./countryRules/index.js";

describe("5-country final cross audit - 2026-08", () => {
  const countries = ["JP", "US", "GB", "CA", "AU"];
  const commonSections = ["investment", "retirement", "healthcare", "tax"];

  it("exposes exactly the five supported countries", () => {
    expect(Object.keys(COUNTRY_RULES).sort()).toEqual([...countries].sort());
    for (const code of countries) {
      expect(getCountryRules(code)).toBe(COUNTRY_RULES[code]);
      expect(getCountryRules(` ${code.toLowerCase()} `)).toBe(COUNTRY_RULES[code]);
    }
  });

  it("never falls back to JP for an unsupported country", () => {
    const unknown = getCountryRules("ZZ");
    expect(unknown).toBe(UNIMPLEMENTED_COUNTRY_RULES);
    expect(unknown).not.toBe(COUNTRY_RULES.JP);
    for (const section of commonSections) {
      expect(unknown[section].implemented).toBe(false);
    }
  });

  it("keeps review metadata and coverage coherent in all five countries", () => {
    for (const code of countries) {
      const rules = COUNTRY_RULES[code];

      expect(rules.meta.verifiedAsOf).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(typeof rules.meta.effectivePeriod).toBe("string");
      expect(rules.meta.effectivePeriod.length).toBeGreaterThan(0);
      expect(Array.isArray(rules.meta.coverage)).toBe(true);

      const keys = rules.meta.coverage.map((row) => row.key);
      expect(new Set(keys).size).toBe(keys.length);

      for (const section of commonSections) {
        expect(keys).toContain(section);
      }

      for (const row of rules.meta.coverage) {
        expect(["implemented", "partial"]).toContain(row.status);
        expect(row.lastUpdated).toMatch(/^2026-\d{2}-\d{2}$/);
        expect(typeof row.effective).toBe("string");
        expect(row.effective.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps all common calculation sections active", () => {
    for (const code of countries) {
      for (const section of commonSections) {
        expect(COUNTRY_RULES[code][section]).toBeTruthy();
        expect(COUNTRY_RULES[code][section].implemented).toBe(true);
      }
    }
  });

  it("keeps country calculation sections isolated from one another", () => {
    for (let i = 0; i < countries.length; i += 1) {
      for (let j = i + 1; j < countries.length; j += 1) {
        const a = COUNTRY_RULES[countries[i]];
        const b = COUNTRY_RULES[countries[j]];
        for (const section of commonSections) {
          expect(a[section]).not.toBe(b[section]);
        }
      }
    }
  });

  it("preserves independent verified-as-of dates", () => {
    expect(COUNTRY_RULES.JP.meta.verifiedAsOf).toBe("2026-08-17");
    expect(COUNTRY_RULES.US.meta.verifiedAsOf).toBe("2026-08-17");
    expect(COUNTRY_RULES.GB.meta.verifiedAsOf).toBe("2026-08-22");
    expect(COUNTRY_RULES.CA.meta.verifiedAsOf).toBe("2026-08-22");
    expect(COUNTRY_RULES.AU.meta.verifiedAsOf).toBe("2026-08-23");
  });
});
