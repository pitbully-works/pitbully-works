import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const ret = CA_COUNTRY_RULES.retirement;

describe("CA grouped audit phases 54-57 — OAS/GIS/Allowance eligibility boundaries", () => {
  it("requires 10 residence years in Canada but 20 when applying while outside Canada", () => {
    expect(ret.getOasMinimumResidenceYears()).toBe(10);
    expect(ret.getOasMinimumResidenceYears({ livingOutsideCanada: true })).toBe(20);
    expect(ret.isOasResidenceEligible(10)).toBe(true);
    expect(ret.isOasResidenceEligible(19, { livingOutsideCanada: true })).toBe(false);
    expect(ret.isOasResidenceEligible(20, { livingOutsideCanada: true })).toBe(true);
  });

  it("allows a social-security agreement to satisfy eligibility without inflating the Canadian residence fraction", () => {
    const options = { livingOutsideCanada: true, qualifiesViaSocialSecurityAgreement: true };
    expect(ret.isOasResidenceEligible(8, options)).toBe(true);
    expect(ret.getOasResidenceFraction(8, options)).toBeCloseTo(8 / 40, 10);
  });

  it("keeps backwards-compatible in-Canada OAS calculation and applies the outside-Canada gate when requested", () => {
    const inside = ret.getOasAnnualBeforeClawback(65, 65, 10);
    const outside = ret.getOasAnnualBeforeClawback(65, 65, 10, { livingOutsideCanada: true });
    expect(inside).toBeCloseTo(ret.getOasMaxAnnual(65) * 0.25, 8);
    expect(outside).toBe(0);
  });

  it("GIS basic eligibility requires age 65+, OAS, income below the published cutoff and no active sponsorship", () => {
    expect(ret.isGisEligible({ age: 65, status: "single", annualIncome: 22799, receivesOas: true })).toBe(true);
    expect(ret.isGisEligible({ age: 64, status: "single", annualIncome: 0, receivesOas: true })).toBe(false);
    expect(ret.isGisEligible({ age: 65, status: "single", annualIncome: 22800, receivesOas: true })).toBe(false);
    expect(ret.isGisEligible({ age: 65, status: "single", annualIncome: 0, receivesOas: false })).toBe(false);
    expect(ret.isGisEligible({ age: 65, status: "single", annualIncome: 0, underSponsorshipAgreement: true })).toBe(false);
  });

  it("Allowance enforces ages 60-64, 10 years of residence, income cutoff and sponsorship gate", () => {
    const base = { age: 60, combinedAnnualIncome: 42143, residenceYears: 10 };
    expect(ret.isAllowanceEligible(base)).toBe(true);
    expect(ret.isAllowanceEligible({ ...base, age: 65 })).toBe(false);
    expect(ret.isAllowanceEligible({ ...base, residenceYears: 9 })).toBe(false);
    expect(ret.isAllowanceEligible({ ...base, combinedAnnualIncome: 42144 })).toBe(false);
    expect(ret.isAllowanceEligible({ ...base, underSponsorshipAgreement: true })).toBe(false);
  });

  it("Allowance for the Survivor additionally requires a deceased spouse/partner and no new union", () => {
    const base = { age: 64, annualIncome: 30695, residenceYears: 10, spouseOrPartnerDied: true };
    expect(ret.isAllowanceSurvivorEligible(base)).toBe(true);
    expect(ret.isAllowanceSurvivorEligible({ ...base, spouseOrPartnerDied: false })).toBe(false);
    expect(ret.isAllowanceSurvivorEligible({ ...base, remarriedOrNewCommonLaw: true })).toBe(false);
    expect(ret.isAllowanceSurvivorEligible({ ...base, annualIncome: 30696 })).toBe(false);
  });
});
