import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";

describe("JP critical statutory limits", () => {
  it("keeps 2026 NISA annual and lifetime limits", () => {
    expect(JP_COUNTRY_RULES.investment.annualInstallmentLimit).toBe(1200000);
    expect(JP_COUNTRY_RULES.investment.annualGrowthLimit).toBe(2400000);
    expect(JP_COUNTRY_RULES.investment.growthLifetimeLimit).toBe(12000000);
    expect(JP_COUNTRY_RULES.investment.taxFreeInvestmentLimit).toBe(18000000);
  });
});
