import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 29 — GB Pension Credit assessable income", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("uses the normal £5 single earnings disregard", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      statePensionWeekly: 180,
      earningsWeekly: 25,
      status: "single",
    });
    expect(r.earningsDisregardWeekly).toBe(5);
    expect(r.countedEarningsWeekly).toBe(20);
    expect(r.countedIncomeWeekly).toBe(200);
  });

  it("uses the normal £10 couple earnings disregard", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      earningsWeekly: 35,
      status: "couple",
    });
    expect(r.earningsDisregardWeekly).toBe(10);
    expect(r.countedEarningsWeekly).toBe(25);
  });

  it("supports the £20 higher earnings disregard", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      earningsWeekly: 35,
      status: "single",
      higherEarningsDisregard: true,
    });
    expect(r.earningsDisregardWeekly).toBe(20);
    expect(r.countedEarningsWeekly).toBe(15);
  });

  it("adds pensions, counted benefits, other counted income and capital tariff income", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      statePensionWeekly: 150,
      privatePensionWeekly: 40,
      otherCountedBenefitsWeekly: 12,
      otherCountedIncomeWeekly: 8,
      capital: 11000,
    });
    expect(r.tariffIncomeWeekly).toBe(2);
    expect(r.countedIncomeWeekly).toBe(212);
  });

  it("does not add fully disregarded income into assessable income", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      statePensionWeekly: 150,
      fullyDisregardedIncomeWeekly: 100,
    });
    expect(r.fullyDisregardedIncomeWeekly).toBe(100);
    expect(r.countedIncomeWeekly).toBe(150);
  });

  it("clamps negative inputs rather than reducing assessable income", () => {
    const r = ret.calculatePensionCreditAssessableIncome({
      statePensionWeekly: -20,
      privatePensionWeekly: -10,
      earningsWeekly: -5,
      capital: -100,
    });
    expect(r.countedIncomeWeekly).toBe(0);
    expect(r.tariffIncomeWeekly).toBe(0);
  });
});
