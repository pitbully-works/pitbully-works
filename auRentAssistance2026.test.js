import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const ret = AU_COUNTRY_RULES.retirement;

const common = {
  age: 70,
  annualIncome: 0,
  employmentIncomeAnnual: 0,
  workBonusBalance: 0,
  assessableAssets: 0,
  financialAssets: 0,
  homeowner: false,
  rentAssistanceEligible: true,
};

describe("AU Rent Assistance — 1 July 2026 rates", () => {
  it("locks the child-free single and couple thresholds and maximum rates", () => {
    const ra = ret.agePension.rentAssistance;
    expect(ra.ratePerDollarAboveThreshold).toBe(0.75);
    expect(ra.single.thresholdFortnightly).toBe(154.80);
    expect(ra.single.maxFortnightly).toBe(219.40);
    expect(ra.singleSharer.maxFortnightly).toBe(146.27);
    expect(ra.coupleCombined.thresholdFortnightly).toBe(250.80);
    expect(ra.coupleCombined.maxFortnightly).toBe(206.80);
  });

  it("pays nothing at the threshold and 75 cents per extra rent dollar above it", () => {
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: false, eligible: true, rentFortnightly: 154.80 })).toBe(0);
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: false, eligible: true, rentFortnightly: 254.80 })).toBeCloseTo(75, 8);
  });

  it("caps single standard and single sharer amounts at their respective maxima", () => {
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: false, eligible: true, rentFortnightly: 1000 })).toBe(219.40);
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: false, eligible: true, rentFortnightly: 1000, sharer: true })).toBe(146.27);
  });

  it("uses the couple-combined Rent Assistance maximum once per household", () => {
    const raAnnual = ret.getRentAssistanceHouseholdAnnual({ status: "couple", homeowner: false, eligible: true, rentFortnightly: 1000 });
    expect(raAnnual).toBeCloseTo(206.80 * 26, 8);
    const household = ret.getAgePensionHousehold({
      ...common,
      status: "couple",
      bothQualified: true,
      rentFortnightly: 1000,
    });
    expect(household).toBeCloseTo(ret.getMaxAnnual("couple") * 2 + raAnnual, 8);
  });

  it("does not pay Rent Assistance to homeowners or when eligibility is not confirmed", () => {
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: true, eligible: true, rentFortnightly: 1000 })).toBe(0);
    expect(ret.getRentAssistanceFortnightly({ status: "single", homeowner: false, eligible: false, rentFortnightly: 1000 })).toBe(0);
  });

  it("includes Rent Assistance in the maximum pension rate before means testing", () => {
    const baseCutoff = ret.getAssetsCutOff("single", false);
    const assetsJustAboveBaseCutoff = baseCutoff + 20_000;
    const withoutRa = ret.getAgePension({
      ...common,
      status: "single",
      rentAssistanceEligible: false,
      rentFortnightly: 0,
      assessableAssets: assetsJustAboveBaseCutoff,
      financialAssets: 0,
    });
    const withRa = ret.getAgePension({
      ...common,
      status: "single",
      rentFortnightly: 1000,
      assessableAssets: assetsJustAboveBaseCutoff,
      financialAssets: 0,
    });
    expect(withoutRa).toBe(0);
    expect(withRa).toBeGreaterThan(0);
  });
});
