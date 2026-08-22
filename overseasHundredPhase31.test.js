import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 31 — GB Pension Credit end-to-end Guarantee Credit", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("calculates a single claimant's weekly and annual Guarantee Credit", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 180,
    });
    expect(r.eligibleByAge).toBe(true);
    expect(r.appropriateAmountWeekly).toBe(238);
    expect(r.countedIncomeWeekly).toBe(180);
    expect(r.guaranteeCreditWeekly).toBe(58);
    expect(r.annualGuaranteeCredit).toBe(3016);
  });

  it("never returns a negative award when counted income exceeds the appropriate amount", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 300,
    });
    expect(r.guaranteeCreditWeekly).toBe(0);
    expect(r.annualGuaranteeCredit).toBe(0);
  });

  it("combines additions with assessable income in one calculation", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200,
      privatePensionWeekly: 20,
      earningsWeekly: 15,
      severeDisabilityQualifiers: 1,
      carerQualifiers: 1,
      eligibleHousingCostsWeekly: 25,
    });
    expect(r.incomeBreakdown.earningsDisregardWeekly).toBe(5);
    expect(r.countedIncomeWeekly).toBe(230);
    expect(r.appropriateAmountWeekly).toBe(397.20);
    expect(r.guaranteeCreditWeekly).toBe(167.20);
  });

  it("returns zero for an unprotected mixed-age new claim and flags the UC route", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
      statePensionWeekly: 200,
    });
    expect(r.eligibleByAge).toBe(false);
    expect(r.requiresUniversalCreditRoute).toBe(true);
    expect(r.ageReason).toBe("mixed-age-new-claim");
    expect(r.guaranteeCreditWeekly).toBe(0);
  });

  it("allows a protected mixed-age couple to receive Guarantee Credit", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
      protectedMixedAgeContinuity: true,
      statePensionWeekly: 300,
    });
    expect(r.eligibleByAge).toBe(true);
    expect(r.requiresUniversalCreditRoute).toBe(false);
    expect(r.guaranteeCreditWeekly).toBe(63.25);
  });

  it("includes capital tariff income in the final award calculation", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200,
      capital: 11000,
    });
    expect(r.incomeBreakdown.tariffIncomeWeekly).toBe(2);
    expect(r.countedIncomeWeekly).toBe(202);
    expect(r.guaranteeCreditWeekly).toBe(36);
  });

  it("preserves fully disregarded income outside counted income", () => {
    const r = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200,
      fullyDisregardedIncomeWeekly: 100,
    });
    expect(r.incomeBreakdown.fullyDisregardedIncomeWeekly).toBe(100);
    expect(r.countedIncomeWeekly).toBe(200);
    expect(r.guaranteeCreditWeekly).toBe(38);
  });
});
