import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const tax = AU_COUNTRY_RULES.tax;

describe("AU Medicare levy family low-income reduction (2025-26 thresholds carried into 2026-27)", () => {
  it("uses the enacted ordinary family threshold A$47,238 and A$4,338 per dependant", () => {
    const f = tax.medicareLevy.lowIncomeThresholds.ordinaryFamily;
    expect(f.lower).toBe(47238);
    expect(f.dependentIncrement).toBe(4338);
  });

  it("reduces levy to zero when combined family income is at or below the family threshold", () => {
    expect(tax.calculateMedicareLevy(40000, { family: true, spouseTaxableIncome: 7000 })).toBe(0);
  });

  it("adds the dependant increment before applying the family test", () => {
    // 47,238 + 4,338 = 51,576, so family income A$51,000 remains levy-free.
    expect(tax.calculateMedicareLevy(40000, { family: true, spouseTaxableIncome: 11000, dependentChildren: 1 })).toBe(0);
  });

  it("caps the individual's levy at 10% of family income above the family threshold", () => {
    // Family income 50,000 => family cap = (50,000 - 47,238) * 10% = 276.20.
    expect(tax.calculateMedicareLevy(40000, { family: true, spouseTaxableIncome: 10000 })).toBeCloseTo(276.2, 6);
  });

  it("never increases levy above the individual's ordinary Medicare levy", () => {
    const ordinary = tax.calculateMedicareLevy(80000);
    const family = tax.calculateMedicareLevy(80000, { family: true, spouseTaxableIncome: 80000 });
    expect(family).toBeCloseTo(ordinary, 9);
  });

  it("uses the SAPTO family threshold A$61,623 when SAPTO applies and is wired through total tax", () => {
    const r = tax.calculateTotalTax(50000, {
      saptoEligible: true,
      medicareFamily: true,
      medicareSpouseTaxableIncome: 10000,
      medicareDependentChildren: 0,
    });
    expect(tax.medicareLevy.lowIncomeThresholds.saptoFamily.lower).toBe(61623);
    expect(r.medicareLevy).toBe(0);
  });
});
