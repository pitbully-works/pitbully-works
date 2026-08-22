import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 7 — GB Class 1 employee National Insurance", () => {
  it("uses the official 2026/27 category A thresholds and rates", () => {
    const ni = GB_COUNTRY_RULES.tax.nationalInsurance;
    expect(ni.primaryThresholdAnnual).toBe(12570);
    expect(ni.upperEarningsLimitAnnual).toBe(50270);
    expect(ni.mainRate).toBe(0.08);
    expect(ni.additionalRate).toBe(0.02);
  });
  it("calculates zero at the primary threshold", () => { expect(GB_COUNTRY_RULES.tax.calculateEmployeeNationalInsurance(12570)).toBe(0); });
  it("calculates 8 percent between PT and UEL", () => { expect(GB_COUNTRY_RULES.tax.calculateEmployeeNationalInsurance(22570)).toBeCloseTo(800, 8); });
  it("calculates 2 percent above the UEL", () => { const expected = (50270 - 12570) * 0.08 + 10000 * 0.02; expect(GB_COUNTRY_RULES.tax.calculateEmployeeNationalInsurance(60270)).toBeCloseTo(expected, 8); });
  it("integrates employment income and NI into the GB UI total", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("employmentIncomeAnnual");
    expect(app).toContain("calculateEmployeeNationalInsurance");
    expect(app).toContain("gbIncomeTaxResult.tax + gbNationalInsurance + gbDividendTax");
    expect(app).toContain("gbNationalInsuranceLabel");
  });
});
