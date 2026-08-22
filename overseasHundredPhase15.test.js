import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 15 — Saskatchewan 2026 income tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const sk = tax.province.saskatchewan;

  it("protects Saskatchewan bracket thresholds and rates", () => {
    expect(sk.bands.slice(0, 2).map((x) => x.upTo)).toEqual([54532, 155805]);
    expect(sk.bands.map((x) => x.rate)).toEqual([0.105, 0.125, 0.145]);
  });

  it("protects Saskatchewan basic personal amount and credit rate", () => {
    expect(sk.basicPersonalAmount).toBe(20381);
    expect(sk.basicCreditRate).toBe(0.105);
  });

  it("calculates Saskatchewan provincial income tax", () => {
    const r = tax.calculateSaskatchewanTax(80000);
    const gross = 54532 * 0.105 + (80000 - 54532) * 0.125;
    const credit = 20381 * 0.105;
    expect(r.grossTax).toBeCloseTo(gross, 6);
    expect(r.basicCredit).toBeCloseTo(credit, 6);
    expect(r.tax).toBeCloseTo(gross - credit, 6);
  });

  it("routes Saskatchewan through the common provincial calculator", () => {
    const direct = tax.calculateSaskatchewanTax(90000);
    const routed = tax.calculateProvincialTax(90000, "SK");
    expect(routed.tax).toBeCloseTo(direct.tax, 8);
    expect(routed.unsupported).not.toBe(true);
  });

  it("uses Saskatchewan tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "SK")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "SK")).toBeGreaterThan(0);
  });
});
