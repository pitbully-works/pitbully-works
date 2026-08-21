import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 government super co-contribution", () => {
  const tax = AU_COUNTRY_RULES.tax;
  const inv = AU_COUNTRY_RULES.investment;

  it("uses the 2026-27 income thresholds", () => {
    expect(tax.superannuation.coContribution.lowerIncomeThreshold).toBe(49293);
    expect(tax.superannuation.coContribution.higherIncomeThreshold).toBe(64293);
    expect(tax.superannuation.coContribution.maximum).toBe(500);
  });

  it("pays 50% of after-tax contribution up to A$500 below the lower threshold", () => {
    expect(tax.calculateGovernmentSuperCoContribution(40000, 600, true)).toBeCloseTo(300, 6);
    expect(tax.calculateGovernmentSuperCoContribution(40000, 1000, true)).toBeCloseTo(500, 6);
    expect(tax.calculateGovernmentSuperCoContribution(40000, 2000, true)).toBeCloseTo(500, 6);
  });

  it("phases out between A$49,293 and A$64,293 and is zero at the upper threshold", () => {
    expect(tax.calculateGovernmentSuperCoContribution(56793, 1000, true)).toBeCloseTo(250, 6);
    expect(tax.calculateGovernmentSuperCoContribution(64293, 1000, true)).toBe(0);
  });

  it("does not apply without explicit eligibility confirmation", () => {
    expect(tax.calculateGovernmentSuperCoContribution(40000, 1000, false)).toBe(0);
  });

  it("applies the A$20 minimum when a positive entitlement is below A$20", () => {
    expect(tax.calculateGovernmentSuperCoContribution(64000, 1000, true)).toBe(20);
  });

  it("adds the government payment to projected super without contribution tax", () => {
    const accounts = {
      superannuation: { currentValue: 0, annualContribution: 1000, expectedReturnPct: 0, contributionEndAge: 66, withdrawalTaxPct: 0 },
      investmentAccount: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 66, withdrawalTaxPct: 0 },
      cashSavings: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 66, withdrawalTaxPct: 0 },
    };
    const base = {
      currentAge: 65, retireAge: 70, deathAge: 66, accounts,
      annualWithdrawalNeeded: 0, annualSalary: 0, voluntaryConcessional: 0,
      contributionsTaxRate: 0.15, earningsTaxAccumulation: 0.15,
      div293TaxAnnual: 0, div293PaidFrom: "super", listoAnnual: 0,
      carryForwardPriorYearBalance: 0, carryForwardAvailableUnusedCap: 0,
    };
    const without = inv.simulateGrowth({ ...base, coContributionAnnual: 0 });
    const withCo = inv.simulateGrowth({ ...base, coContributionAnnual: 500 });
    expect(withCo.finalValue - without.finalValue).toBeCloseTo(500, 6);
  });
});
