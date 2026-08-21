import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES, US_COUNTRY_RULES, CA_COUNTRY_RULES, GB_COUNTRY_RULES, AU_COUNTRY_RULES } from "./countryRules/index.js";

describe("2026-08 strict制度監査修正",()=>{
  it("US MFS/HOH use their own 2026 federal brackets",()=>{
    expect(US_COUNTRY_RULES.tax.federalBrackets2026.marriedSeparate.at(-2).upTo).toBe(384350);
    expect(US_COUNTRY_RULES.tax.federalBrackets2026.headOfHousehold[0].upTo).toBe(17700);
    const h=US_COUNTRY_RULES.tax.calculateFederalTax(100000,"headOfHousehold");
    const s=US_COUNTRY_RULES.tax.calculateFederalTax(100000,"single");
    expect(h.tax).not.toBe(s.tax);
  });
  it("JP iDeCo current ceilings are category-aware",()=>{
    expect(JP_COUNTRY_RULES.retirement.getMonthlyContributionLimit("firstInsured")).toBe(68000);
    expect(JP_COUNTRY_RULES.retirement.getMonthlyContributionLimit("employeeNoCorporatePension")).toBe(23000);
    expect(JP_COUNTRY_RULES.retirement.getMonthlyContributionLimit("employeeWithCorporatePension",40000)).toBe(15000);
    expect(JP_COUNTRY_RULES.retirement.scheduledFrom20261201.effectiveDate).toBe("2026-12-01");
  });
  it("CA RRSP supports NOA/PA/PAR/PSPA and TFSA cumulative is not personal room",()=>{
    expect(CA_COUNTRY_RULES.investment.getRrspRoom(100000,{rrspDeductionLimitFromNoa:12345})).toBe(12345);
    expect(CA_COUNTRY_RULES.investment.getRrspRoom(100000,{unusedRrspDeductionRoom:5000,pensionAdjustment:3000,pensionAdjustmentReversal:1000,netPastServicePensionAdjustment:500})).toBe(20500);
    expect(CA_COUNTRY_RULES.investment.limits.tfsaCumulativeRoom2026).toBeUndefined();
    expect(CA_COUNTRY_RULES.investment.limits.tfsaMaximumPossibleIfEligibleSince2009).toBe(109000);
  });
  it("all five countries expose their own verified-as-of date",()=>{
    expect(JP_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-17");
    expect(US_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-17");
    expect(GB_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-21");
    expect(CA_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-17");
    expect(AU_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-17");
  });
});
