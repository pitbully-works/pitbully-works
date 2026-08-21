import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const ret = AU_COUNTRY_RULES.retirement;

describe("AU 2026 Deeming / Age Pension", () => {
  it("uses the 1 July 2026 deeming thresholds and 20 March 2026 rates", () => {
    expect(ret.deeming.thresholdSingle).toBe(66_800);
    expect(ret.deeming.thresholdCoupleCombined).toBe(110_600);
    expect(ret.deeming.lowerRate).toBe(0.0125);
    expect(ret.deeming.upperRate).toBe(0.0325);
  });

  it("single: applies 1.25% up to A$66,800 and 3.25% above it", () => {
    expect(ret.getDeemedIncomeAnnual(66_800, "single")).toBeCloseTo(835, 2);
    const expected = 66_800 * 0.0125 + 33_200 * 0.0325;
    expect(ret.getDeemedIncomeAnnual(100_000, "single")).toBeCloseTo(expected, 2);
  });

  it("couple: applies the combined A$110,600 threshold", () => {
    expect(ret.getDeemingThreshold("couple")).toBe(110_600);
    const expected = 110_600 * 0.0125 + 89_400 * 0.0325;
    expect(ret.getDeemedIncomeAnnual(200_000, "couple")).toBeCloseTo(expected, 2);
  });

  it("adds deemed income to other assessable income", () => {
    const deemed = ret.getDeemedIncomeAnnual(100_000, "single");
    expect(ret.getAssessableIncomeAnnual(10_000, 100_000, "single"))
      .toBeCloseTo(10_000 + deemed, 2);
  });

  it("Age Pension uses the lower result of income and assets tests after deeming", () => {
    const args = {
      age: 70,
      annualIncome: 20_000,
      assessableAssets: 500_000,
      financialAssets: 500_000,
      status: "single",
      homeowner: true,
    };
    const assessableIncome = ret.getAssessableIncomeAnnual(
      args.annualIncome,
      args.financialAssets,
      args.status,
    );
    const byIncome = ret.getAgePensionByIncomeTest(assessableIncome, args.status);
    const byAssets = ret.getAgePensionByAssetsTest(args.assessableAssets, args.status, args.homeowner);
    expect(ret.getAgePension(args)).toBeCloseTo(Math.min(byIncome, byAssets), 2);
  });
});
