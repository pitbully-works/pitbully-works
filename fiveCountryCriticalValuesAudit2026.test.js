import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("5-country critical statutory values audit - 2026", () => {
  it("JP preserves the 2026 NISA annual and lifetime limits", () => {
    const inv = JP_COUNTRY_RULES.investment;
    expect(inv.annualInstallmentLimit).toBe(1200000);
    expect(inv.annualGrowthLimit).toBe(2400000);
    expect(inv.taxFreeInvestmentLimit).toBe(18000000);
  });

  it("US preserves the 2026 401(k), IRA and standard-deduction anchors", () => {
    const inv = US_COUNTRY_RULES.investment;
    const tax = US_COUNTRY_RULES.tax;
    expect(inv.limits2026.k401.employeeDeferral).toBe(24500);
    expect(inv.limits2026.ira.contribution).toBe(7500);
    expect(tax.standardDeduction2026.single).toBe(16100);
  });

  it("GB preserves the ISA and pension annual-allowance anchors", () => {
    const inv = GB_COUNTRY_RULES.investment;
    expect(inv.limits.isaAnnualAllowance).toBe(20000);
    expect(inv.limits.pensionAnnualAllowance).toBe(60000);
  });

  it("CA preserves TFSA/RRSP and 2026 OAS/GIS anchors", () => {
    const inv = CA_COUNTRY_RULES.investment;
    const ret = CA_COUNTRY_RULES.retirement;
    expect(inv.limits.tfsaAnnualLimit).toBe(7000);
    expect(inv.limits.rrspIncomePercent).toBeCloseTo(0.18, 8);
    expect(ret.oas.maxMonthly65to74).toBeCloseTo(751.97, 2);
    expect(ret.gis.single.maxMonthly).toBeCloseTo(1123.17, 2);
  });

  it("AU preserves Super, Age Pension and resident-tax anchors", () => {
    const inv = AU_COUNTRY_RULES.investment;
    const ret = AU_COUNTRY_RULES.retirement;
    const tax = AU_COUNTRY_RULES.tax;
    expect(inv.limits.concessionalCap).toBe(32500);
    expect(ret.agePension.qualifyingAge).toBe(67);
    expect(tax.incomeTax.taxFreeThreshold).toBe(18200);
    expect(tax.incomeTax.bands[1].rate).toBeCloseTo(0.15, 8);
  });

  it("keeps the five countries on materially different statutory regimes", () => {
    expect(JP_COUNTRY_RULES.investment.taxFreeInvestmentLimit).not.toBe(
      US_COUNTRY_RULES.investment.limits2026.k401.employeeDeferral
    );
    expect(GB_COUNTRY_RULES.investment.limits.isaAnnualAllowance).not.toBe(
      CA_COUNTRY_RULES.investment.limits.tfsaAnnualLimit
    );
    expect(AU_COUNTRY_RULES.investment.limits.concessionalCap).not.toBe(
      GB_COUNTRY_RULES.investment.limits.pensionAnnualAllowance
    );
    expect(US_COUNTRY_RULES.retirement.socialSecurity.fullRetirementAge).toBe(67);
  });
});
