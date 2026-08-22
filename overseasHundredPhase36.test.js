import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 36 — GB Pension Credit Savings Credit penny rounding", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("matches the DWP 2026 example by rounding Amount A to £7.78", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 221.03,
      totalIncomeWeekly: 221.03,
      appropriateAmountWeekly: 254.35,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(7.78);
    expect(r.savingsCreditWeekly).toBe(7.78);
  });

  it("uses the exact published single maximum once qualifying income reaches the standard amount", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 238.00,
      totalIncomeWeekly: 238.00,
      appropriateAmountWeekly: 254.35,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(17.96);
    expect(r.savingsCreditWeekly).toBe(17.96);
  });

  it("matches the DWP couple example with Amount B £5.79 and final Savings Credit £14.31", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "couple",
      qualifyingIncomeWeekly: 377.74,
      totalIncomeWeekly: 377.74,
      appropriateAmountWeekly: 363.25,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(20.10);
    expect(r.amountBWeekly).toBe(5.79);
    expect(r.savingsCreditWeekly).toBe(14.31);
  });
});
