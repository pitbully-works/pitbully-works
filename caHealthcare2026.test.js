import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA 2026 healthcare / CDCP", () => {
  const h = CA_COUNTRY_RULES.healthcare;
  it("tracks all 13 provinces and territories", () => {
    expect(h.provinces).toHaveLength(13);
    expect(h.provinces).toContain("ON");
    expect(h.provinces).toContain("QC");
    expect(h.canadaHealthAct.physicianEquivalentPolicyEffective).toBe("2026-04-01");
  });
  it("CDCP is 0% copay below C$70k when other basic eligibility is met", () => {
    const r = h.getCdcpEligibility({ adjustedFamilyNetIncome: 69999, hasPrivateDentalCoverage: false, taxReturnFiled: true, canadianResident: true });
    expect(r.eligible).toBe(true);
    expect(r.copayRate).toBe(0);
  });
  it("CDCP copay is 40% from C$70k to under C$80k", () => {
    const r = h.getCdcpEligibility({ adjustedFamilyNetIncome: 75000, hasPrivateDentalCoverage: false, taxReturnFiled: true, canadianResident: true });
    expect(r.eligible).toBe(true);
    expect(r.copayRate).toBe(0.40);
  });
  it("CDCP copay is 60% from C$80k to under C$90k and ineligible at C$90k", () => {
    expect(h.getCdcpEligibility({ adjustedFamilyNetIncome: 85000 }).copayRate).toBe(0.60);
    expect(h.getCdcpEligibility({ adjustedFamilyNetIncome: 90000 }).eligible).toBe(false);
  });
  it("private dental coverage makes the user ineligible", () => {
    expect(h.getCdcpEligibility({ adjustedFamilyNetIncome: 50000, hasPrivateDentalCoverage: true }).eligible).toBe(false);
  });
  it("annual total uses CDCP estimated copay in cdcp mode", () => {
    const total = h.getAnnualTotal({ dentalMode: "cdcp", adjustedFamilyNetIncome: 75000, cdcpEligibleFeesAnnual: 1000, basicAnnual: 100, prescriptionAnnual: 200 });
    expect(total).toBe(700);
  });
});
