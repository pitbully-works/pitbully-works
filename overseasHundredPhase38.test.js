import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 38 — GB Pension Credit Savings Credit income consistency boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("does not allow total income below qualifying income to suppress Amount B", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "couple",
      qualifyingIncomeWeekly: 377.74,
      totalIncomeWeekly: 300,
      appropriateAmountWeekly: 363.25,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(20.10);
    expect(r.amountBWeekly).toBe(5.79);
    expect(r.savingsCreditWeekly).toBe(14.31);
  });

  it("still includes explicitly supplied non-qualifying income above qualifying income", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 220,
      totalIncomeWeekly: 260,
      appropriateAmountWeekly: 238,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(7.16);
    expect(r.amountBWeekly).toBe(8.80);
    expect(r.savingsCreditWeekly).toBe(0);
  });

  it("treats a negative explicit total as no lower than the qualifying income", () => {
    const r = ret.calculatePensionCreditSavingsCredit({
      status: "single",
      qualifyingIncomeWeekly: 240,
      totalIncomeWeekly: -1,
      appropriateAmountWeekly: 238,
      reachedStatePensionAgeBefore20160406: true,
    });
    expect(r.amountAWeekly).toBe(17.96);
    expect(r.amountBWeekly).toBe(0.80);
    expect(r.savingsCreditWeekly).toBe(17.16);
  });
});
