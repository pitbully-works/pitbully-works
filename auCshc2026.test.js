import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const r = AU_COUNTRY_RULES.retirement;

describe("AU 2026 Commonwealth Seniors Health Card", () => {
  it("uses the July 2026 single and couple income limits", () => {
    expect(r.getCshcIncomeLimit("single", false, 0)).toBe(101105);
    expect(r.getCshcIncomeLimit("couple", false, 0)).toBe(161768);
  });

  it("uses the higher separated-couple limit", () => {
    expect(r.getCshcIncomeLimit("couple", true, 0)).toBe(202210);
  });

  it("adds A$639.60 for each dependent child", () => {
    expect(r.getCshcIncomeLimit("single", false, 2)).toBeCloseTo(101105 + 2 * 639.60, 2);
  });

  it("tests ATI plus deemed account-based income and requires income below the limit", () => {
    expect(r.getCshcAssessableIncome(100000, 1000)).toBe(101000);
    expect(r.isCshcIncomeEligible({ status: "single", adjustedTaxableIncome: 100000, deemedAccountBasedIncome: 1000 })).toBe(true);
    expect(r.isCshcIncomeEligible({ status: "single", adjustedTaxableIncome: 100105, deemedAccountBasedIncome: 1000 })).toBe(false);
  });

  it("requires Age Pension age, residence confirmation and no income support", () => {
    expect(r.getCshcEligibility({ age: 66, residenceEligible: true, noOtherIncomeSupport: true }).eligible).toBe(false);
    expect(r.getCshcEligibility({ age: 67, residenceEligible: false, noOtherIncomeSupport: true }).eligible).toBe(false);
    expect(r.getCshcEligibility({ age: 67, residenceEligible: true, noOtherIncomeSupport: false }).eligible).toBe(false);
    expect(r.getCshcEligibility({ age: 67, residenceEligible: true, noOtherIncomeSupport: true }).eligible).toBe(true);
  });

  it("marks the estimate ineligible when the plan is receiving Age Pension", () => {
    const result = r.getCshcEligibility({
      age: 67,
      status: "single",
      residenceEligible: true,
      noOtherIncomeSupport: true,
      adjustedTaxableIncome: 50000,
      agePensionAnnual: 1000,
    });
    expect(result.eligible).toBe(false);
    expect(result.notReceivingIncomeSupport).toBe(false);
  });
});
