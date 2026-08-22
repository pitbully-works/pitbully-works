import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 14 — Manitoba 2026 income tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const mb = tax.province.manitoba;

  it("protects Manitoba bracket thresholds and rates", () => {
    expect(mb.bands.slice(0, 2).map((x) => x.upTo)).toEqual([47564, 101200]);
    expect(mb.bands.map((x) => x.rate)).toEqual([0.108, 0.1275, 0.174]);
  });

  it("protects Manitoba basic personal amount and credit rate", () => {
    expect(mb.basicPersonalAmount).toBe(15780);
    expect(mb.basicCreditRate).toBe(0.108);
  });

  it("calculates Manitoba provincial income tax", () => {
    const r = tax.calculateManitobaTax(80000);
    const gross = 47564 * 0.108 + (80000 - 47564) * 0.1275;
    const credit = 15780 * 0.108;
    expect(r.grossTax).toBeCloseTo(gross, 6);
    expect(r.basicCredit).toBeCloseTo(credit, 6);
    expect(r.tax).toBeCloseTo(gross - credit, 6);
  });

  it("routes Manitoba through the common provincial calculator", () => {
    const direct = tax.calculateManitobaTax(90000);
    const routed = tax.calculateProvincialTax(90000, "MB");
    expect(routed.tax).toBeCloseTo(direct.tax, 8);
    expect(routed.unsupported).not.toBe(true);
  });

  it("uses Manitoba tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "MB")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "MB")).toBeGreaterThan(0);
  });
});
