import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026 Work Bonus annual projection", () => {
  const ret = AU_COUNTRY_RULES.retirement;
  it("stores the current official Work Bonus parameters", () => {
    expect(ret.agePension.workBonusFortnightly).toBe(300);
    expect(ret.agePension.workBonusMaxBalance).toBe(11800);
    expect(ret.agePension.workBonusNewRecipientBalance).toBe(4000);
  });
  it("excludes the standard annual amount from eligible employment income", () => {
    expect(ret.getWorkBonusExcludedAnnual(20000, 0)).toBe(7800);
    expect(ret.getAssessableEmploymentIncomeAnnual(20000, 0)).toBe(12200);
  });
  it("uses an entered bank balance but caps it at 11800", () => {
    expect(ret.getWorkBonusExcludedAnnual(30000, 4000)).toBe(11800);
    expect(ret.getWorkBonusExcludedAnnual(30000, 99999)).toBe(19600);
  });
  it("does not apply Work Bonus to non-employment income", () => {
    const assessed = ret.getAssessableIncomeAnnual(10000, 0, "single", 20000, 0);
    expect(assessed).toBe(22200);
  });
  it("increases Age Pension compared with treating the same earnings as ordinary income", () => {
    const base = { age: 67, assessableAssets: 100000, financialAssets: 0, status: "single", homeowner: true };
    const withBonus = ret.getAgePension({ ...base, annualIncome: 0, employmentIncomeAnnual: 20000, workBonusBalance: 0 });
    const withoutBonus = ret.getAgePension({ ...base, annualIncome: 20000, employmentIncomeAnnual: 0, workBonusBalance: 0 });
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });
});
