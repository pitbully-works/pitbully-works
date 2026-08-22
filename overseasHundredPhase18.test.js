import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 18 — New Brunswick 2026 provincial tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const nb = tax.province.newBrunswick;

  it("protects CRA 2026 New Brunswick brackets and rates", () => {
    expect(nb.bands.slice(0, 3).map((x) => x.upTo)).toEqual([52333, 104666, 193861]);
    expect(nb.bands.map((x) => x.rate)).toEqual([0.094, 0.14, 0.16, 0.195]);
  });

  it("protects the CRA 2026 New Brunswick basic personal amount", () => {
    expect(nb.basicPersonalAmount).toBe(13664);
    expect(nb.basicCreditRate).toBe(0.094);
  });

  it("calculates New Brunswick income tax progressively", () => {
    const income = 120000;
    const gross =
      52333 * 0.094 +
      (104666 - 52333) * 0.14 +
      (income - 104666) * 0.16;
    const expected = gross - 13664 * 0.094;
    expect(tax.calculateNewBrunswickTax(income).tax).toBeCloseTo(expected, 6);
  });

  it("routes NB through the common provincial calculator", () => {
    expect(tax.calculateProvincialTax(90000, "NB").tax)
      .toBeCloseTo(tax.calculateNewBrunswickTax(90000).tax, 8);
  });

  it("uses NB tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "NB")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "NB")).toBeGreaterThan(0);
  });
});
