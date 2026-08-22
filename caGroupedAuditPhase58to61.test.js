import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

describe("CA grouped audit phases 58-61 - self-employed CPP and pension-income splitting", () => {
  it("calculates 2026 self-employed CPP at 11.90% from YBE to YMPE", () => {
    const r = tax.calculateSelfEmployedCppContribution(74600, "ON");
    expect(r.supported).toBe(true);
    expect(r.plan).toBe("CPP");
    expect(r.first).toBeCloseTo(8460.90, 8);
    expect(r.second).toBe(0);
    expect(r.total).toBeCloseTo(8460.90, 8);
  });

  it("adds 8% CPP2 up to the 2026 YAMPE and respects both statutory maxima", () => {
    const r = tax.calculateSelfEmployedCppContribution(100000, "BC");
    expect(r.first).toBeCloseTo(8460.90, 8);
    expect(r.second).toBeCloseTo(832.00, 8);
    expect(r.total).toBeCloseTo(9292.90, 8);
  });

  it("does not invent Quebec self-employed QPP rates inside the CPP helper", () => {
    const r = tax.calculateSelfEmployedCppContribution(85000, "QC");
    expect(r).toEqual({ plan: "QPP", supported: false, first: 0, second: 0, total: 0 });
  });

  it("caps a pension-income-splitting election at 50% of eligible pension income", () => {
    const r = tax.getPensionIncomeSplit({ eligiblePensionIncome: 40000, requestedSplit: 30000 });
    expect(r.maximumTransfer).toBe(20000);
    expect(r.transferred).toBe(20000);
    expect(r.pensionerRetains).toBe(20000);
  });

  it("allows an election below the 50% maximum", () => {
    const r = tax.getPensionIncomeSplit({ eligiblePensionIncome: 40000, requestedSplit: 12000 });
    expect(r.transferred).toBe(12000);
    expect(r.pensionerRetains).toBe(28000);
  });

  it("normalizes negative or malformed pension splitting inputs without creating negative income", () => {
    expect(tax.getPensionIncomeSplit({ eligiblePensionIncome: -1, requestedSplit: 999 }).transferred).toBe(0);
    expect(tax.getPensionIncomeSplit({ eligiblePensionIncome: 10000, requestedSplit: -50 }).transferred).toBe(0);
  });
});
