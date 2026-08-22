import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 28 — GB Pension Credit mixed-age eligibility", () => {
  const ret = GB_COUNTRY_RULES.retirement;
  const mixed = ret.pensionCredit.mixedAgeCouples;

  it("protects the 15 May 2019 mixed-age new-claim boundary", () => {
    expect(mixed.newClaimRuleFrom).toBe("2019-05-15");
    expect(mixed.protectedContinuityCutoff).toBe("2019-05-14");
    expect(mixed.bothPartnersNormallyMustReachQualifyingAge).toBe(true);
    expect(mixed.pensionAgeHousingBenefitCanPreserveEligibility).toBe(true);
  });

  it("requires a single claimant to have reached State Pension age", () => {
    expect(ret.assessPensionCreditAgeEligibility({
      status: "single",
      claimantReachedStatePensionAge: false,
    })).toEqual({
      eligible: false,
      reason: "single-below-qualifying-age",
      requiresUniversalCreditRoute: true,
    });

    expect(ret.assessPensionCreditAgeEligibility({
      status: "single",
      claimantReachedStatePensionAge: true,
    }).eligible).toBe(true);
  });

  it("normally requires both partners in a couple to reach qualifying age", () => {
    expect(ret.assessPensionCreditAgeEligibility({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: true,
    })).toEqual({
      eligible: true,
      reason: "both-partners-at-qualifying-age",
      requiresUniversalCreditRoute: false,
    });

    expect(ret.assessPensionCreditAgeEligibility({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
    }).eligible).toBe(false);
  });

  it("preserves protected mixed-age continuity", () => {
    const r = ret.assessPensionCreditAgeEligibility({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
      protectedMixedAgeContinuity: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("protected-mixed-age-continuity");
  });

  it("allows pension-age Housing Benefit continuity to preserve mixed-age eligibility", () => {
    const r = ret.assessPensionCreditAgeEligibility({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
      pensionAgeHousingBenefitContinuity: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.requiresUniversalCreditRoute).toBe(false);
  });

  it("routes an unprotected mixed-age new claim away from Pension Credit", () => {
    const r = ret.assessPensionCreditAgeEligibility({
      status: "couple",
      claimantReachedStatePensionAge: true,
      partnerReachedStatePensionAge: false,
    });
    expect(r).toEqual({
      eligible: false,
      reason: "mixed-age-new-claim",
      requiresUniversalCreditRoute: true,
    });
  });
});
