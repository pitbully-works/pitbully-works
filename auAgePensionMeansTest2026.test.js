import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const ret = AU_COUNTRY_RULES.retirement;

const base = {
  age: 70,
  status: "single",
  homeowner: true,
  employmentIncomeAnnual: 0,
  workBonusBalance: 0,
  financialAssets: 0,
};

describe("AU 2026 Age Pension means-test selection", () => {
  it("locks the 1 July 2026 standard income and assets free areas", () => {
    expect(ret.agePension.incomeFreeAreaFortnightlySingle).toBe(226);
    expect(ret.agePension.incomeFreeAreaFortnightlyCoupleCombined).toBe(396);
    expect(ret.getAssetsFreeArea("single", true)).toBe(333_000);
    expect(ret.getAssetsFreeArea("single", false)).toBe(600_000);
    expect(ret.getAssetsFreeArea("couple", true)).toBe(499_000);
    expect(ret.getAssetsFreeArea("couple", false)).toBe(766_000);
  });

  it("uses the assets-test result when it is lower than the income-test result", () => {
    const args = { ...base, annualIncome: 0, assessableAssets: 600_000 };
    const byIncome = ret.getAgePensionByIncomeTest(0, "single");
    const byAssets = ret.getAgePensionByAssetsTest(600_000, "single", true);
    expect(byAssets).toBeLessThan(byIncome);
    expect(ret.getAgePension(args)).toBeCloseTo(byAssets, 8);
  });

  it("uses the income-test result when it is lower than the assets-test result", () => {
    const args = { ...base, annualIncome: 50_000, assessableAssets: 300_000 };
    const byIncome = ret.getAgePensionByIncomeTest(50_000, "single");
    const byAssets = ret.getAgePensionByAssetsTest(300_000, "single", true);
    expect(byIncome).toBeLessThan(byAssets);
    expect(ret.getAgePension(args)).toBeCloseTo(byIncome, 8);
  });

  it("applies deeming before comparing the income test with the assets test", () => {
    const args = {
      ...base,
      annualIncome: 0,
      assessableAssets: 300_000,
      financialAssets: 300_000,
    };
    const assessableIncome = ret.getAssessableIncomeAnnual(0, 300_000, "single");
    const byIncome = ret.getAgePensionByIncomeTest(assessableIncome, "single");
    const byAssets = ret.getAgePensionByAssetsTest(300_000, "single", true);
    expect(ret.getAgePension(args)).toBeCloseTo(Math.min(byIncome, byAssets), 8);
  });

  it("returns zero if either means test reduces the pension to zero", () => {
    const assetsZero = ret.getAgePension({ ...base, annualIncome: 0, assessableAssets: 2_000_000 });
    const incomeZero = ret.getAgePension({ ...base, annualIncome: 100_000, assessableAssets: 0 });
    expect(assetsZero).toBe(0);
    expect(incomeZero).toBe(0);
  });

  it("couple household amount multiplies only after the lower per-person test result is selected", () => {
    const args = {
      age: 70,
      annualIncome: 30_000,
      employmentIncomeAnnual: 0,
      workBonusBalance: 0,
      assessableAssets: 800_000,
      financialAssets: 800_000,
      status: "couple",
      homeowner: true,
      bothQualified: true,
    };
    const assessableIncome = ret.getAssessableIncomeAnnual(30_000, 800_000, "couple");
    const byIncome = ret.getAgePensionByIncomeTest(assessableIncome, "couple");
    const byAssets = ret.getAgePensionByAssetsTest(800_000, "couple", true);
    const perPerson = Math.min(byIncome, byAssets);
    expect(ret.getAgePension(args)).toBeCloseTo(perPerson, 8);
    expect(ret.getAgePensionHousehold(args)).toBeCloseTo(perPerson * 2, 8);
  });
});
