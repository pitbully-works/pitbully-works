import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 12 — British Columbia 2026 income tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const bc = tax.province.britishColumbia;

  it("protects the 2026 BC bracket thresholds and rates", () => {
    expect(bc.bands.slice(0, 6).map((x) => x.upTo)).toEqual([
      50363, 100728, 115648, 140430, 190405, 265545,
    ]);
    expect(bc.bands.map((x) => x.rate)).toEqual([
      0.056, 0.077, 0.105, 0.1229, 0.147, 0.168, 0.205,
    ]);
  });

  it("uses the 2026 BC basic personal amount and tax reduction", () => {
    expect(bc.basicPersonalAmount).toBe(13216);
    expect(bc.taxReductionMax).toBe(690);
    expect(bc.taxReductionThreshold).toBe(25570);
    expect(bc.taxReductionPhaseoutRate).toBeCloseTo(0.0356, 8);
  });

  it("calculates BC tax and low-income tax reduction", () => {
    const low = tax.calculateBritishColumbiaTax(25000);
    expect(low.grossTax).toBeCloseTo(1400, 2);
    expect(low.basicCredit).toBeCloseTo(740.096, 3);
    expect(low.taxReduction).toBeCloseTo(659.904, 3);
    expect(low.tax).toBeCloseTo(0, 6);

    const high = tax.calculateBritishColumbiaTax(100000);
    expect(high.tax).toBeGreaterThan(0);
    expect(high.taxReduction).toBe(0);
  });

  it("routes BC through the common provincial calculator", () => {
    const direct = tax.calculateBritishColumbiaTax(90000);
    const routed = tax.calculateProvincialTax(90000, "BC");
    expect(routed.tax).toBeCloseTo(direct.tax, 8);
    expect(routed.unsupported).not.toBe(true);
  });

  it("uses BC tax for provincial capital gains and RRSP saving", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "BC")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "BC")).toBeGreaterThan(0);
  });
});
