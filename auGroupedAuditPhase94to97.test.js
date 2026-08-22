import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const ret = AU_COUNTRY_RULES.retirement;

describe("AU grouped audit phases 94-97 - Age Pension 1 July 2026 published cut-offs", () => {
  it("locks the published standard asset cut-offs exactly", () => {
    expect(ret.getAssetsCutOff("single", true)).toBe(733500);
    expect(ret.getAssetsCutOff("single", false)).toBe(1000500);
    expect(ret.getAssetsCutOff("couple", true)).toBe(1102500);
    expect(ret.getAssetsCutOff("couple", false)).toBe(1369500);
  });

  it("locks the published income cut-offs exactly after annualising 26 fortnights", () => {
    expect(ret.getIncomeCutOffAnnual("single")).toBeCloseTo(2627.80 * 26, 8);
    expect(ret.getIncomeCutOffAnnual("couple")).toBeCloseTo(4016.80 * 26, 8);
  });

  it("keeps the July 2026 income free areas and taper rates aligned", () => {
    expect(ret.agePension.incomeFreeAreaFortnightlySingle).toBe(226);
    expect(ret.agePension.incomeFreeAreaFortnightlyCoupleCombined).toBe(396);
    expect(ret.getIncomeTaperPerDollar("single")).toBe(0.50);
    expect(ret.getIncomeTaperPerDollar("couple")).toBe(0.25);
  });

  it("keeps the March 2026 maximum Age Pension rates aligned", () => {
    expect(ret.agePension.maxFortnightlySingle).toBe(1200.90);
    expect(ret.agePension.maxFortnightlyCoupleEach).toBe(905.20);
  });
});
