import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 40 — GB Pension Credit legacy/modern parity", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("keeps the simple single Guarantee Credit result identical across both calculators", () => {
    const legacy = ret.calculatePensionCreditGuarantee({ status: "single", weeklyIncome: 200 });
    const modern = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200,
    });
    expect(modern.guaranteeCreditWeekly).toBe(legacy.guaranteeCreditWeekly);
    expect(modern.guaranteeCreditWeekly).toBe(38);
  });

  it("keeps the simple couple Guarantee Credit result identical across both calculators", () => {
    const legacy = ret.calculatePensionCreditGuarantee({ status: "couple", weeklyIncome: 300 });
    const modern = ret.calculatePensionCreditGuaranteeCredit({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: true,
      statePensionWeekly: 300,
    });
    expect(modern.guaranteeCreditWeekly).toBe(legacy.guaranteeCreditWeekly);
    expect(modern.guaranteeCreditWeekly).toBe(63.25);
  });

  it("keeps tariff-income treatment identical across both calculators", () => {
    const legacy = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 200,
      capital: 10501,
    });
    const modern = ret.calculatePensionCreditGuaranteeCredit({
      status: "single",
      claimantReachedStatePensionAge: true,
      statePensionWeekly: 200,
      capital: 10501,
    });
    expect(legacy.tariffIncomeWeekly).toBe(2);
    expect(modern.incomeBreakdown.tariffIncomeWeekly).toBe(2);
    expect(modern.guaranteeCreditWeekly).toBe(legacy.guaranteeCreditWeekly);
    expect(modern.guaranteeCreditWeekly).toBe(36);
  });
});
