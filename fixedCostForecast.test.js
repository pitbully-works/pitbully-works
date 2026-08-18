import { describe, expect, it } from "vitest";
import { FIXED_COST_TEMPLATE_KEYS, deriveTaxFixedCostForecastRows } from "./utils/fixedCostForecast.js";

describe("tax/fixed-cost annual forecast", () => {
  it("turns cumulative engine charges into annual predicted amounts without double counting", () => {
    const rows = deriveTaxFixedCostForecastRows([
      { age: 65, charge_publicPensionTax: 0, charge_privatePensionTax_0: 0, charge_fixedCost_0: 0, charge_otherAnnualTaxes: 0 },
      { age: 66, charge_publicPensionTax: 49000, charge_privatePensionTax_0: 10000, charge_fixedCost_0: 120000, charge_otherAnnualTaxes: 30000 },
      { age: 67, charge_publicPensionTax: 98000, charge_privatePensionTax_0: 20000, charge_fixedCost_0: 240000, charge_otherAnnualTaxes: 60000 },
    ], [{ name: "Property tax" }]);

    expect(rows[1].annualPublicPensionTax).toBe(49000);
    expect(rows[1].annualPrivatePensionTax).toBe(10000);
    expect(rows[1].annualFixedCost_0).toBe(120000);
    expect(rows[1].annualOtherTaxes).toBe(30000);
    expect(rows[2].annualPublicPensionTax).toBe(49000);
    expect(rows[2].annualFixedCost_0).toBe(120000);
    expect(rows[2].cumulativeOtherFixedCosts).toBe(300000);
  });

  it("uses country templates that exclude insurance, loans and healthcare", () => {
    for (const country of ["JP", "US", "GB", "CA", "AU"]) {
      const keys = FIXED_COST_TEMPLATE_KEYS[country] || [];
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.some((key) => /insurance|loan|medical|health/i.test(key))).toBe(false);
    }
  });

  it("keeps country-specific fixed-cost candidates", () => {
    expect(FIXED_COST_TEMPLATE_KEYS.JP).toContain("fixedCostTplPropertyTax");
    expect(FIXED_COST_TEMPLATE_KEYS.US).toContain("fixedCostTplHoaFee");
    expect(FIXED_COST_TEMPLATE_KEYS.GB).toContain("fixedCostTplCouncilTax");
    expect(FIXED_COST_TEMPLATE_KEYS.CA).toContain("fixedCostTplCondoFee");
    expect(FIXED_COST_TEMPLATE_KEYS.AU).toContain("fixedCostTplCouncilRates");
  });
});
