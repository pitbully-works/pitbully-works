import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 34 — GB Pension Credit disabled-child boundary", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("does not create disabled-child additions when no child or QYP is included", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      disabledChildrenLower: 2,
      disabledChildrenHigher: 3,
    });
    expect(r.childExtraWeekly).toBe(0);
    expect(r.appropriateAmountWeekly).toBe(238);
  });

  it("caps disabled-child additions to the number of included children", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      otherChildren: 2,
      disabledChildrenLower: 5,
    });
    expect(r.childExtraWeekly).toBeCloseTo((69.98 * 2) + (37.93 * 2), 10);
  });

  it("prevents one child from receiving both lower and higher disabled-child additions", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      otherChildren: 1,
      disabledChildrenLower: 1,
      disabledChildrenHigher: 1,
    });
    expect(r.childExtraWeekly).toBeCloseTo(69.98 + 118.46, 10);
  });
});
