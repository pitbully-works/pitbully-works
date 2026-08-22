import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 118-121 - Age Pension real-estate income", () => {
  const r = AU_COUNTRY_RULES.retirement;

  it("counts gross rent less allowed property deductions", () => {
    expect(r.getRealEstateAssessableIncomeAnnual({
      grossRentAnnual: 30000,
      loanInterestAnnual: 8000,
      ratesAnnual: 2500,
      maintenanceAnnual: 1500,
    })).toBe(18000);
  });

  it("floors each rental-property loss at zero", () => {
    expect(r.getRealEstateAssessableIncomeAnnual({
      grossRentAnnual: 10000,
      loanInterestAnnual: 12000,
      ratesAnnual: 2000,
    })).toBe(0);
  });

  it("does not offset one property's loss against another property's assessable income", () => {
    expect(r.getRealEstatePortfolioAssessableIncomeAnnual([
      { grossRentAnnual: 10000, loanInterestAnnual: 15000 },
      { grossRentAnnual: 20000, ratesAnnual: 2000 },
    ])).toBe(18000);
  });

  it("adds real-estate income separately from financial-asset deeming", () => {
    const base = r.getAssessableIncomeAnnual(10000, 0, "single", 0, 0, 0);
    const withProperty = r.getAssessableIncomeAnnual(10000, 0, "single", 0, 0, 12000);
    expect(withProperty - base).toBe(12000);
  });
});
