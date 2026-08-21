import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Medicare Levy Surcharge", () => {
  const tax = AU_COUNTRY_RULES.tax;
  it("uses the 2026-27 single thresholds and rates", () => {
    expect(tax.calculateMedicareLevySurcharge(105000)).toBe(0);
    expect(tax.calculateMedicareLevySurcharge(105001)).toBeCloseTo(1050.01, 2);
    expect(tax.calculateMedicareLevySurcharge(123001)).toBeCloseTo(1537.5125, 4);
    expect(tax.calculateMedicareLevySurcharge(164001)).toBeCloseTo(2460.015, 3);
  });
  it("uses family thresholds and adds A$1,500 per child after the first", () => {
    expect(tax.calculateMedicareLevySurcharge(210000, { family: true, dependentChildren: 1 })).toBe(0);
    expect(tax.calculateMedicareLevySurcharge(211000, { family: true, dependentChildren: 2 })).toBe(0);
    expect(tax.calculateMedicareLevySurcharge(211501, { family: true, dependentChildren: 2 })).toBeCloseTo(2115.01, 2);
  });
  it("is zero with appropriate hospital cover and pro-rates uncovered days", () => {
    expect(tax.calculateMedicareLevySurcharge(150000, { hasAppropriateHospitalCover: true })).toBe(0);
    expect(tax.calculateMedicareLevySurcharge(150000, { uncoveredDays: 182 })).toBeCloseTo(150000 * 0.0125 * 182 / 365, 6);
  });
  it("is included in calculateTotalTax", () => {
    const r = tax.calculateTotalTax(120000, { mlsIncome: 120000 });
    expect(r.medicareLevySurcharge).toBe(1200);
    expect(r.total).toBeCloseTo(r.incomeTax + r.medicareLevy + 1200, 6);
  });
  it("keeps the official 2026-27 metadata", () => {
    expect(tax.medicareLevySurcharge.singleThresholds).toEqual([105000,123000,164000]);
    expect(tax.medicareLevySurcharge.familyThresholds).toEqual([210000,246000,328000]);
    expect(tax.sourceUrls.medicareLevySurcharge).toContain("privatehealth.gov.au");
  });
});
