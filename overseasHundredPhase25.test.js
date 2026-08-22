import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 25 — GB State Pension NI estimate and Pension Credit", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("protects the 10-year minimum and 35-year full-rate NI model", () => {
    expect(ret.niForecastModel.minimumQualifyingYears).toBe(10);
    expect(ret.niForecastModel.fullRateQualifyingYears).toBe(35);
    expect(ret.estimateStatePensionFromQualifyingYears(9).eligible).toBe(false);
    expect(ret.estimateStatePensionFromQualifyingYears(9).weekly).toBe(0);
    expect(ret.estimateStatePensionFromQualifyingYears(35).weekly).toBeCloseTo(241.30, 10);
    expect(ret.estimateStatePensionFromQualifyingYears(40).weekly).toBeCloseTo(241.30, 10);
  });

  it("produces a proportional estimate for 10 to 35 qualifying years", () => {
    const r = ret.estimateStatePensionFromQualifyingYears(20);
    expect(r.eligible).toBe(true);
    expect(r.weekly).toBeCloseTo(241.30 * 20 / 35, 10);
    expect(r.isExactForecast).toBe(false);
  });

  it("protects the 2026/27 Pension Credit standard minimum guarantee", () => {
    expect(ret.pensionCredit.standardMinimumGuaranteeWeekly.single).toBe(238.00);
    expect(ret.pensionCredit.standardMinimumGuaranteeWeekly.couple).toBe(363.25);
    expect(ret.calculatePensionCreditGuarantee({ status: "single", weeklyIncome: 200 }).guaranteeCreditWeekly).toBeCloseTo(38, 10);
    expect(ret.calculatePensionCreditGuarantee({ status: "couple", weeklyIncome: 300 }).guaranteeCreditWeekly).toBeCloseTo(63.25, 10);
  });

  it("adds severe-disability and carer amounts", () => {
    const single = ret.calculatePensionCreditGuarantee({
      status: "single", weeklyIncome: 0, severeDisabilityQualifiers: 1, carerQualifiers: 1,
    });
    expect(single.guaranteeWeekly).toBeCloseTo(238 + 86.05 + 48.15, 10);

    const couple = ret.calculatePensionCreditGuarantee({
      status: "couple", weeklyIncome: 0, severeDisabilityQualifiers: 2,
    });
    expect(couple.guaranteeWeekly).toBeCloseTo(363.25 + 172.10, 10);
  });

  it("never returns negative Guarantee Credit", () => {
    expect(ret.calculatePensionCreditGuarantee({ status: "single", weeklyIncome: 500 }).guaranteeCreditWeekly).toBe(0);
  });

  it("marks the NI-year estimator as non-exact", () => {
    expect(ret.niForecastModel.exactForecastRequiresOfficialRecord).toBe(true);
  });
});
