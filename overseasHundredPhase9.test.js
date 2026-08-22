import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 9 — Quebec 2026 QPIP employee premium", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("uses the 2026 QPIP employee rate and maximum insurable earnings", () => {
    expect(tax.payrollDeductions.qpipMaxInsurableEarnings).toBe(103000);
    expect(tax.payrollDeductions.qpipEmployeeRate).toBeCloseTo(0.00430, 8);
    expect(tax.payrollDeductions.qpipEmployeeMaxPremium).toBeCloseTo(442.90, 2);
  });

  it("caps Quebec QPIP at C$442.90 for 2026", () => {
    expect(tax.calculateEmployeeQpipPremium(50000, "QC")).toBeCloseTo(215.00, 2);
    expect(tax.calculateEmployeeQpipPremium(103000, "QC")).toBeCloseTo(442.90, 2);
    expect(tax.calculateEmployeeQpipPremium(200000, "QC")).toBeCloseTo(442.90, 2);
  });

  it("does not charge QPIP outside Quebec", () => {
    expect(tax.calculateEmployeeQpipPremium(100000, "ON")).toBe(0);
    expect(tax.calculateEmployeeQpipPremium(100000, "BC")).toBe(0);
  });

  it("includes QPIP in Quebec combined employee payroll deductions", () => {
    const qc = tax.calculateEmployeePayrollDeductions(100000, "QC");
    const on = tax.calculateEmployeePayrollDeductions(100000, "ON");
    expect(qc.qpipPremium).toBeGreaterThan(0);
    expect(qc.total).toBeCloseTo(qc.pensionContribution + qc.eiPremium + qc.qpipPremium, 2);
    expect(on.qpipPremium).toBe(0);
  });

  it("passes QPIP into the Canada tax UI summary", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("qpipPremium: caPayrollDeductions.qpipPremium");
    expect(app).toContain("qpip: money(taxResult.qpipPremium || 0)");
    expect(app).toContain("CPP/QPP＋EI＋Quebec QPIP");
  });
});
