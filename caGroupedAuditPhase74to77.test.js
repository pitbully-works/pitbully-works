import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA grouped audit phases 74–77 — dividend DTC integration boundaries", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("keeps the CRA federal dividend-tax-credit source attached to the live tax rules", () => {
    expect(tax.sourceUrls.federalDividendTaxCredit).toContain("canada.ca");
    expect(tax.sourceUrls.federalDividendTaxCredit).toContain("t4015");
  });

  it("does not create dividend tax or credits when all dividend inputs are zero", () => {
    const r = tax.calculateFederalDividendTax({ otherTaxableIncome: 50000 });
    expect(r.taxableDividends).toBe(0);
    expect(r.federalDividendTaxCredit).toBe(0);
    expect(r.incrementalFederalTax).toBeCloseTo(0, 10);
  });

  it("preserves the same base federal tax calculation when dividends are added", () => {
    const otherTaxableIncome = 80000;
    const r = tax.calculateFederalDividendTax({ eligibleDividends: 2500, otherTaxableIncome });
    expect(r.baseFederalTax).toBeCloseTo(tax.calculateFederalTax(otherTaxableIncome).tax, 10);
    expect(r.federalTaxBeforeDividendCredit).toBeGreaterThanOrEqual(r.netFederalTax);
  });

  it("handles mixed dividend inputs as finite non-negative planning values", () => {
    const r = tax.calculateFederalDividendTax({
      eligibleDividends: 1234.56,
      nonEligibleDividends: 789.01,
      otherTaxableIncome: 64000,
    });
    for (const key of ["eligibleTaxable", "nonEligibleTaxable", "taxableDividends", "federalDividendTaxCredit", "netFederalTax"]) {
      expect(Number.isFinite(r[key])).toBe(true);
      expect(r[key]).toBeGreaterThanOrEqual(0);
    }
  });
});
