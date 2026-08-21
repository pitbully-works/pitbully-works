import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const calc = (x) => AU_COUNTRY_RULES.estate.calculateSuperDeathBenefitIncomeStream(x);

describe("AU 2026-27 Super death benefit income stream", () => {
  it("dependant: deceased 60+ makes taxed element tax-free and untaxed gets 10% offset", () => {
    const r = calc({ recipientAge: 45, deceasedAge: 65, taxFreeComponent: 10000, taxedElement: 50000, untaxedElement: 20000, isDeathBenefitsDependant: true });
    expect(r.eligible).toBe(true); expect(r.taxFreeAmount).toBe(60000); expect(r.assessableAmount).toBe(20000); expect(r.taxOffsetAmount).toBe(2000);
  });
  it("dependant: recipient 60+ gives same treatment", () => {
    const r = calc({ recipientAge: 60, deceasedAge: 55, taxedElement: 50000, untaxedElement: 20000, isDeathBenefitsDependant: true });
    expect(r.taxFreeAmount).toBe(50000); expect(r.assessableAmount).toBe(20000); expect(r.taxOffsetAmount).toBe(2000);
  });
  it("both under 60: tax-free component exempt, taxed element assessable with 15% offset", () => {
    const r = calc({ recipientAge: 40, deceasedAge: 55, taxFreeComponent: 10000, taxedElement: 50000, untaxedElement: 20000, isDeathBenefitsDependant: true });
    expect(r.taxFreeAmount).toBe(10000); expect(r.assessableAmount).toBe(70000); expect(r.taxOffsetAmount).toBe(7500); expect(r.taxOffsetRateTaxed).toBe(.15); expect(r.taxOffsetRateUntaxed).toBe(0);
  });
  it("non-dependant is not treated as eligible for this estimator", () => {
    const r = calc({ recipientAge: 65, deceasedAge: 65, taxedElement: 50000, isDeathBenefitsDependant: false });
    expect(r.eligible).toBe(false); expect(r.reason).toBe("nonDependant");
  });
  it("negative inputs are clamped", () => {
    const r = calc({ recipientAge: -1, deceasedAge: -2, taxFreeComponent: -100, taxedElement: -20, untaxedElement: -3 });
    expect(r.gross).toBe(0); expect(r.recipientAge).toBe(0); expect(r.deceasedAge).toBe(0);
  });
  it("does not pretend the offset is final tax payable", () => {
    const r = calc({ recipientAge: 45, deceasedAge: 50, taxedElement: 100000, untaxedElement: 10000 });
    expect(r.finalTaxCalculated).toBe(false); expect(r.assessableAmount).toBe(110000); expect(r.taxOffsetAmount).toBe(15000);
  });
});
