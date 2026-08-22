import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 8 — Canada 2026 employee CPP/QPP and EI", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("uses 2026 CPP thresholds and rates", () => {
    const r = tax.calculateEmployeePensionContribution(85000, "ON");
    expect(r.plan).toBe("CPP");
    expect(r.first).toBeCloseTo(4230.45, 2);
    expect(r.second).toBeCloseTo(416.00, 2);
    expect(r.total).toBeCloseTo(4646.45, 2);
  });

  it("uses QPP 6.30 percent and the second additional band in Quebec", () => {
    const r = tax.calculateEmployeePensionContribution(85000, "QC");
    expect(r.plan).toBe("QPP");
    expect(r.first).toBeCloseTo(4479.30, 2);
    expect(r.second).toBeCloseTo(416.00, 2);
  });

  it("caps EI at the 2026 maximum and applies the Quebec reduced rate", () => {
    expect(tax.calculateEmployeeEiPremium(100000, "ON")).toBeCloseTo(1123.07, 2);
    expect(tax.calculateEmployeeEiPremium(100000, "QC")).toBeCloseTo(895.70, 2);
  });

  it("returns a combined payroll deduction total", () => {
    const r = tax.calculateEmployeePayrollDeductions(85000, "ON");
    expect(r.pensionContribution).toBeCloseTo(4646.45, 2);
    expect(r.eiPremium).toBeCloseTo(1123.07, 2);
    expect(r.total).toBeCloseTo(5769.52, 2);
  });

  it("integrates employment income and payroll cards into the Canada UI", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("employmentIncomeAnnual");
    expect(app).toContain("calculateEmployeePayrollDeductions");
    expect(app).toContain("caCppEiLabel");
    expect(app).toContain("caPayrollDeductions.total");
  });
});
