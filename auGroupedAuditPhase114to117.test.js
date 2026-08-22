import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 114-117 - Age Pension residence and overseas portability", () => {
  const r = AU_COUNTRY_RULES.retirement;

  it("requires 10 total residence years with at least 5 continuous under the normal rule", () => {
    expect(r.getAgePensionResidenceEligibility({
      australianResident: true,
      inAustraliaOnClaimDay: true,
      residenceYearsTotal: 10,
      longestContinuousResidenceYears: 5,
    }).eligible).toBe(true);

    expect(r.getAgePensionResidenceEligibility({
      australianResident: true,
      inAustraliaOnClaimDay: true,
      residenceYearsTotal: 10,
      longestContinuousResidenceYears: 4.99,
    }).eligible).toBe(false);
  });

  it("allows an explicit exemption or international-agreement gateway", () => {
    expect(r.getAgePensionResidenceEligibility({
      residenceExemption: true,
    }).eligible).toBe(true);
    expect(r.getAgePensionResidenceEligibility({
      internationalAgreementEligible: true,
    }).eligible).toBe(true);
  });

  it("combines age 67 with the residence gateway", () => {
    expect(r.getAgePensionEligibility({
      age: 66,
      residenceExemption: true,
    }).eligible).toBe(false);
    expect(r.getAgePensionEligibility({
      age: 67,
      australianResident: true,
      inAustraliaOnClaimDay: true,
      residenceYearsTotal: 15,
      longestContinuousResidenceYears: 8,
    }).eligible).toBe(true);
  });

  it("uses the 35-year AWLR proportion after more than 26 weeks overseas", () => {
    expect(r.getOverseasAgePensionPortabilityFactor({
      weeksOutsideAustralia: 26,
      australianWorkingLifeResidenceYears: 10,
    })).toBe(1);
    expect(r.getOverseasAgePensionPortabilityFactor({
      weeksOutsideAustralia: 27,
      australianWorkingLifeResidenceYears: 10,
    })).toBeCloseTo(10 / 35, 10);
    expect(r.getOverseasAgePensionPortabilityFactor({
      weeksOutsideAustralia: 40,
      australianWorkingLifeResidenceYears: 40,
    })).toBe(1);
  });
});
