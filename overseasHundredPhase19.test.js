import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 19 — Prince Edward Island 2026 provincial tax", () => {
  const tax = CA_COUNTRY_RULES.tax;
  const pe = tax.province.princeEdwardIsland;

  it("protects CRA 2026 PEI brackets and rates", () => {
    expect(pe.bands.slice(0, 5).map((x) => x.upTo)).toEqual([33928, 65820, 106890, 142520, 200000]);
    expect(pe.bands.map((x) => x.rate)).toEqual([0.095, 0.1347, 0.166, 0.1762, 0.19, 0.20]);
  });

  it("protects the CRA 2026 PEI basic personal amount", () => {
    expect(pe.basicPersonalAmount).toBe(15000);
    expect(pe.basicCreditRate).toBe(0.095);
  });

  it("calculates PEI income tax progressively including the new 20% bracket", () => {
    const income = 220000;
    const gross =
      33928 * 0.095 +
      (65820 - 33928) * 0.1347 +
      (106890 - 65820) * 0.166 +
      (142520 - 106890) * 0.1762 +
      (200000 - 142520) * 0.19 +
      (income - 200000) * 0.20;
    expect(tax.calculatePrinceEdwardIslandTax(income).tax)
      .toBeCloseTo(gross - 15000 * 0.095, 6);
  });

  it("routes PE through the common provincial calculator", () => {
    expect(tax.calculateProvincialTax(90000, "PE").tax)
      .toBeCloseTo(tax.calculatePrinceEdwardIslandTax(90000).tax, 8);
  });

  it("uses PE tax for capital gains and RRSP savings", () => {
    expect(tax.calculateProvincialCapitalGainsTax(50000, 80000, "PE")).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000, 90000, 30000, "PE")).toBeGreaterThan(0);
  });
});
