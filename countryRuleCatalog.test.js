import { describe, expect, it } from "vitest";
import {
  COUNTRY_RULE_SCHEMA_VERSION,
  COUNTRY_RULE_SECTION_KEYS,
  buildCountryRuleCatalog,
  getAllCountryRuleCatalog,
  auditCountryRuleCatalog,
  summarizeCountryRuleCatalog,
} from "./utils/countryRuleCatalog.js";

const COUNTRIES = ["JP", "US", "GB", "CA", "AU"];

describe("5-country common rule catalog", () => {
  it("uses one versioned five-section schema for every country", () => {
    const all = getAllCountryRuleCatalog();
    expect(Object.keys(all)).toEqual(COUNTRIES);
    for (const country of COUNTRIES) {
      expect(all[country].map((row) => row.key)).toEqual(COUNTRY_RULE_SECTION_KEYS);
      expect(all[country]).toHaveLength(5);
      for (const row of all[country]) {
        expect(row.schemaVersion).toBe(COUNTRY_RULE_SCHEMA_VERSION);
        expect(row.country).toBe(country);
      }
    }
  });

  it.each(COUNTRIES)("%s carries common labels, dates and coverage notes", (country) => {
    for (const row of buildCountryRuleCatalog(country)) {
      expect(row.labelJa).toBeTruthy();
      expect(row.labelEn).toBeTruthy();
      expect(row.effective).toBeTruthy();
      expect(row.lastUpdated).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
      expect(row.updateJa).toBeTruthy();
      expect(row.updateEn).toBeTruthy();
      expect(["implemented", "partial", "notImplemented"]).toContain(row.status);
    }
  });

  it("reports no structural metadata gaps in the common catalog", () => {
    expect(auditCountryRuleCatalog()).toEqual([]);
  });


  it.each(COUNTRIES)("%s has an official source for every common section", (country) => {
    for (const row of buildCountryRuleCatalog(country)) {
      expect(row.officialSourceCount).toBeGreaterThan(0);
      expect(row.officialSources[0].url).toMatch(/^https:\/\//);
    }
  });

  it.each(COUNTRIES)("%s exposes limitations for every partial section", (country) => {
    for (const row of buildCountryRuleCatalog(country).filter((item) => item.status === "partial")) {
      expect(row.limitationCount).toBeGreaterThan(0);
      expect(row.limitations[0]).toBeTruthy();
    }
  });

  it("summarizes common-schema completeness without changing calculations", () => {
    for (const country of COUNTRIES) {
      const summary = summarizeCountryRuleCatalog(country);
      expect(summary.sectionCount).toBe(5);
      expect(summary.implementedCount + summary.partialCount + summary.notImplementedCount).toBe(5);
      expect(summary.officialSourceCount).toBeGreaterThanOrEqual(5);
    }
  });

  it("does not pretend missing estate calculators exist", () => {
    for (const country of ["JP", "US", "CA", "AU"]) {
      const estate = buildCountryRuleCatalog(country).find((row) => row.key === "estate");
      expect(estate.hasCalculationSection).toBe(false);
      expect(estate.status).toBe("partial");
    }
    expect(buildCountryRuleCatalog("GB").find((row) => row.key === "estate").hasCalculationSection).toBe(true);
  });

  it("keeps each country's section-specific review dates instead of forcing one global date", () => {
    const au = buildCountryRuleCatalog("AU");
    expect(au.find((row) => row.key === "healthcare").lastUpdated).toBe("2026-08-21");
    expect(au.find((row) => row.key === "investment").lastUpdated).toBe("2026-08-17");
    const ca = buildCountryRuleCatalog("CA");
    expect(ca.find((row) => row.key === "retirement").lastUpdated).toBe("2026-08-20");
    expect(ca.find((row) => row.key === "healthcare").lastUpdated).toBe("2026-08-21");
  });
});
