import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const ret = CA_COUNTRY_RULES.retirement;

describe("CA 2026 GIS / Allowance / CPP post-retirement benefit", () => {
  it("uses the published Jul-Sep 2026 GIS maxima and cut-offs", () => {
    expect(ret.getGisRule("single")).toEqual({ maxMonthly: 1123.17, incomeCutoff: 22800 });
    expect(ret.getGisRule("spouseReceivesOas")).toEqual({ maxMonthly: 676.09, incomeCutoff: 30096 });
    expect(ret.getGisRule("spouseReceivesAllowance")).toEqual({ maxMonthly: 676.09, incomeCutoff: 42144 });
    expect(ret.getGisRule("spouseNoOasOrAllowance")).toEqual({ maxMonthly: 1123.17, incomeCutoff: 54624 });
  });

  it("treats the GIS income cut-off as a strict less-than threshold", () => {
    expect(ret.isGisIncomeEligible("single", 22799.99)).toBe(true);
    expect(ret.isGisIncomeEligible("single", 22800)).toBe(false);
  });

  it("stores Allowance and survivor published maxima", () => {
    expect(ret.gis.allowance).toMatchObject({ maxMonthly: 1428.06, incomeCutoff: 42144, minAge: 60, maxAge: 64 });
    expect(ret.gis.allowanceSurvivor).toMatchObject({ maxMonthly: 1702.34, incomeCutoff: 30696, minAge: 60, maxAge: 64 });
  });

  it("models the 2026 maximum CPP post-retirement benefit at age 65", () => {
    expect(ret.cppPostRetirementBenefit.maxMonthlyAt65).toBe(54.69);
    expect(ret.getCppPostRetirementBenefitAnnual(1)).toBeCloseTo(54.69 * 12, 2);
    expect(ret.getCppPostRetirementBenefitAnnual(0.5)).toBeCloseTo(54.69 * 6, 2);
  });

  it("keeps exact income-dependent GIS calculation explicitly out of scope", () => {
    const text = ret.notImplemented.join(" / ");
    expect(text).toMatch(/GIS\/Allowance/);
    expect(text).toMatch(/正確な支給額/);
    expect(text).not.toMatch(/CPP post-retirement benefit/);
  });
});
