import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 39 — GB Pension Credit legacy Guarantee penny boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("does not expose fractions of a penny from the legacy Guarantee Credit helper", () => {
    const r = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 200.001,
    });
    expect(r.guaranteeCreditWeekly).toBe(38);
    expect(Number.isInteger(r.guaranteeCreditWeekly * 100)).toBe(true);
  });

  it("rounds a positive fractional penny in the claimant's favour", () => {
    const r = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 200.009,
    });
    // Raw shortfall £37.991 -> claimant-favourable whole-penny award £38.00.
    expect(r.guaranteeCreditWeekly).toBe(38);
  });

  it("never creates a penny award when assessed income already exceeds the guarantee", () => {
    const r = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 238.001,
    });
    expect(r.guaranteeCreditWeekly).toBe(0);
  });
});
