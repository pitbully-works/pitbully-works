import { describe, expect, it } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("overseas 100 phase 2", () => {
  it("US estimates 2026 federal estate tax above the $15m exclusion", () => {
    const r = US_COUNTRY_RULES.estate.calculateFederalEstateTaxEstimate({ grossEstate: 16000000 });
    expect(r.availableExclusion).toBe(15000000);
    expect(r.taxableAboveExclusion).toBe(1000000);
    expect(r.estimatedFederalEstateTax).toBe(400000);
    expect(US_COUNTRY_RULES.estate.calculateFederalEstateTaxEstimate({
      grossEstate: 17000000, spouseDeduction: 3000000,
    }).estimatedFederalEstateTax).toBe(0);
  });

  it("GB models core Lifetime ISA bonus, first-home and withdrawal-charge rules", () => {
    const inv = GB_COUNTRY_RULES.investment;
    expect(inv.getLifetimeIsaAnnualBonus(4000, 30)).toBe(1000);
    expect(inv.getLifetimeIsaAnnualBonus(6000, 30)).toBe(1000);
    expect(inv.getLifetimeIsaAnnualBonus(4000, 50)).toBe(0);
    expect(inv.canUseLifetimeIsaForFirstHome({
      propertyPrice: 450000, monthsSinceFirstPayment: 12, isFirstHome: true, usesMortgage: true,
    })).toBe(true);
    expect(inv.canUseLifetimeIsaForFirstHome({
      propertyPrice: 450001, monthsSinceFirstPayment: 12, isFirstHome: true, usesMortgage: true,
    })).toBe(false);
    expect(inv.getLifetimeIsaUnauthorisedWithdrawalCharge(10000)).toBe(2500);
  });

  it("CA models CRA RRSP lump-sum withholding bands", () => {
    const inv = CA_COUNTRY_RULES.investment;
    expect(inv.getRrspWithdrawalWithholdingRate(5000)).toBe(0.10);
    expect(inv.getRrspWithdrawalWithholdingRate(5001)).toBe(0.20);
    expect(inv.getRrspWithdrawalWithholdingRate(15001)).toBe(0.30);
    expect(inv.getRrspWithdrawalWithholdingRate(5000, { isQuebec: true })).toBe(0.05);
    expect(inv.getRrspWithdrawalWithholdingRate(20000, { isNonResident: true })).toBe(0.25);
  });

  it("AU excludes a younger partner's accumulation-phase super from Age Pension means tests", () => {
    const ret = AU_COUNTRY_RULES.retirement;
    expect(ret.isSuperAssessableForAgePension(66, false)).toBe(false);
    expect(ret.isSuperAssessableForAgePension(66, true)).toBe(true);
    expect(ret.isSuperAssessableForAgePension(67, false)).toBe(true);
    expect(ret.getAssessableCoupleSuper({
      claimantAge: 67, claimantSuper: 200000,
      partnerAge: 60, partnerSuper: 300000,
    })).toEqual({ claimantAssessable: 200000, partnerAssessable: 0, combinedAssessable: 200000 });
  });
});
