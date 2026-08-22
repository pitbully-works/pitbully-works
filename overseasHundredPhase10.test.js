import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 10 — Quebec 2026 tax", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("uses 2026 Quebec brackets and BPA", () => {
    expect(tax.province.quebec.bands.map((x) => x.rate)).toEqual([0.14, 0.19, 0.24, 0.2575]);
    expect(tax.province.quebec.bands.slice(0, 3).map((x) => x.upTo)).toEqual([54345, 108680, 132245]);
    expect(tax.province.quebec.basicPersonalAmount).toBe(18952);
  });

  it("calculates basic Quebec provincial tax", () => {
    const r = tax.calculateQuebecTax(50000);
    expect(r.grossTax).toBeCloseTo(7000, 2);
    expect(r.basicCredit).toBeCloseTo(2653.28, 2);
    expect(r.tax).toBeCloseTo(4346.72, 2);
  });

  it("applies 16.5 percent Quebec federal abatement", () => {
    const base = tax.calculateFederalTax(100000);
    const qc = tax.calculateFederalTaxForProvince(100000, "QC");
    expect(qc.abatementRate).toBeCloseTo(0.165, 8);
    expect(qc.abatement).toBeCloseTo(base.tax * 0.165, 2);
    expect(qc.taxAfterAbatement).toBeCloseTo(base.tax * 0.835, 2);
  });

  it("does not abate federal tax outside Quebec", () => {
    const on = tax.calculateFederalTaxForProvince(100000, "ON");
    expect(on.abatement).toBe(0);
    expect(on.taxAfterAbatement).toBeCloseTo(on.tax, 2);
  });

  it("integrates Quebec tax and abatement in Canada UI", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("calculateFederalTaxForProvince");
    expect(app).toContain("caFederalTaxResult.taxAfterAbatement");
    expect(app).toContain("caQuebecAbatementLabel");
    expect(app).toContain("calculateCapitalGainsTaxForProvince");
  });
});
