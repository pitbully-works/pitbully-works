import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 22 — GB Junior ISA and child pension", () => {
  const inv = GB_COUNTRY_RULES.investment;

  it("protects the 2026/27 Junior ISA annual limit and age lock", () => {
    expect(inv.juniorIsa.annualContributionLimit).toBe(9000);
    expect(inv.juniorIsa.accessAge).toBe(18);
    expect(inv.juniorIsa.unusedAllowanceCarryForward).toBe(false);
    expect(inv.getJuniorIsaEligibleContribution(12000, 10)).toBe(9000);
    expect(inv.getJuniorIsaEligibleContribution(5000, 18)).toBe(0);
    expect(inv.getJuniorIsaRemaining(2500, 10)).toBe(6500);
  });

  it("projects Junior ISA contributions only until age 18", () => {
    expect(inv.projectJuniorIsaTo18({
      currentAge: 16,
      currentValue: 1000,
      annualContribution: 9000,
      expectedReturnPct: 0,
    })).toBe(19000);
  });

  it("protects the child pension no-earnings relief floor", () => {
    expect(inv.juniorSipp.grossReliefFloorWithoutEarnings).toBe(3600);
    expect(inv.juniorSipp.netReliefFloorWithoutEarnings).toBe(2880);
    expect(inv.juniorSipp.reliefAtSourceRate).toBe(0.20);
    expect(inv.getJuniorSippTaxRelievedGrossLimit(0)).toBe(3600);
    expect(inv.getJuniorSippNetPaymentForGross(3600, 0, 10)).toBe(2880);
    expect(inv.getJuniorSippReliefAtSource(3600, 0, 10)).toBe(720);
  });

  it("caps tax-relieved child pension contributions by earnings and annual allowance", () => {
    expect(inv.getJuniorSippTaxRelievedGrossLimit(12000)).toBe(12000);
    expect(inv.getJuniorSippTaxRelievedGrossLimit(100000)).toBe(60000);
    expect(inv.getJuniorSippEligibleGrossContribution(20000, 12000, 10)).toBe(12000);
    expect(inv.getJuniorSippEligibleGrossContribution(3600, 0, 18)).toBe(0);
  });

  it("protects the future minimum pension access age used for a child account", () => {
    expect(inv.juniorSipp.normalMinimumPensionAge).toBe(57);
  });

  it("projects child pension gross contributions separately from adult assets", () => {
    expect(inv.projectJuniorSipp({
      currentAge: 16,
      currentValue: 1000,
      annualGrossContribution: 3600,
      relevantUkEarnings: 0,
      expectedReturnPct: 0,
      projectToAge: 18,
    })).toBe(8200);
  });
});
