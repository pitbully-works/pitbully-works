import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 13 — Alberta 2026 income tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const ab = tax.province.alberta;

  it("protects the 2026 Alberta thresholds and rates", () => {
    expect(ab.bands.slice(0, 5).map((x) => x.upTo)).toEqual([
      61200, 154259, 185111, 246813, 370220,
    ]);
    expect(ab.bands.map((x) => x.rate)).toEqual([
      0.08, 0.10, 0.12, 0.13, 0.14, 0.15,
    ]);
  });

  it("uses the 2026 Alberta basic personal amount and 8 percent credit rate", () => {
    expect(ab.basicPersonalAmount).toBe(22769);
    expect(ab.basicCreditRate).toBe(0.08);
  });

  it("calculates Alberta provincial income tax", () => {
    const r = tax.calculateAlbertaTax(100000);
    const gross = 61200 * 0.08 + (100000 - 61200) * 0.10;
    const credit = 22769 * 0.08;
    expect(r.grossTax).toBeCloseTo(gross, 6);
    expect(r.basicCredit).toBeCloseTo(credit, 6);
    expect(r.tax).toBeCloseTo(gross - credit, 6);
  });

  it("routes Alberta through the common provincial calculator", () => {
    const direct = tax.calculateAlbertaTax(90000);
    const routed = tax.calculateProvincialTax(90000, "AB");
    expect(routed.tax).toBeCloseTo(direct.tax, 8);
    expect(routed.unsupported).not.toBe(true);
  });

  it("uses Alberta tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "AB")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "AB")).toBeGreaterThan(0);
  });
});
