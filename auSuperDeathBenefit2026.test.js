import { describe, expect, it } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const estate = AU_COUNTRY_RULES.estate;

describe("AU 2026-27 Super death-benefit lump-sum estimator", () => {
  it("records that Australia has an estate calculation section and official source", () => {
    expect(estate.implemented).toBe(true);
    expect(estate.sourceUrl).toContain("ato.gov.au");
  });

  it("treats a lump sum to a death benefits dependant as tax free", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ taxFreeComponent: 20000, taxedElement: 150000, untaxedElement: 30000, isDeathBenefitsDependant: true });
    expect(r.gross).toBe(200000);
    expect(r.tax).toBe(0);
    expect(r.net).toBe(200000);
  });

  it("keeps the tax-free component tax free for a non-dependant", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ taxFreeComponent: 100000, taxedElement: 0, untaxedElement: 0, isDeathBenefitsDependant: false });
    expect(r.tax).toBe(0);
  });

  it("uses 15% plus 2% Medicare levy for a non-dependant taxed element", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ taxedElement: 100000, isDeathBenefitsDependant: false, includeMedicareLevy: true });
    expect(r.tax).toBeCloseTo(17000, 8);
    expect(r.net).toBeCloseTo(83000, 8);
  });

  it("uses 30% plus 2% Medicare levy for a non-dependant untaxed element", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ untaxedElement: 100000, isDeathBenefitsDependant: false, includeMedicareLevy: true });
    expect(r.tax).toBeCloseTo(32000, 8);
  });

  it("can exclude Medicare levy for scenarios where it should not be modelled", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ taxedElement: 100000, untaxedElement: 100000, isDeathBenefitsDependant: false, includeMedicareLevy: false });
    expect(r.tax).toBeCloseTo(45000, 8);
  });

  it("sanitises negative components to zero", () => {
    const r = estate.calculateSuperDeathBenefitLumpSum({ taxFreeComponent: -1, taxedElement: -2, untaxedElement: -3, isDeathBenefitsDependant: false });
    expect(r.gross).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.net).toBe(0);
  });
});
