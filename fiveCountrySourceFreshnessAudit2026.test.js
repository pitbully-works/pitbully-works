import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const countries = {
  JP: JP_COUNTRY_RULES,
  US: US_COUNTRY_RULES,
  GB: GB_COUNTRY_RULES,
  CA: CA_COUNTRY_RULES,
  AU: AU_COUNTRY_RULES,
};

const commonSections = ["investment", "retirement", "healthcare", "tax"];

describe("5-country source / freshness final audit - 2026", () => {
  it("keeps review dates and coverage dates explicit for all five countries", () => {
    for (const rules of Object.values(countries)) {
      expect(rules.meta.verifiedAsOf).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(typeof rules.meta.updateCycle).toBe("string");
      expect(rules.meta.updateCycle.trim().length).toBeGreaterThan(0);

      const coverageByKey = Object.fromEntries(
        rules.meta.coverage.map((row) => [row.key, row])
      );

      for (const section of commonSections) {
        const row = coverageByKey[section];
        expect(row).toBeTruthy();
        expect(row.lastUpdated).toMatch(/^2026-\d{2}-\d{2}$/);
        expect(["implemented", "partial"]).toContain(row.status);
      }
    }
  });

  it("keeps US official-source notes attached to every common calculation section", () => {
    for (const section of commonSections) {
      const sourceNote = US_COUNTRY_RULES[section].sourceNote;
      expect(typeof sourceNote).toBe("string");
      expect(sourceNote.trim().length).toBeGreaterThan(20);
    }

    expect(US_COUNTRY_RULES.investment.sourceNote).toMatch(/IRS/i);
    expect(US_COUNTRY_RULES.retirement.sourceNote).toMatch(/SSA/i);
    expect(US_COUNTRY_RULES.healthcare.sourceNote).toMatch(/CMS/i);
    expect(US_COUNTRY_RULES.tax.sourceNote).toMatch(/IRS/i);
  });

  it("keeps GB, CA and AU section sources on HTTPS official-government pages", () => {
    for (const rules of [GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES]) {
      for (const section of commonSections) {
        const block = rules[section];
        expect(typeof block.sourceName).toBe("string");
        expect(block.sourceName.trim().length).toBeGreaterThan(5);
        expect(block.sourceUrl).toMatch(/^https:\/\//);

        if (block.sourceUrls) {
          for (const url of Object.values(block.sourceUrls)) {
            expect(url).toMatch(/^https:\/\//);
          }
        }
      }
    }
  });

  it("keeps section update dates as valid explicit 2026 review dates", () => {
    for (const rules of Object.values(countries)) {
      for (const row of rules.meta.coverage) {
        expect(row.lastUpdated).toMatch(/^2026-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(`${row.lastUpdated}T00:00:00Z`))).toBe(false);
      }
    }
  });
});
