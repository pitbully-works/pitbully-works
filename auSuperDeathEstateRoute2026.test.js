import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Super death benefit: direct vs deceased-estate route", () => {
  const calc = (x) => AU_COUNTRY_RULES.estate.calculateSuperDeathBenefitLumpSum(x);
  it("keeps a death-benefits dependant lump sum tax free through either route", () => {
    for (const paymentRoute of ["direct", "estate"]) {
      expect(calc({ taxedElement: 100000, untaxedElement: 50000, isDeathBenefitsDependant: true, paymentRoute }).tax).toBe(0);
    }
  });
  it("direct non-dependant can include the 2% Medicare levy", () => {
    const r = calc({ taxedElement: 100000, untaxedElement: 50000, isDeathBenefitsDependant: false, paymentRoute: "direct", includeMedicareLevy: true });
    expect(r.tax).toBeCloseTo(100000 * .17 + 50000 * .32, 8);
  });
  it("deceased-estate route excludes Medicare levy from this estimate", () => {
    const r = calc({ taxedElement: 100000, untaxedElement: 50000, isDeathBenefitsDependant: false, paymentRoute: "estate", includeMedicareLevy: true });
    expect(r.tax).toBeCloseTo(100000 * .15 + 50000 * .30, 8);
    expect(r.medicareLevyApplied).toBe(false);
  });
  it("tax-free component remains tax free for a non-dependant estate beneficiary", () => {
    const a = calc({ taxFreeComponent: 80000, taxedElement: 100000, isDeathBenefitsDependant: false, paymentRoute: "estate" });
    const b = calc({ taxFreeComponent: 0, taxedElement: 100000, isDeathBenefitsDependant: false, paymentRoute: "estate" });
    expect(a.tax).toBe(b.tax);
  });
  it("reports the selected route", () => {
    expect(calc({ paymentRoute: "estate" }).paymentRoute).toBe("estate");
    expect(calc({ paymentRoute: "direct" }).paymentRoute).toBe("direct");
  });
  it("defaults unknown routes safely to direct", () => {
    expect(calc({ paymentRoute: "x" }).paymentRoute).toBe("direct");
  });
});
