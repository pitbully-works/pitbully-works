import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 30 — GB Pension Credit Guarantee Credit extras", () => {
  const ret = GB_COUNTRY_RULES.retirement;
  const extras = ret.pensionCredit.guaranteeCreditExtraAmounts;

  it("pins the 2026/27 severe disability and carer rates", () => {
    expect(extras.severeDisabilityWeekly).toBe(86.05);
    expect(extras.severeDisabilityCoupleBothQualifyWeekly).toBe(172.10);
    expect(extras.carerWeeklyPerQualifyingPartner).toBe(48.15);
  });

  it("pins the 2026/27 child additions", () => {
    expect(extras.childFirstBornBefore2017Weekly).toBe(81.07);
    expect(extras.childOtherWeekly).toBe(69.98);
    expect(extras.disabledChildLowerWeekly).toBe(37.93);
    expect(extras.disabledChildHigherWeekly).toBe(118.46);
  });

  it("adds one severe-disability amount for a qualifying single claimant", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single", severeDisabilityQualifiers: 1,
    });
    expect(r.standardMinimumGuaranteeWeekly).toBe(238);
    expect(r.severeDisabilityExtraWeekly).toBe(86.05);
    expect(r.appropriateAmountWeekly).toBe(324.05);
  });

  it("adds the double severe-disability amount when both partners qualify", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "couple", severeDisabilityQualifiers: 2,
    });
    expect(r.severeDisabilityExtraWeekly).toBe(172.10);
    expect(r.appropriateAmountWeekly).toBe(535.35);
  });

  it("allows the carer addition for each qualifying partner", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "couple", carerQualifiers: 2,
    });
    expect(r.carerExtraWeekly).toBe(96.30);
    expect(r.appropriateAmountWeekly).toBe(459.55);
  });

  it("adds child, disability-child, housing and transitional amounts", () => {
    const r = ret.calculatePensionCreditGuaranteeAppropriateAmount({
      status: "single",
      firstChildrenBornBefore2017: 1,
      otherChildren: 1,
      disabledChildrenLower: 1,
      disabledChildrenHigher: 1,
      eligibleHousingCostsWeekly: 25,
      transitionalAdditionalAmountWeekly: 10,
    });
    expect(r.childExtraWeekly).toBe(307.44);
    expect(r.housingExtraWeekly).toBe(25);
    expect(r.transitionalAdditionalAmountWeekly).toBe(10);
    expect(r.appropriateAmountWeekly).toBe(580.44);
  });
});
