import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 16 — Nova Scotia provincial tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const ns = tax.province.novaScotia;

  it("protects Nova Scotia bracket structure", () => {
    expect(ns.bands.slice(0, 4).map((x) => x.upTo)).toEqual([30995, 61991, 97417, 157124]);
    expect(ns.bands.map((x) => x.rate)).toEqual([0.0879, 0.1495, 0.1667, 0.175, 0.21]);
  });

  it("protects Nova Scotia basic personal amount", () => {
    expect(ns.basicPersonalAmount).toBe(11932);
    expect(ns.basicCreditRate).toBe(0.0879);
  });

  it("calculates Nova Scotia income tax progressively", () => {
    const income = 80000;
    const gross = 30995 * 0.0879 + (61991 - 30995) * 0.1495 + (income - 61991) * 0.1667;
    const credit = 11932 * 0.0879;
    const r = tax.calculateNovaScotiaTax(income);
    expect(r.grossTax).toBeCloseTo(gross, 6);
    expect(r.tax).toBeCloseTo(gross - credit, 6);
  });

  it("routes Nova Scotia through the common provincial calculator", () => {
    expect(tax.calculateProvincialTax(90000, "NS").tax)
      .toBeCloseTo(tax.calculateNovaScotiaTax(90000).tax, 8);
  });

  it("uses Nova Scotia tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "NS")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "NS")).toBeGreaterThan(0);
  });
});
