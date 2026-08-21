import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU Medicare levy low-income reduction", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("stores the latest enacted low-income thresholds carried into 2026-27", () => {
    expect(tax.medicareLevy.lowIncomeThresholds.ordinarySingle).toEqual({ lower: 28011, upper: 35013 });
    expect(tax.medicareLevy.lowIncomeThresholds.saptoSingle).toEqual({ lower: 44268, upper: 55335 });
    expect(tax.medicareLevy.phaseInRate).toBe(0.10);
  });

  it("ordinary single: zero below threshold, 10% phase-in, then full 2%", () => {
    expect(tax.calculateMedicareLevy(28011)).toBe(0);
    expect(tax.calculateMedicareLevy(30000)).toBeCloseTo(198.9, 6);
    expect(tax.calculateMedicareLevy(35013)).toBeCloseTo(700.26, 6);
    expect(tax.calculateMedicareLevy(80000)).toBeCloseTo(1600, 6);
  });

  it("SAPTO eligible single uses the senior/pensioner threshold", () => {
    expect(tax.calculateMedicareLevy(44268, { saptoEligible: true })).toBe(0);
    expect(tax.calculateMedicareLevy(50000, { saptoEligible: true })).toBeCloseTo(573.2, 6);
    expect(tax.calculateMedicareLevy(55335, { saptoEligible: true })).toBeCloseTo(1106.7, 6);
  });

  it("calculateTotalTax passes SAPTO eligibility into Medicare levy", () => {
    expect(tax.calculateTotalTax(30000).medicareLevy).toBeCloseTo(198.9, 6);
    expect(tax.calculateTotalTax(30000, { saptoEligible: true }).medicareLevy).toBe(0);
  });
});
