import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("5-country critical statutory values audit - 2026", () => {
  it("JP preserves the 2026 NISA annual and lifetime limits", () => {
    const inv = JP_COUNTRY_RULES.investment;
    expect(inv.nisa.tsumitateAnnualLimit).toBe(1200000);
    expect(inv.nisa.growthAnnualLimit).toBe(2400000);
    expect(inv.nisa.annualLimit).toBe(3600000);
    expect(inv.nisa.lifetimeLimit).toBe(18000000);
  });

  it("US preserves the 2026 401(k), IRA and standard-deduction anchors", () => {
    const inv = US_COUNTRY_RULES.investment;
    const tax = US_COUNTRY_RULES.tax;
    expect(inv.retirementAccounts["401k"].employeeAnnualLimit).toBe(24500);
    expect(inv.retirementAccounts.ira.annualLimit).toBe(7500);
    expect(tax.standardDeduction.single).toBe(16100);
  });

  it("GB preserves the ISA and pension annual-allowance anchors", () => {
    const inv = GB_COUNTRY_RULES.investment;
    expect(inv.isa.annualAllowance).toBe(20000);
    expect(inv.pension.annualAllowance).toBe(60000);
  });

  it("CA preserves TFSA/RRSP identity and 2026 pension anchors", () => {
    const inv = CA_COUNTRY_RULES.investment;
    const ret = CA_COUNTRY_RULES.retirement;
    expect(inv.tfsa.annualLimit2026).toBeGreaterThan(0);
    expect(inv.rrsp.contributionRate).toBeCloseTo(0.18, 8);
    expect(ret.oas).toBeTruthy();
    expect(ret.gis).toBeTruthy();
  });

  it("AU preserves Super, Age Pension and tax anchors", () => {
    const inv = AU_COUNTRY_RULES.investment;
    const ret = AU_COUNTRY_RULES.retirement;
    const tax = AU_COUNTRY_RULES.tax;
    expect(inv.super.concessionalCap).toBeGreaterThan(0);
    expect(ret.agePension.qualifyingAge).toBe(67);
    expect(tax.residentRates).toBeTruthy();
  });

  it("keeps the five countries on materially different statutory regimes", () => {
    expect(JP_COUNTRY_RULES.investment.nisa.lifetimeLimit).not.toBe(
      US_COUNTRY_RULES.investment.retirementAccounts["401k"].employeeAnnualLimit
    );
    expect(GB_COUNTRY_RULES.investment.isa.annualAllowance).not.toBe(
      CA_COUNTRY_RULES.investment.tfsa.annualLimit2026
    );
    expect(AU_COUNTRY_RULES.retirement.agePension.qualifyingAge).not.toBe(
      US_COUNTRY_RULES.retirement.fullRetirementAge
    );
  });
});
