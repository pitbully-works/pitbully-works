import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 122-125 - exact fortnightly Work Bonus ledger", () => {
  const r = AU_COUNTRY_RULES.retirement;

  it("banks the unused part of the A$300 fortnightly amount", () => {
    const result = r.getWorkBonusFortnightlyAssessment([200], 0);
    expect(result.periods[0].assessableIncome).toBe(0);
    expect(result.endingBalance).toBe(100);
  });

  it("uses stored balance after the standard A$300 amount", () => {
    const result = r.getWorkBonusFortnightlyAssessment([400], 100);
    expect(result.periods[0].balanceUsed).toBe(100);
    expect(result.periods[0].assessableIncome).toBe(0);
    expect(result.endingBalance).toBe(0);
  });

  it("keeps excess income assessable when the stored balance is insufficient", () => {
    const result = r.getWorkBonusFortnightlyAssessment([500], 50);
    expect(result.periods[0].assessableIncome).toBe(150);
    expect(result.endingBalance).toBe(0);
  });

  it("never lets the Work Bonus balance exceed A$11,800", () => {
    const result = r.getWorkBonusFortnightlyAssessment([0, 0], 11750);
    expect(result.endingBalance).toBe(11800);
  });
});
