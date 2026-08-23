import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 35 — GB Pension Credit severe-disability boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("caps a single claimant at one severe-disability additional amount", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      severeDisabilityQualifiers: 5,
    });
    expect(r.severeDisabilityExtraWeekly).toBe(86.05);
    expect(r.appropriateAmountWeekly).toBe(324.05);
  });

  it("caps a couple at the both-qualify severe-disability amount", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "couple",
      severeDisabilityQualifiers: 2,
    });
    expect(r.severeDisabilityExtraWeekly).toBe(172.10);
    expect(r.appropriateAmountWeekly).toBe(535.35);
  });

  it("keeps negative or fractional qualifier counts from creating phantom additions", () => {
    expect(ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      severeDisabilityQualifiers: -1,
    }).severeDisabilityExtraWeekly).toBe(0);

    expect(ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "couple",
      severeDisabilityQualifiers: 1.9,
    }).severeDisabilityExtraWeekly).toBe(86.05);
  });
});
