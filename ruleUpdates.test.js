import { describe, expect, it } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { BUILTIN_RULE_UPDATES, applyApprovedRuleUpdates, normalizeRuleUpdateState } from "./utils/ruleUpdates.js";

describe("rule update center", () => {
  it("does not change calculations before approval", () => {
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, normalizeRuleUpdateState({}), new Date("2027-01-01"));
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(23000);
  });

  it("approved future rule stays inactive before effective date", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-IDECO-2026-12-01": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-11-30T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(23000);
  });

  it("approved rule applies on/after effective date", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-IDECO-2026-12-01": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-12-01T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.firstInsured).toBe(75000);
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(62000);
    expect(rules.retirement.currentMonthlyLimits.corporatePensionCombinedCeiling).toBe(62000);
  });

  it("NISA未成年者枠は承認しても2027年までは有効化しない", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-NISA-2027-MINOR-TSUMITATE": true } });
    const before = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-12-31T12:00:00"));
    expect(before.investment.minorTsumitate.annualLimit).toBe(0);
    const active = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2027-01-01T12:00:00"));
    expect(active.investment.minorTsumitate.eligibleFromAge).toBe(0);
    expect(active.investment.minorTsumitate.annualLimit).toBe(600000);
    expect(active.investment.minorTsumitate.lifetimeLimit).toBe(6000000);
    expect(active.investment.annualInstallmentLimit).toBe(1200000);
    expect(active.investment.annualGrowthLimit).toBe(2400000);
    expect(active.investment.taxFreeInvestmentLimit).toBe(18000000);
  });

  it("公的年金の2026年度改定は承認後に参照データへ反映する", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-PENSION-2026-ANNUAL-REVISION": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-08-21T12:00:00"));
    expect(rules.publicPension.annualRevision.fiscalYear).toBe(2026);
    expect(rules.publicPension.annualRevision.basicPensionPct).toBe(1.9);
    expect(rules.publicPension.annualRevision.employeesEarningsRelatedPct).toBe(2);
    expect(rules.publicPension.annualRevision.macroSlideBasicPct).toBe(-0.2);
    expect(rules.publicPension.annualRevision.basicPensionFullMonthly).toBe(70608);
  });
});
