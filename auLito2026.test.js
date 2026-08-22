import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Low Income Tax Offset (LITO)", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("uses the ATO LITO thresholds and taper rates", () => {
    expect(tax.calculateLowIncomeTaxOffset(37500)).toBeCloseTo(700, 6);
    expect(tax.calculateLowIncomeTaxOffset(40000)).toBeCloseTo(575, 6);
    expect(tax.calculateLowIncomeTaxOffset(45000)).toBeCloseTo(325, 6);
    expect(tax.calculateLowIncomeTaxOffset(60000)).toBeCloseTo(100, 6);
    expect(tax.calculateLowIncomeTaxOffset(66667)).toBeCloseTo(0, 1);
    expect(tax.calculateLowIncomeTaxOffset(80000)).toBe(0);
  });

  it("is non-refundable and cannot reduce income tax below zero", () => {
    const r = tax.calculateTotalTax(20000);
    expect(r.litoEntitlement).toBe(700);
    expect(r.litoApplied).toBeCloseTo(270, 6);
    expect(r.incomeTax).toBe(0);
  });

  it("reduces income tax but does not directly offset the Medicare levy", () => {
    const r = tax.calculateTotalTax(45000);
    expect(r.incomeTaxBeforeOffsets).toBeCloseTo(4020, 6);
    expect(r.litoApplied).toBeCloseTo(325, 6);
    expect(r.incomeTax).toBeCloseTo(3695, 6);
    expect(r.medicareLevy).toBeCloseTo(900, 6);
    expect(r.total).toBeCloseTo(4595, 6);
  });

  it("removes LITO from the AU notImplemented list", () => {
    expect(tax.notImplemented.join(" / ")).not.toMatch(/Low Income Tax Offset|LITO/);
    expect(AU_COUNTRY_RULES.meta.coverage.find((x) => x.key === "tax").lastUpdated).toBe("2026-08-23");
  });
});
