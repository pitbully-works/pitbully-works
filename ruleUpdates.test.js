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
});
