import { describe, expect, it } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("overseas 100-point phase 1", () => {
  it("US applies the 2026 Roth catch-up wage threshold", () => {
    expect(US_COUNTRY_RULES.investment.requiresRothCatchUp(150000, 55)).toBe(false);
    expect(US_COUNTRY_RULES.investment.requiresRothCatchUp(150001, 55)).toBe(true);
  });
  it("GB adds prior-three-year carry forward", () => {
    expect(GB_COUNTRY_RULES.investment.getEffectivePensionAnnualAllowance(100000, 100000, 25000)).toBe(85000);
  });
  it("CA supports RRIF spouse-age election", () => {
    expect(CA_COUNTRY_RULES.investment.getRrifMinimumWithdrawal(80, 100000, true, 72)).toBeCloseTo(5400, 6);
  });
  it("AU reports transfer balance cap excess", () => {
    expect(AU_COUNTRY_RULES.investment.getTransferBalanceCapStatus(2200000, 0).excess).toBe(100000);
  });
});
