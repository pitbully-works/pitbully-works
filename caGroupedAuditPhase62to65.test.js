import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

describe("CA grouped audit phases 62-65 - 2026 self-employed QPP boundaries", () => {
  it("calculates the 12.60% first self-employed QPP contribution above the YBE", () => {
    const r = tax.calculateSelfEmployedQppContribution(74600);
    expect(r.supported).toBe(true);
    expect(r.plan).toBe("QPP");
    expect(r.first).toBeCloseTo(8958.60, 8);
    expect(r.second).toBe(0);
    expect(r.total).toBeCloseTo(8958.60, 8);
  });

  it("adds the 8% second additional contribution up to YAMPE", () => {
    const r = tax.calculateSelfEmployedQppContribution(85000);
    expect(r.first).toBeCloseTo(8958.60, 8);
    expect(r.second).toBeCloseTo(832.00, 8);
    expect(r.total).toBeCloseTo(9790.60, 8);
  });

  it("caps QPP contributions once income exceeds the 2026 YAMPE", () => {
    const r = tax.calculateSelfEmployedQppContribution(200000);
    expect(r.first).toBeCloseTo(8958.60, 8);
    expect(r.second).toBeCloseTo(832.00, 8);
    expect(r.total).toBeCloseTo(9790.60, 8);
  });
});
