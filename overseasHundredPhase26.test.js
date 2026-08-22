import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 26 — GB Pension Credit capital tariff income", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("protects the Pension Credit capital disregard and tariff unit", () => {
    expect(ret.pensionCredit.capital.disregard).toBe(10000);
    expect(ret.pensionCredit.capital.tariffUnit).toBe(500);
    expect(ret.pensionCredit.capital.tariffIncomePerUnitWeekly).toBe(1);
    expect(ret.pensionCredit.capital.upperLimit).toBeNull();
  });

  it("charges no tariff income at or below the £10,000 disregard", () => {
    expect(ret.calculatePensionCreditTariffIncome(0)).toBe(0);
    expect(ret.calculatePensionCreditTariffIncome(10000)).toBe(0);
  });

  it("uses £1 weekly for every £500 or part thereof above £10,000", () => {
    expect(ret.calculatePensionCreditTariffIncome(10001)).toBe(1);
    expect(ret.calculatePensionCreditTariffIncome(10500)).toBe(1);
    expect(ret.calculatePensionCreditTariffIncome(10501)).toBe(2);
    expect(ret.calculatePensionCreditTariffIncome(15000)).toBe(10);
  });

  it("adds tariff income to assessed weekly income", () => {
    const r = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 200,
      capital: 15000,
    });
    expect(r.tariffIncomeWeekly).toBe(10);
    expect(r.assessedIncomeWeekly).toBe(210);
    expect(r.guaranteeCreditWeekly).toBeCloseTo(28, 10);
  });

  it("keeps the Guarantee Credit floor at zero after capital assessment", () => {
    expect(ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 230,
      capital: 15000,
    }).guaranteeCreditWeekly).toBe(0);
  });
});
