import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA 2026 long-term care", () => {
  const h = CA_COUNTRY_RULES.healthcare;

  it("stores Ontario maximum co-payment rates effective 1 July 2026", () => {
    expect(h.longTermCare.automaticRegions).toContain("ON");
    expect(h.longTermCare.ontario.effectiveFrom).toBe("2026-07-01");
    expect(h.longTermCare.ontario.longStay.basic.monthly).toBe(2129.17);
    expect(h.longTermCare.ontario.longStay.semiPrivate.monthly).toBe(2567.17);
    expect(h.longTermCare.ontario.longStay.private.monthly).toBe(3041.97);
    expect(h.longTermCare.ontario.shortStay.daily).toBe(45.31);
  });

  it("calculates a 12-month Ontario basic-room estimate", () => {
    const total = h.getLongTermCareOutOfPocket({
      province: "ON", longTermCareMode: "ontario2026", longTermCareAccommodation: "basic", longTermCareMonths: 12,
    });
    expect(total).toBeCloseTo(25550.04, 2);
  });

  it("calculates Ontario private accommodation for the entered months", () => {
    const total = h.getLongTermCareOutOfPocket({
      province: "ON", longTermCareMode: "ontario2026", longTermCareAccommodation: "private", longTermCareMonths: 6,
    });
    expect(total).toBeCloseTo(18251.82, 2);
  });

  it("keeps non-Ontario long-term-care costs manual rather than inventing a national rate", () => {
    expect(h.getLongTermCareOutOfPocket({ province: "BC", longTermCareMode: "ontario2026", longTermCareAnnual: 12345 })).toBe(12345);
  });

  it("includes the Ontario automatic estimate in annual healthcare total", () => {
    const total = h.getAnnualTotal({
      province: "ON", longTermCareMode: "ontario2026", longTermCareAccommodation: "basic", longTermCareMonths: 12,
      basicAnnual: 100, prescriptionAnnual: 200, dentalAnnual: 300,
    });
    expect(total).toBeCloseTo(26150.04, 2);
  });
});
