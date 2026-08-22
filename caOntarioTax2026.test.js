import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

describe("CA 2026 Ontario provincial income tax", () => {
  it("uses the 2026 Ontario brackets and BPA", () => {
    expect(tax.province.ontario.bands[0]).toEqual({ upTo: 53891, rate: 0.0505 });
    expect(tax.province.ontario.basicPersonalAmount).toBe(12989);
  });
  it("Ontario Health Premium is zero at 20,000 and capped at 900", () => {
    expect(tax.calculateOntarioHealthPremium(20000)).toBe(0);
    expect(tax.calculateOntarioHealthPremium(21000)).toBeCloseTo(60, 6);
    expect(tax.calculateOntarioHealthPremium(500000)).toBe(900);
  });
  it("applies the 2026 Ontario surtax thresholds", () => {
    expect(tax.province.ontario.surtaxThreshold1).toBe(5818);
    expect(tax.province.ontario.surtaxThreshold2).toBe(7446);
    expect(tax.calculateOntarioTax(200000).surtax).toBeGreaterThan(0);
  });
  it("returns a positive Ontario tax for ordinary taxable income", () => {
    const r = tax.calculateOntarioTax(80000);
    expect(r.tax).toBeGreaterThan(0);
    expect(r.healthPremium).toBeGreaterThan(0);
  });
  it("does not invent provincial tax for unsupported provinces", () => {
    const r = tax.calculateProvincialTax(80000, "XX");
    expect(r.tax).toBe(0);
    expect(r.unsupported).toBe(true);
  });
  it("includes provincial tax on taxable capital gains for supported provinces", () => {
    expect(tax.calculateProvincialCapitalGainsTax(20000, 60000, "ON")).toBeGreaterThan(0);
    expect(tax.calculateProvincialCapitalGainsTax(20000, 60000, "BC")).toBeGreaterThan(0);
    expect(tax.calculateProvincialCapitalGainsTax(20000, 60000, "NL")).toBeGreaterThan(0);
  });
  it("RRSP contributions also reduce Ontario tax when Ontario is selected", () => {
    expect(tax.calculateProvincialRrspTaxSaving(10000, 100000, 20000, "ON")).toBeGreaterThan(0);
  });
});
