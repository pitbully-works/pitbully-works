import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 102-105 - under-60 Super lump-sum taxed-element tax", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("keeps the tax-free component free and applies the 22% maximum including Medicare below preservation age", () => {
    const r = tax.calculateSuperLumpSumTaxedElement({
      age: 55,
      preservationAge: 60,
      taxFreeComponent: 20000,
      taxedElement: 100000,
    });
    expect(r.estimatedMaximumTax).toBeCloseTo(22000, 8);
    expect(r.netAfterEstimatedMaximumTax).toBeCloseTo(98000, 8);
    expect(r.lowRateCapApplied).toBe(0);
  });

  it("supports the statutory preservation-age-to-59 low-rate-cap branch", () => {
    const r = tax.calculateSuperLumpSumTaxedElement({
      age: 59,
      preservationAge: 59,
      taxedElement: 300000,
      lowRateCapRemaining: 260000,
    });
    expect(r.lowRateCapApplied).toBe(260000);
    expect(r.taxableAtMaximumRate).toBe(40000);
    expect(r.estimatedMaximumTax).toBeCloseTo(6800, 8);
  });

  it("uses only the remaining lifetime low-rate cap when a prior amount has already been used", () => {
    const r = tax.calculateSuperLumpSumTaxedElement({
      age: 59,
      preservationAge: 59,
      taxedElement: 100000,
      lowRateCapRemaining: 25000,
    });
    expect(r.lowRateCapApplied).toBe(25000);
    expect(r.taxableAtMaximumRate).toBe(75000);
    expect(r.estimatedMaximumTax).toBeCloseTo(12750, 8);
  });

  it("makes the taxed element tax free from age 60 and preserves the 2026-27 A$260,000 low-rate cap", () => {
    const r = tax.calculateSuperLumpSumTaxedElement({
      age: 60,
      taxedElement: 500000,
      taxFreeComponent: 10000,
    });
    expect(AU_COUNTRY_RULES.tax.superannuation.lowRateCap).toBe(260000);
    expect(r.estimatedMaximumTax).toBe(0);
    expect(r.netAfterEstimatedMaximumTax).toBe(510000);
  });

  it("documents the remaining complex Super benefit tax cases instead of treating them as automated", () => {
    const all = tax.notImplemented.join(" / ");
    expect(all).toMatch(/untaxed element/);
    expect(all).toMatch(/income stream/);
    expect(typeof tax.calculateSuperLumpSumTaxedElement).toBe("function");
  });
});
