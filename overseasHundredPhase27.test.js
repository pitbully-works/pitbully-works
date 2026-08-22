import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 27 — GB Pension Credit Savings Credit", () => {
  const ret = GB_COUNTRY_RULES.retirement;
  const sc = ret.pensionCredit.savingsCredit;

  it("protects the 2026/27 thresholds, maxima and 60/40 rates", () => {
    expect(sc.singleThresholdWeekly).toBe(208.07);
    expect(sc.coupleThresholdWeekly).toBe(329.75);
    expect(sc.singleMaximumWeekly).toBe(17.96);
    expect(sc.coupleMaximumWeekly).toBe(20.10);
    expect(sc.amountARate).toBe(0.60);
    expect(sc.amountBRate).toBe(0.40);
  });

  it("does not award Savings Credit to post-2016 entrants", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 230,
      totalIncomeWeekly: 230,
      reachedStatePensionAgeBefore20160406: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.savingsCreditWeekly).toBe(0);
  });

  it("does not award Savings Credit at or below the threshold", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 208.07,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.savingsCreditWeekly).toBe(0);
  });

  it("calculates Amount A at 60 percent and caps it at the statutory maximum", () => {
    const partial = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 221.03,
      totalIncomeWeekly: 221.03,
      appropriateAmountWeekly: 254.35,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(partial.amountAWeekly).toBeCloseTo(7.776, 10);
    expect(partial.amountBWeekly).toBe(0);
    expect(partial.savingsCreditWeekly).toBeCloseTo(7.776, 10);

    const capped = ret.calculatePensionCreditSavingsCredit({
      status: "couple",
      qualifyingIncomeWeekly: 377.74,
      totalIncomeWeekly: 377.74,
      appropriateAmountWeekly: 363.25,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(capped.amountAWeekly).toBeCloseTo(20.10, 10);
  });

  it("subtracts Amount B at 40 percent when total income exceeds the appropriate amount", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "couple",
      qualifyingIncomeWeekly: 377.74,
      totalIncomeWeekly: 377.74,
      appropriateAmountWeekly: 363.25,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountBWeekly).toBeCloseTo(5.796, 10);
    expect(r.savingsCreditWeekly).toBeCloseTo(14.304, 10);
  });

  it("supports the preserved transitional-couple entitlement flag", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "couple",
      qualifyingIncomeWeekly: 350,
      totalIncomeWeekly: 350,
      transitionalCoupleContinuousEntitlement: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.savingsCreditWeekly).toBeGreaterThan(0);
  });

  it("never returns negative Savings Credit", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 238,
      totalIncomeWeekly: 500,
      appropriateAmountWeekly: 238,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.savingsCreditWeekly).toBe(0);
  });
});
