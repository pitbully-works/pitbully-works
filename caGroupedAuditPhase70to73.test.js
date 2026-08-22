import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA grouped audit phases 70–73 — federal dividend gross-up and DTC", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("grosses up eligible Canadian dividends by 38% and applies the 15.0198% federal DTC", () => {
    const r = tax.calculateFederalDividendTax({ eligibleDividends: 1000 });
    expect(r.eligibleTaxable).toBeCloseTo(1380, 10);
    expect(r.eligibleCredit).toBeCloseTo(207.27324, 8);
  });

  it("grosses up non-eligible Canadian dividends by 15% and applies the 9.0301% federal DTC", () => {
    const r = tax.calculateFederalDividendTax({ nonEligibleDividends: 1000 });
    expect(r.nonEligibleTaxable).toBeCloseTo(1150, 10);
    expect(r.nonEligibleCredit).toBeCloseTo(103.84615, 8);
  });

  it("combines eligible and non-eligible dividends without double counting cash dividends", () => {
    const r = tax.calculateFederalDividendTax({ eligibleDividends: 1000, nonEligibleDividends: 1000 });
    expect(r.taxableDividends).toBeCloseTo(2530, 10);
    expect(r.federalDividendTaxCredit).toBeCloseTo(311.11939, 8);
  });

  it("clamps negative dividend inputs to zero", () => {
    const r = tax.calculateFederalDividendTax({ eligibleDividends: -100, nonEligibleDividends: -50, otherTaxableIncome: 25000 });
    expect(r.taxableDividends).toBe(0);
    expect(r.federalDividendTaxCredit).toBe(0);
    expect(r.netFederalTax).toBeCloseTo(r.baseFederalTax, 10);
  });

  it("no longer lists the federal dividend tax credit as unimplemented", () => {
    expect(tax.notImplemented.some((x) => x.includes("連邦") && x.includes("配当税額控除") && x.includes("未実装"))).toBe(false);
    expect(typeof tax.calculateFederalDividendTax).toBe("function");
  });
});
