import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("GB grouped audit phases 42-45 — 2026/27 tax completion", () => {
  const tax = GB_COUNTRY_RULES.tax;

  it("uses the correct £125,140 upper taxable-income boundary after the Personal Allowance taper", () => {
    const r = tax.calculateIncomeTax(125140);
    expect(r.personalAllowance).toBe(0);
    expect(r.taxableIncome).toBe(125140);
    expect(r.tax).toBeCloseTo(42516, 2);
    expect(tax.incomeTax.bands[1].upTo).toBe(125140);
    expect(tax.scotland.bands[4].upTo).toBe(125140);
  });

  it("applies the £5,000 starting rate for savings and reduces it by non-savings income above the Personal Allowance", () => {
    const low = tax.calculateSavingsInterestTax(200, 16000);
    expect(low.startingRateAvailable).toBe(1570);
    expect(low.startingRateUsed).toBe(200);
    expect(low.tax).toBe(0);
  });

  it("applies the 2026/27 Personal Savings Allowance of £1,000 / £500 / £0", () => {
    expect(tax.calculateSavingsInterestTax(1200, 20000).personalSavingsAllowance).toBe(1000);
    expect(tax.calculateSavingsInterestTax(700, 60000).personalSavingsAllowance).toBe(500);
    expect(tax.calculateSavingsInterestTax(700, 150000).personalSavingsAllowance).toBe(0);
    expect(tax.calculateSavingsInterestTax(1200, 20000).tax).toBeCloseTo(40, 2);
  });

  it("models Marriage Allowance as a net couple tax reduction capped at £252", () => {
    expect(tax.calculateMarriageAllowanceTaxReduction({ lowerEarnerIncome: 8000, recipientIncome: 20000 })).toBeCloseTo(252, 2);
    expect(tax.calculateMarriageAllowanceTaxReduction({ lowerEarnerIncome: 11500, recipientIncome: 20000 })).toBeCloseTo(214, 2);
    expect(tax.calculateMarriageAllowanceTaxReduction({ lowerEarnerIncome: 8000, recipientIncome: 60000 })).toBe(0);
  });

  it("models 2026/27 Married Couple's Allowance with £11,700 max, £4,530 min and 10% relief", () => {
    expect(tax.calculateMarriedCouplesAllowanceTaxReduction({ adjustedNetIncome: 30000, elderPartnerBirthDate: "1934-01-01" })).toBeCloseTo(1170, 2);
    expect(tax.calculateMarriedCouplesAllowanceTaxReduction({ adjustedNetIncome: 100000, elderPartnerBirthDate: "1934-01-01" })).toBeCloseTo(453, 2);
    expect(tax.calculateMarriedCouplesAllowanceTaxReduction({ adjustedNetIncome: 30000, elderPartnerBirthDate: "1935-04-06" })).toBe(0);
  });
});
