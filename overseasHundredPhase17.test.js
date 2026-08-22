import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 17 — Nova Scotia 2026 official-value correction", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const ns = tax.province.novaScotia;

  it("uses the CRA 2026 Nova Scotia basic personal amount", () => {
    expect(ns.basicPersonalAmount).toBe(11932);
    expect(ns.basicCreditRate).toBe(0.0879);
  });

  it("applies the corrected BPA to Nova Scotia tax", () => {
    const income = 80000;
    const gross =
      30995 * 0.0879 +
      (61991 - 30995) * 0.1495 +
      (income - 61991) * 0.1667;
    const expected = gross - 11932 * 0.0879;
    expect(tax.calculateNovaScotiaTax(income).tax).toBeCloseTo(expected, 6);
  });

  it("keeps the common NS router aligned with the dedicated calculator", () => {
    expect(tax.calculateProvincialTax(80000, "NS").tax)
      .toBeCloseTo(tax.calculateNovaScotiaTax(80000).tax, 8);
  });
});
