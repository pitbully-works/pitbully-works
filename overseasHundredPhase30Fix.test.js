import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("phase 30 regression — Pension Credit base amount source", () => {
  const ret = GB_COUNTRY_RULES.retirement;

  it("reads the 2026/27 standard minimum guarantee from the live Pension Credit structure", () => {
    const single = ret.calculatePensionCreditGuaranteeAppropriateAmount({ status: "single" });
    const couple = ret.calculatePensionCreditGuaranteeAppropriateAmount({ status: "couple" });

    expect(single.standardMinimumGuaranteeWeekly).toBe(
      ret.pensionCredit.standardMinimumGuaranteeWeekly.single,
    );
    expect(couple.standardMinimumGuaranteeWeekly).toBe(
      ret.pensionCredit.standardMinimumGuaranteeWeekly.couple,
    );
    expect(single.standardMinimumGuaranteeWeekly).toBe(238);
    expect(couple.standardMinimumGuaranteeWeekly).toBe(363.25);
  });
});
