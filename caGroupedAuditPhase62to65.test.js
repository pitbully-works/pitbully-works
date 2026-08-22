import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

describe("CA grouped audit phases 62-65 - 2026 self-employed QPP boundaries", () => {
  it("calculates the 12.60% first self-employed QPP contribution above the YBE", () => {
    const r = tax.calculateSelfEmployedQppContribution(74600);
    expect(r.supported).toBe(true);
    expect(r.plan).toBe("QPP");
    expect(r.first).toBeCloseTo(8961.30, 8);
    expect(r.second).toBe(0);
    expect(r.total).toBeCloseTo(8961.30, 8);
  });

  it("adds the 8% second additional contribution up to YAMPE", () => {
    const r = tax.calculateSelfEmployedQppContribution(85000);
    expect(r.first).toBeCloseTo(8961.30, 8);
    expect(r.second).toBeCloseTo(832.00, 8);
    expect(r.total).toBeCloseTo(9793.30, 8);
  });

  it("caps QPP contributions once income exceeds the 2026 YAMPE", () => {
    expect(tax.calculateSelfEmployedQppContribution(200000).total).toBeCloseTo(9793.30, 8);
  });

  it("never creates negative or NaN QPP contributions", () => {
    expect(tax.calculateSelfEmployedQppContribution(-1).total).toBe(0);
    expect(tax.calculateSelfEmployedQppContribution("bad").total).toBe(0);
  });
});
