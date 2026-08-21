import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU downsizer contribution", () => {
  const inv = AU_COUNTRY_RULES.investment;

  it("uses the A$300,000 per-person maximum", () => {
    expect(inv.limits.downsizerContributionMax).toBe(300000);
    expect(inv.getDownsizerContribution(60, true, 450000)).toBe(300000);
  });

  it("is available from age 55", () => {
    expect(inv.getDownsizerContribution(54, true, 100000)).toBe(0);
    expect(inv.getDownsizerContribution(55, true, 100000)).toBe(100000);
  });

  it("requires explicit eligibility confirmation", () => {
    expect(inv.getDownsizerContribution(60, false, 100000)).toBe(0);
  });

  it("does not consume the ordinary non-concessional cap", () => {
    expect(inv.getEffectiveNonConcessionalCap(60, 500000, false, 0)).toBe(130000);
    expect(inv.getDownsizerContribution(60, true, 300000)).toBe(300000);
  });

  it("projects the downsizer amount once rather than every year", () => {
    const accounts = {
      superannuation: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
      investmentAccount: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
      cashSavings: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
    };
    const base = {
      currentAge: 60, retireAge: 70, deathAge: 62, accounts, annualWithdrawalNeeded: 0,
      annualSalary: 0, voluntaryConcessional: 0, contributionsTaxRate: 0.15, earningsTaxAccumulation: 0.15,
      div293TaxAnnual: 0, div293PaidFrom: "super", listoAnnual: 0, coContributionAnnual: 0,
      carryForwardPriorYearBalance: 0, carryForwardAvailableUnusedCap: 0,
      bringForwardUseAtoCap: false, bringForwardAvailableCap: 0, bringForwardOneOffContribution: 0,
    };
    const without = inv.simulateGrowth({ ...base, downsizerEligible: false, downsizerContribution: 300000 });
    const withDownsizer = inv.simulateGrowth({ ...base, downsizerEligible: true, downsizerContribution: 300000 });
    expect(withDownsizer.finalValue - without.finalValue).toBeCloseTo(300000, 6);
  });

  it("keeps the remaining qualification rules explicitly manual", () => {
    expect(inv.notImplemented.join(" / ")).toMatch(/Downsizer contribution/);
    expect(inv.notImplemented.join(" / ")).toMatch(/10年/);
  });
});
