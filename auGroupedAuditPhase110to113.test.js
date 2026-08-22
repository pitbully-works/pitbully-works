import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 110-113 - Support at Home July 2026", () => {
  const h = AU_COUNTRY_RULES.healthcare;

  it("uses the July 2026 standard full-pensioner rates", () => {
    const r = h.getSupportAtHomeContributionRates({ status: "fullPensioner" });
    expect(r).toEqual({ clinical: 0, independence: 0.05, everydayLiving: 0.175 });
  });

  it("uses the self-funded retiree rates and keeps clinical care at zero", () => {
    const annual = h.getSupportAtHomeAnnualContribution({
      clinicalAnnual: 5000,
      independenceAnnual: 10000,
      everydayLivingAnnual: 10000,
      status: "selfFundedRetiree",
    });
    expect(annual).toBeCloseTo(13000, 8);
  });

  it("uses conservative statutory maxima for part pensioners when assessed rates are absent", () => {
    const r = h.getSupportAtHomeContributionRates({ status: "partPensionerOrCshc" });
    expect(r.independence).toBe(0.50);
    expect(r.everydayLiving).toBe(0.80);
  });

  it("honours the no-worse-off schedule and lifetime cap", () => {
    expect(h.getSupportAtHomeContributionRates({
      status: "fullPensioner",
      noWorseOff: true,
    })).toEqual({ clinical: 0, independence: 0, everydayLiving: 0 });

    const remaining = h.getSupportAtHomeAnnualContribution({
      everydayLivingAnnual: 100000,
      status: "selfFundedRetiree",
      noWorseOff: true,
      priorLifetimeContributions: 86000,
    });
    expect(remaining).toBeCloseTo(185.23, 8);
  });
});
