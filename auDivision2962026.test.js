import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Division 296", () => {
  const tax = AU_COUNTRY_RULES.tax;
  it("uses the legislated $3m and $10m thresholds", () => {
    expect(tax.superannuation.division296.largeBalanceThreshold).toBe(3000000);
    expect(tax.superannuation.division296.veryLargeBalanceThreshold).toBe(10000000);
  });
  it("is zero at or below $3m", () => expect(tax.calculateDivision296Tax(3000000, 200000).tax).toBe(0));
  it("is zero for non-positive realised earnings", () => expect(tax.calculateDivision296Tax(5000000, 0).tax).toBe(0));
  it("taxes only the balance proportion above $3m at 15% below $10m", () => {
    expect(tax.calculateDivision296Tax(5000000, 500000).tax).toBeCloseTo(500000*(2000000/5000000)*0.15, 6);
  });
  it("applies 25% additional rate to the balance slice above $10m", () => {
    const r=tax.calculateDivision296Tax(12000000,1200000);
    expect(r.tier1Tax).toBeCloseTo(1200000*(7000000/12000000)*0.15,6);
    expect(r.tier2Tax).toBeCloseTo(1200000*(2000000/12000000)*0.25,6);
  });
  it("never returns negative tax", () => expect(tax.calculateDivision296Tax(-1,-1).tax).toBe(0));
  it("removes Division 296 from investment.notImplemented", () => expect(AU_COUNTRY_RULES.investment.notImplemented.join(" ")).not.toMatch(/Division 296/));
});
