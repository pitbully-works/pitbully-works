import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 106-109 - SAPTO spouse transfer", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("transfers the full unused spouse SAPTO when spouse income is A$6,000 or less", () => {
    expect(tax.calculateUnusedSaptoTransferFromSpouse({
      spouseSaptoAmount: 1602,
      spouseTaxableIncome: 6000,
      bothEligible: true,
    })).toBe(1602);
  });

  it("uses the ATO 15% reduction formula above A$6,000", () => {
    expect(tax.calculateUnusedSaptoTransferFromSpouse({
      spouseSaptoAmount: 2040,
      spouseTaxableIncome: 10000,
      bothEligible: true,
    })).toBeCloseTo(1440, 8);
  });

  it("includes exempt pension income in the spouse unused-offset test", () => {
    expect(tax.calculateUnusedSaptoTransferFromSpouse({
      spouseSaptoAmount: 1602,
      spouseTaxableIncome: 5000,
      spouseExemptPensionIncome: 2000,
      bothEligible: true,
    })).toBeCloseTo(1452, 8);
  });

  it("does not transfer SAPTO unless both spouses are eligible", () => {
    expect(tax.calculateUnusedSaptoTransferFromSpouse({
      spouseSaptoAmount: 1602,
      spouseTaxableIncome: 0,
      bothEligible: false,
    })).toBe(0);
  });
});
