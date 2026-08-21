import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 non-concessional bring-forward arrangement", () => {
  const inv = AU_COUNTRY_RULES.investment;

  it("derives the structural cap from the transfer balance cap and annual NCC cap", () => {
    expect(inv.getBringForwardStructuralCap(1839999)).toBe(390000);
    expect(inv.getBringForwardStructuralCap(1840000)).toBe(260000);
    expect(inv.getBringForwardStructuralCap(1970000)).toBe(130000);
    expect(inv.getBringForwardStructuralCap(2100000)).toBe(0);
  });

  it("uses the ordinary annual cap unless the user explicitly selects the ATO bring-forward figure", () => {
    expect(inv.getEffectiveNonConcessionalCap(60, 500000, false, 390000)).toBe(130000);
    expect(inv.getEffectiveNonConcessionalCap(60, 500000, true, 390000)).toBe(390000);
  });

  it("caps the entered ATO amount at the statutory maximum implied by prior TSB", () => {
    expect(inv.getEffectiveNonConcessionalCap(60, 1900000, true, 390000)).toBe(260000);
  });

  it("does not apply bring-forward from age 75 onward", () => {
    expect(inv.getEffectiveNonConcessionalCap(75, 500000, true, 390000)).toBe(130000);
  });

  it("applies only the one-off amount that fits after the normal annual contribution", () => {
    expect(inv.getBringForwardOneOffApplied(60, 500000, true, 390000, 130000, 400000)).toBe(260000);
    expect(inv.getNonConcessionalRemaining(130000, 60, 500000, true, 390000, 200000)).toBe(60000);
  });

  it("projects bring-forward once rather than repeating it in later years", () => {
    const accounts = {
      superannuation: { currentValue: 0, annualContribution: 130000, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
      investmentAccount: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
      cashSavings: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 70, withdrawalTaxPct: 0 },
    };
    const base = {
      currentAge: 60, retireAge: 70, deathAge: 62, accounts, annualWithdrawalNeeded: 0,
      annualSalary: 0, voluntaryConcessional: 0, contributionsTaxRate: 0.15, earningsTaxAccumulation: 0.15,
      div293TaxAnnual: 0, div293PaidFrom: "super", listoAnnual: 0, coContributionAnnual: 0,
      carryForwardPriorYearBalance: 500000, carryForwardAvailableUnusedCap: 0,
      bringForwardUseAtoCap: true, bringForwardAvailableCap: 390000,
    };
    const without = inv.simulateGrowth({ ...base, bringForwardOneOffContribution: 0 });
    const withOneOff = inv.simulateGrowth({ ...base, bringForwardOneOffContribution: 260000 });
    expect(withOneOff.finalValue - without.finalValue).toBeCloseTo(260000, 6);
    expect(inv.notImplemented.join(" / ")).toMatch(/bring-forward期間/);
  });
});
