import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 41 — GB Pension Credit claimant-favourable income rounding", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("disregards a sub-penny fraction in counted pension income", () => {
    const income = ret.calculatePensionCreditAssessableIncome({
      status: "single",
      statePensionWeekly: 200.009,
    });
    expect(income.countedIncomeWeekly).toBe(200);
  });

  it("disregards a sub-penny fraction in counted earnings after the disregard", () => {
    const income = ret.calculatePensionCreditAssessableIncome({
      status: "single",
      earningsWeekly: 25.009,
    });
    expect(income.earningsDisregardWeekly).toBe(5);
    expect(income.countedEarningsWeekly).toBe(20);
    expect(income.countedIncomeWeekly).toBe(20);
  });

  it("keeps the detailed Guarantee Credit result aligned with claimant-favourable penny rounding", () => {
    const modern = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200.009,
    });
    const legacy = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 200.009,
    });
    expect(modern.countedIncomeWeekly).toBe(200);
    expect(modern.guaranteeCreditWeekly).toBe(38);
    expect(modern.guaranteeCreditWeekly).toBe(legacy.guaranteeCreditWeekly);
  });
});
