import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 32 — GB Pension Credit child additions", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("applies the higher pre-6-Apr-2017 rate to the first child only", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      firstChildrenBornBefore2017: 2,
      otherChildren: 1,
    });
    expect(r.childExtraWeekly).toBe(221.03);
    expect(r.appropriateAmountWeekly).toBe(459.03);
  });

  it("adds lower and higher disabled-child amounts on top of the child amount", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      otherChildren: 2,
      disabledChildrenLower: 1,
      disabledChildrenHigher: 1,
    });
    expect(r.childExtraWeekly).toBe(296.35);
    expect(r.appropriateAmountWeekly).toBe(534.35);
  });

  it("keeps negative or fractional child counts from creating phantom children", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      firstChildrenBornBefore2017: -1,
      otherChildren: 1.9,
    });
    expect(r.childExtraWeekly).toBe(69.98);
  });
});
