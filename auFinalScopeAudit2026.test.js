import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU final scope audit 2026-08-23", () => {
  const rules = AU_COUNTRY_RULES;
  const inv = rules.investment;
  const ret = rules.retirement;
  const health = rules.healthcare;
  const tax = rules.tax;
  const estate = rules.estate;

  it("keeps every major AU section implemented and tied to the 2026-27 ruleset", () => {
    for (const section of [inv, ret, health, tax, estate]) {
      expect(section.implemented).toBe(true);
      expect(section.effectiveTaxYear).toMatch(/2026-27/);
      expect(section.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(rules.meta.verifiedAsOf).toBe("2026-08-23");
  });

  it("protects the core AU calculations added during the final audit", () => {
    expect(typeof inv.calculateFhssReleasableContributions).toBe("function");
    expect(typeof ret.getWorkBonusFortnightlyAssessment).toBe("function");
    expect(typeof ret.getRealEstateAssessableIncomeAnnual).toBe("function");
    expect(typeof ret.getAgePensionResidenceEligibility).toBe("function");
    expect(typeof ret.getOverseasAgePensionPortabilityFactor).toBe("function");
    expect(typeof health.getSupportAtHomeAnnualContribution).toBe("function");
    expect(typeof tax.calculateForeignResidentIncomeTax).toBe("function");
    expect(typeof tax.calculateUnusedSaptoTransferFromSpouse).toBe("function");
  });

  it("does not regress completed features back into generic unimplemented labels", () => {
    const text = [
      ...(inv.notImplemented || []),
      ...(ret.notImplemented || []),
      ...(health.notImplemented || []),
      ...(tax.notImplemented || []),
    ].join(" / ");

    expect(text).not.toMatch(/非居住者税率.*未実装/);
    expect(text).not.toMatch(/Work Bonus.*隔週単位.*未実装/);
    expect(text).not.toMatch(/SAPTO.*spouse transfer.*未実装/i);
    expect(text).not.toMatch(/投資用不動産の実収入.*未実装/);
    expect(text).not.toMatch(/Support at Home.*拠出率.*未実装/);
  });

  it("leaves only explicit individual-assessment or exceptional-case boundaries for manual handling", () => {
    const text = [
      ...(inv.notImplemented || []),
      ...(ret.notImplemented || []),
      ...(health.notImplemented || []),
      ...(tax.notImplemented || []),
      ...(estate.notImplemented || []),
    ].join(" / ");

    expect(text).toMatch(/完全自動判定|最終判定|利用者確認|未自動化|未実装/);
    expect(text).toMatch(/Transitional rate pension/);
    expect(text).toMatch(/国際社会保障協定/);
    expect(text).toMatch(/Residential aged care/);
    expect(text).toMatch(/income stream/);
  });
});
