import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 98-101 - 2026-27 foreign resident income tax", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("uses 30% from the first dollar up to A$135,000", () => {
    expect(tax.calculateForeignResidentIncomeTax(1)).toBeCloseTo(0.30, 8);
    expect(tax.calculateForeignResidentIncomeTax(135000)).toBeCloseTo(40500, 8);
  });

  it("uses 37% between A$135,000 and A$190,000", () => {
    expect(tax.calculateForeignResidentIncomeTax(190000)).toBeCloseTo(60850, 8);
  });

  it("uses 45% above A$190,000", () => {
    expect(tax.calculateForeignResidentIncomeTax(200000)).toBeCloseTo(65350, 8);
  });

  it("does not apply the resident tax-free threshold or offsets through this function", () => {
    expect(tax.calculateForeignResidentIncomeTax(18200)).toBeCloseTo(5460, 8);
    expect(tax.calculateIncomeTax(18200)).toBe(0);
  });

  it("publishes the foreign-resident source and removes the old unimplemented marker", () => {
    expect(tax.sourceUrls.foreignResidentTax).toContain("ato.gov.au");
    expect(tax.notImplemented.some((x) => x.includes("非居住者"))).toBe(false);
    expect(tax.lastUpdated).toBe("2026-08-23");
  });
});
