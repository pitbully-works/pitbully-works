import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 33 — GB Pension Credit carer addition boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("caps a single claimant at one carer additional amount", () => {
    const r = ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 0,
      carerQualifiers: 3,
    });
    expect(r.guaranteeWeekly).toBe(286.15);
  });

  it("caps a couple at exactly two carer additional amounts", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "couple",
      carerQualifiers: 3,
    });
    expect(r.carerExtraWeekly).toBe(96.30);
    expect(r.appropriateAmountWeekly).toBe(459.55);
  });

  it("keeps negative or fractional carer counts from creating phantom additions", () => {
    expect(ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 0,
      carerQualifiers: -2,
    }).guaranteeWeekly).toBe(238);

    expect(ret.calculatePensionCreditGuarantee({
      status: "single",
      weeklyIncome: 0,
      carerQualifiers: 1.9,
    }).guaranteeWeekly).toBe(286.15);
  });
});
