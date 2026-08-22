import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 21 — Canada RESP and RDSP batch", () => {
  const inv = CA_COUNTRY_RULES.investment;

  it("protects RESP 2026 limits and CESG thresholds", () => {
    expect(inv.resp.lifetimeContributionLimit).toBe(50000);
    expect(inv.resp.cesgLifetimeMax).toBe(7200);
    expect(inv.resp.cesg2026LowIncomeMax).toBe(58523);
    expect(inv.resp.cesg2026MiddleIncomeMax).toBe(117045);
  });

  it("calculates low/middle/high income CESG", () => {
    expect(inv.estimateRespCesg({annualContribution:2500, adjustedFamilyNetIncome:50000, beneficiaryAge:10})).toBe(600);
    expect(inv.estimateRespCesg({annualContribution:2500, adjustedFamilyNetIncome:80000, beneficiaryAge:10})).toBe(550);
    expect(inv.estimateRespCesg({annualContribution:2500, adjustedFamilyNetIncome:150000, beneficiaryAge:10})).toBe(500);
  });

  it("enforces RESP lifetime/age rules and CLB thresholds", () => {
    expect(inv.getRespLifetimeRemaining(49000)).toBe(1000);
    expect(inv.estimateRespCesg({annualContribution:2500, adjustedFamilyNetIncome:50000, beneficiaryAge:18})).toBe(0);
    expect(inv.isRespClbIncomeEligible2026(58523,3)).toBe(true);
    expect(inv.isRespClbIncomeEligible2026(58524,3)).toBe(false);
    expect(inv.isRespClbIncomeEligible2026(66035,4)).toBe(true);
  });

  it("protects RDSP 2026 core limits", () => {
    expect(inv.rdsp.lifetimeContributionLimit).toBe(200000);
    expect(inv.rdsp.contributionLastAge).toBe(59);
    expect(inv.rdsp.grantLastAge).toBe(49);
    expect(inv.rdsp.grantAnnualMax).toBe(3500);
    expect(inv.rdsp.grantLifetimeMax).toBe(70000);
    expect(inv.rdsp.bondAnnualMax).toBe(1000);
    expect(inv.rdsp.bondLifetimeMax).toBe(20000);
  });

  it("calculates RDSP grant and bond", () => {
    expect(inv.estimateRdspGrant2026({contribution:1500, adjustedFamilyNetIncome:100000, beneficiaryAge:30})).toBe(3500);
    expect(inv.estimateRdspGrant2026({contribution:1500, adjustedFamilyNetIncome:150000, beneficiaryAge:30})).toBe(1000);
    expect(inv.estimateRdspBond2026({adjustedFamilyNetIncome:38237, beneficiaryAge:30})).toBe(1000);
    expect(inv.estimateRdspBond2026({adjustedFamilyNetIncome:58523, beneficiaryAge:30})).toBe(0);
  });

  it("enforces RDSP lifetime ceilings", () => {
    expect(inv.getRdspLifetimeRemaining(199000)).toBe(1000);
    expect(inv.estimateRdspGrant2026({contribution:1500, adjustedFamilyNetIncome:100000, beneficiaryAge:30, lifetimeGrantReceived:69500})).toBe(500);
    expect(inv.estimateRdspBond2026({adjustedFamilyNetIncome:20000, beneficiaryAge:30, lifetimeBondReceived:19750})).toBe(250);
  });
});
