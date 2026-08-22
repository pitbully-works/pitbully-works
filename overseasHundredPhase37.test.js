import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 37 — GB Pension Credit Savings Credit couple closure boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;
  const base = {
    status: "couple",
    qualifyingIncomeWeekly: 350,
    totalIncomeWeekly: 350,
  };

  it("allows a couple where both partners reached State Pension age before 6 April 2016", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      ...base,
      reachedStatePensionAgeBefore20160406: true,
      partnerReachedStatePensionAgeBefore20160406: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.savingsCreditWeekly).toBeGreaterThan(0);
  });

  it("requires continuous pre-2016 entitlement for a mixed-age couple", () => {
    const withoutProtection = ret.calculatePensionCreditSavingsCredit({
      ...base,
      reachedStatePensionAgeBefore20160406: true,
      partnerReachedStatePensionAgeBefore20160406: false,
      transitionalCoupleContinuousEntitlement: false,
    });
    const withProtection = ret.calculatePensionCreditSavingsCredit({
      ...base,
      reachedStatePensionAgeBefore20160406: true,
      partnerReachedStatePensionAgeBefore20160406: false,
      transitionalCoupleContinuousEntitlement: true,
    });
    expect(withoutProtection.eligible).toBe(false);
    expect(withoutProtection.savingsCreditWeekly).toBe(0);
    expect(withProtection.eligible).toBe(true);
    expect(withProtection.savingsCreditWeekly).toBeGreaterThan(0);
  });

  it("does not let a continuity flag revive Savings Credit when both partners are post-2016", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      ...base,
      reachedStatePensionAgeBefore20160406: false,
      partnerReachedStatePensionAgeBefore20160406: false,
      transitionalCoupleContinuousEntitlement: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.savingsCreditWeekly).toBe(0);
  });
});
