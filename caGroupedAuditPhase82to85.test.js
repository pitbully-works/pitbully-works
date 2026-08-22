import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA grouped audit phases 82-85 - final statutory consistency", () => {
  it("keeps the 2026 self-employed QPP first maximum at C$8,958.60", () => {
    const tax = CA_COUNTRY_RULES.tax;
    expect(tax.payrollDeductions.qppSelfEmployedFirstMax).toBe(8958.60);
    const r = tax.calculateSelfEmployedQppContribution(200000);
    expect(r.first).toBeCloseTo(8958.60, 8);
    expect(r.second).toBeCloseTo(832.00, 8);
    expect(r.total).toBeCloseTo(9790.60, 8);
  });

  it("keeps the 2026 federal income-tax bands at 14/20.5/26/29/33 percent", () => {
    expect(CA_COUNTRY_RULES.tax.incomeTax.bands.map((b) => [b.upTo, b.rate])).toEqual([
      [58523, 0.14],
      [117045, 0.205],
      [181440, 0.26],
      [258482, 0.29],
      [Infinity, 0.33],
    ]);
  });

  it("keeps July-September 2026 OAS/GIS headline amounts aligned with the live rules", () => {
    const r = CA_COUNTRY_RULES.retirement;
    expect(r.oas.maxMonthly65to74).toBeCloseTo(751.97, 2);
    expect(r.oas.maxMonthly75plus).toBeCloseTo(827.17, 2);
    expect(r.gis.single.maxMonthly).toBeCloseTo(1123.17, 2);
    expect(r.gis.single.incomeCutoff).toBe(22800);
  });

  it("keeps genuinely non-uniform CA items explicit instead of silently treating them as fully automated", () => {
    const taxMissing = CA_COUNTRY_RULES.tax.notImplemented.join("\n");
    const healthMissing = CA_COUNTRY_RULES.healthcare.notImplemented.join("\n");
    expect(taxMissing).toContain("Alternative Minimum Tax");
    expect(taxMissing).toContain("州・準州の配当税額控除");
    expect(healthMissing.length).toBeGreaterThan(0);
  });
});
